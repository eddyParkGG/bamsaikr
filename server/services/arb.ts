// Compute the premium between the two markets and the net arbitrage left after costs.
// The premium does not revert to 0: during the regular session it sits at a level that drifts month to month
// (Sep 2026 around -0.5%, Oct +0.95%, Nov +0.5%). So the opportunity is the gap from the usual level
// (median over the last 5 trading days' regular-session hours), not the raw premium.
import { COMPARABLE, type Asset } from '../../shared/assets.js'
import { sessionAt, type Session } from '../../shared/session.js'
import { getPerpBook, getPerpCandles, getPerpCtxs } from '../sources/hyperliquid.js'
import { krxHolidays, krxOrderbook, krxQuote } from '../sources/krx.js'
import { getUsdcKrw, getUsdcKrwCandles, rateAt } from '../sources/upbit.js'
import { cached } from '../lib/cache.js'
import { kstDateKey } from '../../shared/session.js'
import { chartSeries } from './series.js'

// Cost assumptions (bp = 0.01%). Can be overridden via API query
export interface CostInput {
  stockFeeBps: number // broker commission (one way)
  stockTaxBps: number // securities transaction tax + special rural tax on sells (KOSPI 0.20% in 2026)
  perpFeeBps: number // HL taker. HIP-3 base 0.045%×2 (deployerFeeScale 1.0)×0.1 (growth mode) = 0.009%
  fxFeeBps: number // Upbit KRW-market fee (one way)
  leverage: number // perp margin multiple. Only the margin needs FX conversion
  holdHours: number // expected holding time until the premium closes (for funding)
  notionalKrw: number // trade size per leg: both order books are walked for this amount
  lagSec: number // time between the two orders hitting (price can move in between)
}

export const DEFAULT_COST: CostInput = { stockFeeBps: 1.5, stockTaxBps: 20, perpFeeBps: 0.9, fxFeeBps: 5, leverage: 2, holdHours: 1, notionalKrw: 10_000_000, lagSec: 3 }

export type Direction = 'perp_short_stock_long' | 'perp_long_stock_short'

export interface ArbSnapshot {
  asset: Asset['id']
  name: string
  session: Session
  /** live: domestic market open, directly comparable. gap: domestic market closed, compared to last close */
  mode: 'live' | 'gap'
  krx: { price: number; prevClose: number; changePct: number; high: number; low: number; open: number; tradeValue: number; source: string }
  perp: { coin: string; mid: number; mark: number; oracle: number; changePct: number; fundingHourly: number; openInterest: number; volume24hUsd: number; maxLeverage: number }
  fx: { rate: number; bid: number; ask: number; source: 'upbit:KRW-USDC' } | null
  perpKrw: number
  premiumPct: number
  /** Usual premium: median of hourly regular-session premiums over the last 5 trading days */
  normalPremiumPct: number
  /** premium − usual premium: what could close if the gap returns to its usual level */
  deviationPct: number
  net: {
    direction: Direction
    grossPct: number
    /** %. slippage: fill prices vs mid/last on both legs. latency: price move while the second order lands */
    costs: { stock: number; perp: number; fx: number; funding: number; slippage: number; latency: number }
    netPct: number
    netKrwPer10m: number // expected net profit per 10M KRW
    /** Requested size per leg (cost.notionalKrw) and the expected net on what the books can fill of it */
    notionalKrw: number
    netKrw: number
    /** Volume-weighted fill prices (KRW, per perp unit) for that size; null when a book was unavailable */
    fills: { perpKrw: number; stockKrw: number; perpSlippagePct: number; stockSlippagePct: number } | null
    /** true when the visible book on either side can't fill notionalKrw; maxNotionalKrw is what it can */
    depthLimited: boolean
    maxNotionalKrw: number | null
    /** Stdev of 1-minute returns of the perp in KRW over the last 60 minutes (%), the base of costs.latency */
    vol1mPct: number | null
    executable: boolean
    note: string
  }
  updatedAt: number
}

const pct = (x: number) => Math.round(x * 10000) / 10000

export interface Level {
  px: number
  sz: number
}

/** Visible notional (px × sz) on one side of a book */
export const bookNotional = (levels: Level[]) => levels.reduce((s, l) => s + l.px * l.sz, 0)

/**
 * Walk one side of a book (best level first) for `notional` in price units.
 * Returns the volume-weighted fill price and how much was filled; null when nothing can fill
 */
export function walkBook(levels: Level[], notional: number): { avgPx: number; filled: number; full: boolean } | null {
  let left = notional
  let qty = 0
  let cost = 0
  for (const l of levels) {
    if (left <= 0) break
    const take = Math.min(l.sz, left / l.px)
    qty += take
    cost += take * l.px
    left -= take * l.px
  }
  if (qty <= 0) return null
  return { avgPx: cost / qty, filled: cost, full: left <= notional * 1e-9 }
}

