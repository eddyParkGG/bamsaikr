// Next KRX opening price forecast + historical opening convergence
//
// Model (deliberately simple):
//   g = perp KRW price just before open / previous KRX close - 1   (gap implied by perp)
//   a = actual KRX open / previous close - 1                       (actual gap)
//   a = α + β·g + ε,  ε ~ N(0, σ_regime²)   regime = weekday night / weekend·holiday
// If time remains until open, the perp can still move, so add variance
//   σ_t² = σ_regime² + β²·(hourly perp volatility while closed)²·hours remaining
import type { Asset } from '../../shared/assets.js'
import { isTradingDay, kstDateKey, kstToMs, nextRegularOpen, sessionAt } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { getPerpCandles, getPerpCtxs, type Candle } from '../sources/hyperliquid.js'
import { krxHolidays, krxQuote, krxSessions } from '../sources/krx.js'
import { getUsdcKrw, getUsdcKrwHourly, rateAt, type FxPoint } from '../sources/upbit.js'

const H = 3600_000
const LONG_GAP_HOURS = 20 // close-to-open over 20h is treated as weekend/holiday
const Z80 = 1.2816
const PRIOR_N = Number(process.env.PREDICT_PRIOR_N ?? 60)

export interface OpenEvent {
  date: string // open day YYYYMMDD
  regime: 'overnight' | 'weekend'
  closedHours: number
  prevClose: number
  perpRefKrw: number // 08:59 perp price in KRW
  open: number
  perpAfterKrw: number | null // 09:59 perp price in KRW
  gapPct: number // gap implied by perp
  openGapPct: number // actual opening gap
  absorptionPct: number | null // actual gap / perp gap ×100 (100 = opened exactly as perp implied)
  meetPoint: number | null // 0 = perp moved to the stock, 1 = stock moved to the perp
  predictedPct?: number // forecast using only data before that day (walk-forward)
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

function buildEvents(asset: Asset, daily: { date: string; o: number; c: number }[], perp: Candle[], fx: FxPoint[]): OpenEvent[] {
  const out: OpenEvent[] = []
  const krw = (px: number, t: number) => (asset.fx ? (rateAt(fx, t) ?? NaN) * px : px)
  for (let i = 1; i < daily.length; i++) {
    const d = daily[i]
    const prev = daily[i - 1]
    const tOpen = kstToMs(d.date, '0900')
    if (tOpen > Date.now()) continue
    const ref = candleAt(perp, tOpen - H) // close of the 08:00~08:59 bar
    if (!ref || !d.o) continue
    const perpRefKrw = krw(ref.c, tOpen - H)
    if (!Number.isFinite(perpRefKrw)) continue
    const after = candleAt(perp, tOpen)
    const perpAfterKrw = after && Date.now() > tOpen + H ? krw(after.c, tOpen) : null

    const closedHours = (tOpen - kstToMs(prev.date, '1530')) / H
    const G = Math.log(perpRefKrw / prev.c)
    const S = Math.log(d.o / prev.c)
    const P = perpAfterKrw ? Math.log(perpAfterKrw / perpRefKrw) : null
    const meet = P != null && Math.abs(S - P) > 0.001 ? Math.min(1, Math.max(0, S / (S - P))) : null

    out.push({
      date: d.date,
      regime: closedHours > LONG_GAP_HOURS ? 'weekend' : 'overnight',
      closedHours: Math.round(closedHours * 10) / 10,
      prevClose: prev.c,
      perpRefKrw: Math.round(perpRefKrw * 100) / 100,
      open: d.o,
      perpAfterKrw: perpAfterKrw ? Math.round(perpAfterKrw * 100) / 100 : null,
      gapPct: (perpRefKrw / prev.c - 1) * 100,
      openGapPct: (d.o / prev.c - 1) * 100,
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

const MIN_TRAIN = 20

export function loadHistory(asset: Asset) {
  return cached(`predict:history:${asset.id}`, 10 * 60_000, async () => {
    const perp = await getPerpCandles(asset.perp, '1h', 0)
    const start = perp[0]?.t ?? Date.now() - 200 * 86400_000
    const [sessions, fx, holidays] = await Promise.all([
      krxSessions(asset, kstDateKey(start - 5 * 86400_000)),
      asset.fx ? getUsdcKrwHourly(start) : Promise.resolve([] as FxPoint[]),
      krxHolidays(),
    ])
    // Only days with both regular-session open and close (no close during today's session)
    const daily = sessions.map((s) => ({ date: s.date, o: s.open, c: s.close ?? NaN }))
    const events = buildEvents(asset, daily, perp, fx).filter((e) => Number.isFinite(e.prevClose))
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
    const model = fit(events, vol)
    const r2 = (x: number) => Math.round(x * 100) / 100
    return {
      model,
      events,
      backtest: {
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
  const session = sessionAt(now, holidays)
  const target = nextRegularOpen(now, holidays)

  // Reference close: today's close if the regular session has ended, else the current price (provisional)
  const todayKey = kstDateKey(now)
  const todayClose = kstToMs(todayKey, '1530')
  const regularDoneToday = isTradingDay(now, holidays) && now >= todayClose
  const inSession = session === 'regular'
  const last = events[events.length - 1]
  const sessions = await krxSessions(asset, kstDateKey(now - 10 * 86400_000))
  const lastBar = sessions.filter((d) => d.close != null && (d.date < todayKey || regularDoneToday)).map((d) => ({ date: d.date, c: d.close! })).at(-1)
  const refClose = inSession ? quote.price : (lastBar?.c ?? quote.prevClose)
  const refCloseAt = inSession ? todayClose : lastBar ? kstToMs(lastBar.date, '1530') : todayClose

  const mid = ctx.midPx ?? ctx.markPx
  const perpKrw = asset.fx ? mid * fx!.rate : mid
  const g = perpKrw / refClose - 1
  const regime: OpenEvent['regime'] = (target - refCloseAt) / H > LONG_GAP_HOURS ? 'weekend' : 'overnight'
  const hoursToOpen = Math.max(0, (target - now) / H)
  const mu = model.alpha + model.beta * g
  const sigma = Math.sqrt(model.sigma[regime] ** 2 + model.beta ** 2 * model.perpHourlyVol ** 2 * hoursToOpen)
  const pUp = normCdf(mu / sigma)

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
