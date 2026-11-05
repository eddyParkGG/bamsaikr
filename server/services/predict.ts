// 다음 KRX 개장 시가 예측 + 과거 개장 수렴 이력
//
// 모델 (일부러 단순하게):
//   g = 개장 직전 perp 원화환산가 / 직전 KRX 종가 - 1   (perp가 말하는 갭)
//   a = 실제 KRX 시가 / 직전 종가 - 1                    (실제 갭)
//   a = α + β·g + ε,  ε ~ N(0, σ_regime²)   regime = 평일 밤 / 주말·연휴
// 개장까지 시간이 남아 있으면 그 사이 perp 가 더 움직일 수 있으므로 분산을 더함
//   σ_t² = σ_regime² + β²·(휴장 시간대 perp 시간당 변동성)²·남은시간
import type { Asset } from '../../shared/assets.js'
import { isTradingDay, kstDateKey, kstToMs, nextRegularOpen, sessionAt } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { getPerpCandles, getPerpCtxs, type Candle } from '../sources/hyperliquid.js'
import { krxHolidays, krxQuote } from '../sources/krx.js'
import { regularSessions } from '../sources/krxSessions.js'
import { getUsdcKrw, getUsdcKrwHourly, rateAt, type FxPoint } from '../sources/upbit.js'

const H = 3600_000
const LONG_GAP_HOURS = 20 // 직전 종가~시가가 20시간 넘으면 주말·연휴로 봄
const Z80 = 1.2816
const PRIOR_N = Number(process.env.PREDICT_PRIOR_N ?? 60)

export interface OpenEvent {
  date: string // 개장일 YYYYMMDD
  regime: 'overnight' | 'weekend'
  closedHours: number
  prevClose: number
  perpRefKrw: number // 08:59 perp 원화환산가
  open: number
  perpAfterKrw: number | null // 09:59 perp 원화환산가
  gapPct: number // perp 가 말한 갭
  openGapPct: number // 실제 시가 갭
  absorptionPct: number | null // 실제 갭 / perp 갭 ×100 (100이면 perp 대로 열림)
  meetPoint: number | null // 0=perp 가 주식 쪽으로, 1=주식이 perp 쪽으로 이동해 만남
  predictedPct?: number // 그날 이전 데이터만으로 한 예측 (walk-forward)
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
  // β 는 1(perp 그대로 반영) 쪽으로 당겨줌. 표본이 적을 때 급락일 몇 개에 휘둘리지 않게
  // 사전분포 강도 = 관측치 PRIOR_N 개 분량
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
  // candles 는 1시간 간격 오름차순
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
    const ref = candleAt(perp, tOpen - H) // 08:00~08:59 봉 종가
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

/** 휴장 시간대(perp 만 거래) 시간당 로그수익률 표준편차 */
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
      regularSessions(asset.krxCode, kstDateKey(start - 5 * 86400_000)),
      asset.fx ? getUsdcKrwHourly(start) : Promise.resolve([] as FxPoint[]),
      krxHolidays(),
    ])
    // 정규장 시가·종가가 모두 있는 날만 (오늘 장중이면 종가 없음)
    const daily = sessions.map((s) => ({ date: s.date, o: s.open, c: s.close ?? NaN }))
    const events = buildEvents(asset, daily, perp, fx).filter((e) => Number.isFinite(e.prevClose))
    const vol = closedHoursVol(perp, holidays)

    // walk-forward: 그날 이전 데이터로만 학습해서 예측 → 실제와 비교
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
        perpRawMaePct: tested ? r2(perpRawAbsErr / tested) : null, // perp 가격 그대로 시가로 쓴 경우
        naiveMaePct: tested ? r2(naiveAbsErr / tested) : null, // '전일 종가 그대로' 가정
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

  // 기준 종가: 오늘 정규장이 끝났으면 오늘 종가, 장중이면 현재가(잠정)
  const todayKey = kstDateKey(now)
  const todayClose = kstToMs(todayKey, '1530')
  const regularDoneToday = isTradingDay(now, holidays) && now >= todayClose
  const inSession = session === 'regular'
  const last = events[events.length - 1]
  const sessions = await regularSessions(asset.krxCode, kstDateKey(now - 10 * 86400_000))
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
