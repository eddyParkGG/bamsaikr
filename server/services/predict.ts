// Forecast of the domestic re-open + the record of past re-opens
//
// "Domestic" = KRX + NXT, everything a retail investor can trade (08:00–20:00). The market is truly closed
// 20:00 → next trading day 08:00, and only Hyperliquid trades then.
//   reference = last domestic price: NXT close at 20:00
//   g = Hyperliquid KRW price at 08:00 / reference - 1      (move while only Hyperliquid traded)
//   a = 08:00–08:10 average domestic price / reference - 1  (where the domestic market re-opened; an average
//       because the first pre-market prints are thin)
// Model (deliberately simple):
//   a = α + β·g + ε,  ε ~ N(0, σ_regime²)   regime = weeknight / weekend·holiday
// If time remains until the re-open, Hyperliquid can still move, so add variance
//   σ_t² = σ_regime² + β²·(hourly Hyperliquid volatility while closed)²·hours remaining
// Thin nights: when under THIN_USD traded on Hyperliquid 20:00 → 08:00, its price says little
// (scored history: 86% follow at ≥ $1M vs 66% below, mostly Hyundai). Such forecasts are flagged
import type { Asset } from '../../shared/assets.js'
import { domesticTrading, kstToMs, nextDomesticOpen, sessionAt } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { getPerpCtxs, getPerpHourlySince, type Candle } from '../sources/hyperliquid.js'
import { domesticDays, type DomesticDay } from '../sources/domesticDays.js'
import { krxHolidays, krxQuote } from '../sources/krx.js'
import { getUsdcKrw, getUsdcKrwHourly, rateAt, type FxPoint } from '../sources/upbit.js'

const H = 3600_000
const LONG_GAP_HOURS = 20 // close-to-open over 20h is treated as weekend/holiday
const Z80 = 1.2816
const PRIOR_N = Number(process.env.PREDICT_PRIOR_N ?? 60)
/** Overnight Hyperliquid notional (USD) below which a night counts as thin */
export const THIN_USD = 1_000_000

export interface OpenEvent {
  date: string // re-open day YYYYMMDD
  regime: 'overnight' | 'weekend'
  closedHours: number // 20:00 close → 08:00 re-open
  nightUsd: number // Hyperliquid notional traded while closed (USD)
  prevClose: number // domestic close at 20:00 (NXT)
  perpRefKrw: number // Hyperliquid price at 08:00 in KRW
  open: number // 08:00–08:10 average domestic price
  perpAfterKrw: number | null // Hyperliquid price at 09:00 in KRW
  gapPct: number // move implied by Hyperliquid while closed
  openGapPct: number // actual re-open move
  absorptionPct: number | null // actual gap / perp gap ×100 (100 = opened exactly as perp implied)
  meetPoint: number | null // 0 = perp moved to the stock, 1 = stock moved to the perp
  predictedPct?: number // forecast using only data before that day (walk-forward)
  /** Did the domestic re-open move the way Hyperliquid moved while the market was closed?
   *  flat = either move was within ±FLAT_PCT, too small to call a direction */
  follow: 'yes' | 'no' | 'flat'
  hit?: boolean
  inBand80?: boolean
}

export interface Model {
  alpha: number
  beta: number
  sigma: { overnight: number; weekend: number }
  perpHourlyVol: number
  n: number
}

function erf(x: number) {
  // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x)
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return s * y
}
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

function fit(events: OpenEvent[], perpHourlyVol: number): Model {
  const n = events.length
  const xs = events.map((e) => e.gapPct / 100)
  const ys = events.map((e) => e.openGapPct / 100)
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  // Shrink β toward 1 (perp fully reflected) so a few crash days don't dominate small samples
  // Prior strength = PRIOR_N observations
  const lambda = (PRIOR_N * sxx) / n
  const beta = (sxy + lambda) / (sxx + lambda)
  const alpha = my - beta * mx
  const resid = (r: OpenEvent['regime']) => {
    const rs = events.filter((e) => e.regime === r).map((e) => e.openGapPct / 100 - (alpha + (beta * e.gapPct) / 100))
    if (rs.length < 3) return null
    return Math.sqrt(rs.reduce((s, v) => s + v * v, 0) / (rs.length - 1))
  }
  const all = resid('overnight') ?? 0.01
  return { alpha, beta, sigma: { overnight: all, weekend: resid('weekend') ?? all * 1.5 }, perpHourlyVol, n }
}