/** Stdev of 1-minute log returns over the last `n` returns (fraction); null with fewer than 10 */
export function minuteVol(closes: number[], n = 60): number | null {
  const c = closes.filter((v) => v > 0).slice(-(n + 1))
  const r = c.slice(1).map((v, i) => Math.log(v / c[i]))
  if (r.length < 10) return null
  const m = r.reduce((s, v) => s + v, 0) / r.length
  return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / (r.length - 1))
}

/** Cost of the gap between the two orders: 1-minute volatility scaled to `lagSec` (random walk) */
export const latencyCost = (vol1m: number, lagSec: number) => vol1m * Math.sqrt(Math.max(0, lagSec) / 60)

/**
 * Executable gross after slippage: sell the perp / buy the stock at their fill prices (or the reverse),
 * measured against the usual premium. `slippage` = how much the fills give up vs mid/last (fraction, ≥ 0 normally)
 */
export function execGross(p: { perpMid: number; stockLast: number; perpFill: number; stockFill: number; normal: number; direction: Direction }) {
  const s = p.direction === 'perp_short_stock_long' ? 1 : -1
  const midPrem = p.perpMid / p.stockLast - 1
  const fillPrem = p.perpFill / p.stockFill - 1
  return { gross: s * (fillPrem - p.normal), slippage: s * (midPrem - fillPrem) }
}

/** 1-minute closes of the perp in KRW for the last ~70 minutes (Hyperliquid + Upbit 1m, both already cached) */
function perpKrwMinutes(asset: Asset): Promise<number[]> {
  return cached(`arb:vol:${asset.id}`, 60_000, async () => {
    const since = Math.floor((Date.now() - 70 * 60_000) / 600_000) * 600_000 // 10-min buckets keep cache keys few
    const [bars, fx] = await Promise.all([getPerpCandles(asset.perp, '1m', since), asset.fx ? getUsdcKrwCandles(1, since) : null])
    return bars.map((k) => k.c * (fx ? (rateAt(fx, k.t + 59_999) ?? NaN) : 1)).filter(Number.isFinite)
  })
}

/** KRX book cached a few seconds: arb runs for every asset on every refresh, and Toss calls are rate-limited */
const krxBook = (asset: Asset) => cached(`arb:krxbook:${asset.id}`, 3000, () => krxOrderbook(asset))

/** Usual premium (fraction) for an asset; 0 when there is no history */
function normalPremium(asset: Asset, holidays: ReadonlySet<string>): Promise<number> {
  return cached(`arb:normal:${asset.id}`, 10 * 60_000, async () => {
    const s = await chartSeries(asset, '1h')
    const pts = s.premium.filter((p) => p.live && sessionAt(p.t, holidays) === 'regular')
    const days = [...new Set(pts.map((p) => kstDateKey(p.t)))].slice(-5)
    const vs = pts.filter((p) => days.includes(kstDateKey(p.t))).map((p) => p.v).sort((a, b) => a - b)
    return vs.length ? vs[vs.length >> 1] / 100 : 0
  })
}

