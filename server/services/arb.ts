// 두 시장 괴리(프리미엄)와 비용 차감 후 실제 남는 차익 계산
import { ASSETS, type Asset } from '../../shared/assets.js'
import { sessionAt, type Session } from '../../shared/session.js'
import { getPerpCtxs } from '../sources/hyperliquid.js'
import { krxHolidays, krxQuote } from '../sources/krx.js'
import { getUsdcKrw } from '../sources/upbit.js'

// 비용 가정 (bp = 0.01%). API 쿼리로 덮어쓸 수 있음
export interface CostInput {
  stockFeeBps: number // 증권사 매매 수수료 (편도)
  stockTaxBps: number // 매도 시 증권거래세+농특세 (2026년 코스피 0.20%)
  perpFeeBps: number // HL taker. HIP-3 기본 0.045%×2(deployerFeeScale 1.0)×0.1(growth mode) = 0.009%
  fxFeeBps: number // 업비트 원화마켓 수수료 (편도)
  leverage: number // perp 증거금 배수. 환전은 증거금만큼만 필요
  holdHours: number // 괴리가 닫힐 때까지 예상 보유 시간 (펀딩비 계산용)
}

export const DEFAULT_COST: CostInput = { stockFeeBps: 1.5, stockTaxBps: 20, perpFeeBps: 0.9, fxFeeBps: 5, leverage: 2, holdHours: 6 }

export type Direction = 'perp_short_stock_long' | 'perp_long_stock_short'

export interface ArbSnapshot {
  asset: Asset['id']
  name: string
  session: Session
  /** live: 국내 시장이 열려 있어 바로 비교 가능. gap: 국내 휴장이라 직전 종가와 비교 */
  mode: 'live' | 'gap'
  krx: { price: number; prevClose: number; changePct: number; source: string }
  perp: { coin: string; mid: number; mark: number; oracle: number; changePct: number; fundingHourly: number; openInterest: number; volume24hUsd: number; maxLeverage: number }
  fx: { rate: number; bid: number; ask: number; source: 'upbit:KRW-USDC' } | null
  perpKrw: number
  premiumPct: number
  net: {
    direction: Direction
    grossPct: number
    costs: { stock: number; perp: number; fx: number; funding: number }
    netPct: number
    netKrwPer10m: number // 1천만원 기준 예상 순이익
    executable: boolean
    note: string
  }
  updatedAt: number
}

const pct = (x: number) => Math.round(x * 10000) / 10000

export async function arbSnapshot(asset: Asset, cost: CostInput = DEFAULT_COST): Promise<ArbSnapshot> {
  const [ctxs, quote, fx, holidays] = await Promise.all([getPerpCtxs(), krxQuote(asset), asset.fx ? getUsdcKrw() : null, krxHolidays()])
  const ctx = ctxs.get(asset.perp)
  if (!ctx) throw new Error(`perp 시세 없음: ${asset.perp}`)

  const now = Date.now()
  const session = sessionAt(now, holidays)
  const mid = ctx.midPx ?? ctx.markPx
  const perpKrw = asset.fx ? mid * fx!.rate : mid
  // 국내가 닫혀 있으면 마지막 체결가(=종가)가 기준
  const base = quote.price
  const premium = perpKrw / base - 1
  const mode = session === 'closed' ? 'gap' : 'live'

  const direction: Direction = premium >= 0 ? 'perp_short_stock_long' : 'perp_long_stock_short'
  const stockCost = (cost.stockFeeBps * 2 + cost.stockTaxBps) / 10000
  const perpCost = (cost.perpFeeBps * 2) / 10000
  const spreadHalf = fx ? (fx.ask - fx.bid) / 2 / fx.rate : 0
  const fxCost = asset.fx ? ((cost.fxFeeBps / 10000 + spreadHalf) * 2) / cost.leverage : 0
  // 숏은 펀딩이 양수일 때 받고, 롱은 냄
  const fundingCost = (direction === 'perp_short_stock_long' ? -1 : 1) * ctx.funding * cost.holdHours
  const gross = Math.abs(premium)
  const netPct = gross - stockCost - perpCost - fxCost - fundingCost

  let executable = mode === 'live'
  let note = ''
  if (mode === 'gap') note = '국내 시장이 닫혀 있어서 지금은 주식 쪽 주문이 안 돼요. 다음 개장 때 벌어진 만큼 시가에 반영될 가능성이 커요.'
  else if (direction === 'perp_long_stock_short') {
    executable = false
    note = '주식을 빌려서 파는 건 개인이 하기 어려워요. 이미 갖고 있는 주식을 팔고 perp를 사는 방식으로만 가능해요.'
  } else if (asset.kind === 'index') note = '지수는 직접 살 수 없어서 KODEX 200 같은 ETF로 대신 담아야 해요. 추적오차만큼 차이가 날 수 있어요.'
  else note = 'perp를 팔고 주식을 사두면, 두 가격이 다시 붙을 때 차이만큼 남아요.'
  if (netPct <= 0) executable = false

  return {
    asset: asset.id,
    name: asset.name,
    session,
    mode,
    krx: { price: base, prevClose: quote.prevClose, changePct: quote.changePct, source: quote.source },
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
    net: {
      direction,
      grossPct: pct(gross * 100),
      costs: { stock: pct(stockCost * 100), perp: pct(perpCost * 100), fx: pct(fxCost * 100), funding: pct(fundingCost * 100) },
      netPct: pct(netPct * 100),
      netKrwPer10m: Math.round(netPct * 10_000_000),
      executable,
      note,
    },
    updatedAt: now,
  }
}

export async function arbAll(cost?: CostInput) {
  const res = await Promise.allSettled(ASSETS.map((a) => arbSnapshot(a, cost)))
  return res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}