function candleAt(candles: Candle[], t: number): Candle | undefined {
  // candles are hourly, ascending
  let lo = 0
  let hi = candles.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].t === t) return candles[mid]
    if (candles[mid].t < t) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}

/** USD traded in 1h bars starting in [from, to) */
function notional(perp: Candle[], from: number, to: number) {
  let usd = 0
  for (const b of perp) if (b.t >= from && b.t < to) usd += b.v * b.c
  return usd
}

function buildEvents(asset: Asset, days: DomesticDay[], perp: Candle[], fx: FxPoint[]): OpenEvent[] {
  const out: OpenEvent[] = []
  const krw = (px: number, t: number) => (asset.fx ? (rateAt(fx, t) ?? NaN) * px : px)
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    const prev = days[i - 1]
    if (prev.close == null || d.reopen == null) continue
    const tOpen = kstToMs(d.date, '0800')
    if (tOpen + 10 * 60_000 > Date.now()) continue
    // Hyperliquid at 08:00 = close of the 07:00–07:59 1h bar (only 1h bars give an 08:00 price; they cover ~7 months)
    const ref = candleAt(perp, tOpen - H)
    if (!ref) continue
    const perpRefKrw = krw(ref.c, tOpen - H)
    if (!Number.isFinite(perpRefKrw)) continue
    const after = candleAt(perp, tOpen)
    const perpAfterKrw = after && Date.now() > tOpen + H ? krw(after.c, tOpen) : null

    const closeAt = kstToMs(prev.date, '2000')
    const closedHours = (tOpen - closeAt) / H
    const nightUsd = notional(perp, closeAt, tOpen)
    const G = Math.log(perpRefKrw / prev.close)
    const S = Math.log(d.reopen / prev.close)
    const P = perpAfterKrw ? Math.log(perpAfterKrw / perpRefKrw) : null
    const meet = P != null && Math.abs(S - P) > 0.001 ? Math.min(1, Math.max(0, S / (S - P))) : null

    out.push({
      follow: 'flat', // set when the history is scored
      date: d.date,
      regime: closedHours > LONG_GAP_HOURS ? 'weekend' : 'overnight',
      closedHours: Math.round(closedHours * 10) / 10,
      nightUsd: Math.round(nightUsd),
      prevClose: prev.close,
      perpRefKrw: Math.round(perpRefKrw * 100) / 100,
      open: Math.round(d.reopen * 100) / 100,
      perpAfterKrw: perpAfterKrw ? Math.round(perpAfterKrw * 100) / 100 : null,
      gapPct: (perpRefKrw / prev.close - 1) * 100,
      openGapPct: (d.reopen / prev.close - 1) * 100,
      absorptionPct: Math.abs(G) > 0.003 ? (S / G) * 100 : null,
      meetPoint: meet,
    })
  }
  return out
}

/** Std dev of hourly log returns while the market is closed (perp-only trading) */
function closedHoursVol(perp: Candle[], holidays: ReadonlySet<string>) {
  const rs: number[] = []
  const from = Date.now() - 60 * 86400_000
  for (let i = 1; i < perp.length; i++) {
    if (perp[i].t < from) continue
    if (sessionAt(perp[i].t, holidays) !== 'closed') continue
    rs.push(Math.log(perp[i].c / perp[i - 1].c))
  }
  if (rs.length < 10) return 0.003
  const m = rs.reduce((s, v) => s + v, 0) / rs.length
  return Math.sqrt(rs.reduce((s, v) => s + (v - m) ** 2, 0) / (rs.length - 1))
}

/** Hyperliquid listed the Korean stock perps on 2026-02-19 20:00 UTC (02-20 05:00 KST); history starts there */
const HISTORY_FROM = Date.UTC(2026, 1, 18)
const MIN_TRAIN = 20
/** Moves smaller than this (in %) count as "no direction" */
export const FLAT_PCT = 0.05