export async function arbSnapshot(asset: Asset, cost: CostInput = DEFAULT_COST): Promise<ArbSnapshot> {
  const [ctxs, quote, fx, holidays, perpBook, stockBook, minutes] = await Promise.all([
    getPerpCtxs(),
    krxQuote(asset),
    asset.fx ? getUsdcKrw() : null,
    krxHolidays(),
    getPerpBook(asset.perp).catch(() => null),
    krxBook(asset).catch(() => null),
    perpKrwMinutes(asset).catch(() => []),
  ])
  const normal = await normalPremium(asset, holidays).catch(() => 0)
  const ctx = ctxs.get(asset.perp)
  if (!ctx) throw new Error(`perp 시세 없음: ${asset.perp}`)

  const now = Date.now()
  const session = sessionAt(now, holidays)
  const mid = ctx.midPx ?? ctx.markPx
  const perpKrw = asset.fx ? mid * fx!.rate : mid
  // When the domestic market is closed, the last trade (= close) is the reference
  const base = quote.price
  const premium = perpKrw / base - 1
  const mode = session === 'closed' ? 'gap' : 'live'

  const deviation = premium - normal
  const direction: Direction = deviation >= 0 ? 'perp_short_stock_long' : 'perp_long_stock_short'
  const stockCost = (cost.stockFeeBps * 2 + cost.stockTaxBps) / 10000
  const perpCost = (cost.perpFeeBps * 2) / 10000
  const spreadHalf = fx ? (fx.ask - fx.bid) / 2 / fx.rate : 0
  const fxCost = asset.fx ? ((cost.fxFeeBps / 10000 + spreadHalf) * 2) / cost.leverage : 0
  // Shorts receive positive funding, longs pay it
  const fundingCost = (direction === 'perp_short_stock_long' ? -1 : 1) * ctx.funding * cost.holdHours
  const gross = Math.abs(deviation)

  // Fill prices for the trade size: short perp hits the bids and the stock is bought at the asks (reverse for the other way).
  // Both legs are walked for the same KRW amount, capped at what the thinner visible book holds
  const short = direction === 'perp_short_stock_long'
  const rate = asset.fx ? fx!.rate : 1
  const perpSide = perpBook ? (short ? perpBook.bids : perpBook.asks).map((l) => ({ px: l.px * rate, sz: l.sz })) : []
  // KRX sizes are shares; one perp unit is `ratio` shares (prices are already per perp unit)
  const stockSide = stockBook ? (short ? stockBook.asks : stockBook.bids).map((l) => ({ px: l.px, sz: l.sz / asset.ratio })) : []
  const maxNotional = Math.min(bookNotional(perpSide), bookNotional(stockSide))
  const size = Math.min(cost.notionalKrw, maxNotional)
  const pf = size > 0 ? walkBook(perpSide, size) : null
  const sf = size > 0 ? walkBook(stockSide, size) : null
  const exec = pf && sf ? execGross({ perpMid: perpKrw, stockLast: base, perpFill: pf.avgPx, stockFill: sf.avgPx, normal, direction }) : null
  const slippage = exec?.slippage ?? 0
  const vol1m = minuteVol(minutes)
  const latency = vol1m == null ? 0 : latencyCost(vol1m, cost.lagSec)
  const netPct = gross - slippage - latency - stockCost - perpCost - fxCost - fundingCost
  const depthLimited = !!exec && maxNotional < cost.notionalKrw

  let executable = mode === 'live'
  let note = ''
  if (mode === 'gap') note = '국내 시장이 닫혀 있어서 지금은 주식 쪽 주문이 안 돼요. 다음 개장 때 벌어진 만큼 시가에 반영될 가능성이 커요.'
  else if (direction === 'perp_long_stock_short') {
    executable = false
    note = '주식을 빌려서 파는 건 개인이 하기 어려워요. 이미 갖고 있는 주식을 팔고 해외 시장에서 사는 방식으로만 가능해요.'
  } else if (asset.kind === 'adr') note = '미국 ADR과 국내 보통주는 바로 바꿀 수 없어서, 차이가 오래 유지될 수 있어요.'
  else note = '해외 가격이 평소보다 더 비싸요. 해외 시장에서 팔고 국내 주식을 사두면, 차이가 평소 수준으로 돌아올 때 그만큼 남아요.'
  if (netPct <= 0 || asset.kind !== 'stock') executable = false

  return {
    asset: asset.id,
    name: asset.name,
    session,
    mode,
    krx: { price: base, prevClose: quote.prevClose, changePct: quote.changePct, high: quote.high, low: quote.low, open: quote.open, tradeValue: quote.tradeValue, source: quote.source },
    perp: {
      coin: asset.perp,
      mid,
      mark: ctx.markPx,
      oracle: ctx.oraclePx,
      changePct: pct((mid / ctx.prevDayPx - 1) * 100),
      fundingHourly: ctx.funding,
      openInterest: ctx.openInterest,
      volume24hUsd: Math.round(ctx.dayNtlVlm),
      maxLeverage: ctx.maxLeverage,
    },
    fx: fx ? { rate: fx.rate, bid: fx.bid, ask: fx.ask, source: 'upbit:KRW-USDC' } : null,
    perpKrw: asset.fx ? Math.round(perpKrw) : pct(perpKrw),
    premiumPct: pct(premium * 100),
    normalPremiumPct: pct(normal * 100),
    deviationPct: pct(deviation * 100),
    net: {
      direction,
      grossPct: pct(gross * 100),
      costs: { stock: pct(stockCost * 100), perp: pct(perpCost * 100), fx: pct(fxCost * 100), funding: pct(fundingCost * 100), slippage: pct(slippage * 100), latency: pct(latency * 100) },
      netPct: pct(netPct * 100),
      netKrwPer10m: Math.round(netPct * 10_000_000),
      notionalKrw: cost.notionalKrw,
      netKrw: Math.round(netPct * (exec ? size : cost.notionalKrw)),
      fills:
        pf && sf
          ? { perpKrw: pct(pf.avgPx), stockKrw: pct(sf.avgPx), perpSlippagePct: pct((short ? 1 - pf.avgPx / perpKrw : pf.avgPx / perpKrw - 1) * 100), stockSlippagePct: pct((short ? sf.avgPx / base - 1 : 1 - sf.avgPx / base) * 100) }
          : null,
      depthLimited,
      maxNotionalKrw: exec ? Math.round(maxNotional) : null,
      vol1mPct: vol1m == null ? null : pct(vol1m * 100),
      executable,
      note,
    },
    updatedAt: now,
  }
}

export async function arbAll(cost?: CostInput) {
  const res = await Promise.allSettled(COMPARABLE.map((a) => arbSnapshot(a, cost)))
  return res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}