export function loadHistory(asset: Asset) {
  return cached(`predict:history:${asset.id}`, 10 * 60_000, async () => {
    // Since the Korean listings on trade.xyz (2026-02-20 KST). The API keeps only the latest 5,000 bars per
    // interval; an 08:00 price needs 1h bars, so scored history starts where they do (~7 months back)
    const perp = await getPerpHourlySince(asset.perp, HISTORY_FROM)
    const start = perp[0]?.t ?? Date.now() - 200 * 86400_000
    const [days, fx, holidays] = await Promise.all([
      domesticDays(asset.krxCode, start - 5 * 86400_000, asset.ratio),
      asset.fx ? getUsdcKrwHourly(start) : Promise.resolve([] as FxPoint[]),
      krxHolidays(),
    ])
    const events = buildEvents(asset, days, perp, fx)
    const vol = closedHoursVol(perp, holidays)

    // walk-forward: fit only on data before that day, forecast → compare to actual
    let hits = 0
    let tested = 0
    let inBand = 0
    let absErr = 0
    let naiveAbsErr = 0
    let perpRawAbsErr = 0
    for (let i = MIN_TRAIN; i < events.length; i++) {
      const m = fit(events.slice(0, i), vol)
      const e = events[i]
      const mu = (m.alpha + (m.beta * e.gapPct) / 100) * 100
      const sigma = m.sigma[e.regime] * 100
      e.predictedPct = mu
      e.hit = Math.sign(mu) === Math.sign(e.openGapPct) || Math.abs(e.openGapPct) < 0.05
      e.inBand80 = Math.abs(e.openGapPct - mu) <= Z80 * sigma
      tested++
      if (e.hit) hits++
      if (e.inBand80) inBand++
      absErr += Math.abs(e.openGapPct - mu)
      naiveAbsErr += Math.abs(e.openGapPct)
      perpRawAbsErr += Math.abs(e.openGapPct - e.gapPct)
    }
    // Hyperliquid-direction check needs no training, so every open is scored
    let followYes = 0
    let followNo = 0
    let liquidYes = 0
    let liquidNo = 0
    let bigYes = 0
    let bigNo = 0
    for (const e of events) {
      e.follow = Math.abs(e.openGapPct) < FLAT_PCT || Math.abs(e.gapPct) < FLAT_PCT ? 'flat' : Math.sign(e.gapPct) === Math.sign(e.openGapPct) ? 'yes' : 'no'
      if (e.follow === 'yes') followYes++
      if (e.follow === 'no') followNo++
      if (e.nightUsd >= THIN_USD && e.follow === 'yes') liquidYes++
      if (e.nightUsd >= THIN_USD && e.follow === 'no') liquidNo++
      if (Math.abs(e.gapPct) >= 1 && e.follow === 'yes') bigYes++
      if (Math.abs(e.gapPct) >= 1 && e.follow === 'no') bigNo++
    }
    const model = fit(events, vol)
    const r2 = (x: number) => Math.round(x * 100) / 100
    return {
      model,
      events,
      backtest: {
        /** Share of opens that moved the way Hyperliquid pointed (flat days excluded) */
        followRatePct: followYes + followNo ? r2((followYes / (followYes + followNo)) * 100) : null,
        followScored: followYes + followNo,
        followYes,
        followFlat: events.length - followYes - followNo,
        /** Same, only nights with at least THIN_USD traded on Hyperliquid (the H1 condition) */
        liquidRatePct: liquidYes + liquidNo ? r2((liquidYes / (liquidYes + liquidNo)) * 100) : null,
        liquidScored: liquidYes + liquidNo,
        liquidYes,
        thinUsd: THIN_USD,
        /** Same, only nights Hyperliquid moved 1% or more (bigger moves follow far more often) */
        bigRatePct: bigYes + bigNo ? r2((bigYes / (bigYes + bigNo)) * 100) : null,
        bigScored: bigYes + bigNo,
        bigYes,
        opens: events.length,
        since: events[0]?.date ?? null,
        tested,
        hitRatePct: tested ? r2((hits / tested) * 100) : null,
        coverage80Pct: tested ? r2((inBand / tested) * 100) : null,
        maePct: tested ? r2(absErr / tested) : null,
        perpRawMaePct: tested ? r2(perpRawAbsErr / tested) : null, // using the raw perp price as the open
        naiveMaePct: tested ? r2(naiveAbsErr / tested) : null, // assumes 'open = previous close'
      },
    }
  })
}

export async function predictOpen(asset: Asset) {
  const [{ model, events, backtest }, ctxs, fx, holidays, quote] = await Promise.all([
    loadHistory(asset),
    getPerpCtxs(),
    asset.fx ? getUsdcKrw() : null,
    krxHolidays(),
    krxQuote(asset),
  ])
  const ctx = ctxs.get(asset.perp)!
  const now = Date.now()
  const target = nextDomesticOpen(now, holidays)
  // While KRX or NXT trades, the domestic price is right there: the forecast waits for the 20:00 close
  const inSession = domesticTrading(now, holidays)

  // Reference = last domestic close (20:00). During trading hours, the live price stands in (provisional)
  const days = await domesticDays(asset.krxCode, now - 10 * 86400_000, asset.ratio)
  const lastClose = days.filter((d) => d.close != null).at(-1)
  const last = events[events.length - 1]
  const refClose = inSession || !lastClose ? quote.price : lastClose.close!
  const refCloseAt = inSession || !lastClose ? now : kstToMs(lastClose.date, '2000')

  const mid = ctx.midPx ?? ctx.markPx
  const perpKrw = asset.fx ? mid * fx!.rate : mid
  const g = perpKrw / refClose - 1
  const regime: OpenEvent['regime'] = (target - refCloseAt) / H > LONG_GAP_HOURS ? 'weekend' : 'overnight'
  const hoursToOpen = Math.max(0, (target - now) / H)
  const mu = model.alpha + model.beta * g
  const sigma = Math.sqrt(model.sigma[regime] ** 2 + model.beta ** 2 * model.perpHourlyVol ** 2 * hoursToOpen)
  const pUp = normCdf(mu / sigma)

  // Live liquidity. Daytime Hyperliquid volume runs far above the night's, so judge by nights only:
  // tonight so far, or a typical recent night (median of the last 20), whichever is larger
  const tonight = await getPerpHourlySince(asset.perp, refCloseAt - H)
  const tonightUsd = notional(tonight, refCloseAt, now)
  const recentNights = events.slice(-20).map((e) => e.nightUsd).sort((a, b) => a - b)
  const typicalNightUsd = recentNights.length ? recentNights[recentNights.length >> 1] : 0

  const bucket = (lo: number, hi: number) => normCdf((hi - mu) / sigma) - normCdf((lo - mu) / sigma)
  const r = (x: number) => Math.round(x * 10000) / 10000

  return {
    asset: asset.id,
    name: asset.name,
    status: inSession ? 'in-session' : 'pre-open',
    targetOpenAt: target,
    hoursToOpen: Math.round(hoursToOpen * 10) / 10,
    regime,
    refClose,
    perpKrw: Math.round(perpKrw * 100) / 100,
    perpGapPct: r(g * 100),
    expectedOpen: Math.round(refClose * (1 + mu)),
    expectedGapPct: r(mu * 100),
    band80: { low: Math.round(refClose * (1 + mu - Z80 * sigma)), high: Math.round(refClose * (1 + mu + Z80 * sigma)) },
    probUp: r(pUp),
    /** Hyperliquid trades too little at night (under THIN_USD) for its price to say much */
    thin: Math.max(tonightUsd, typicalNightUsd) < THIN_USD,
    tonightUsd: Math.round(tonightUsd),
    typicalNightUsd: Math.round(typicalNightUsd),
    probDown: r(1 - pUp),
    distribution: [
      { label: '-3% 이하', p: r(normCdf((-0.03 - mu) / sigma)) },
      { label: '-3~-1%', p: r(bucket(-0.03, -0.01)) },
      { label: '-1~+1%', p: r(bucket(-0.01, 0.01)) },
      { label: '+1~+3%', p: r(bucket(0.01, 0.03)) },
      { label: '+3% 이상', p: r(1 - normCdf((0.03 - mu) / sigma)) },
    ],
    model: { alpha: r(model.alpha), beta: r(model.beta), sigmaPct: { overnight: r(model.sigma.overnight * 100), weekend: r(model.sigma.weekend * 100) }, n: model.n },
    backtest,
    lastEvent: last ?? null,
    updatedAt: now,
  }
}
