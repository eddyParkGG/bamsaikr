// 차트용 시계열: 두 시장 캔들 + 원화 환산 + 괴리율
import type { Asset } from '../../shared/assets.js'
import { isTradingDay, kstDateKey, kstToMs, sessionAt } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { getFundingHistory, getPerpCandles, type Candle, type HlInterval } from '../sources/hyperliquid.js'
import { krxDaily, krxHolidays, krxMinutes, krxSource } from '../sources/krx.js'
import { getUsdcKrwCandles, rateAt, type UpbitUnit } from '../sources/upbit.js'

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '1d'

// 구간별 기본 조회 기간(일). KRX 분봉은 대체 소스에서 1~2주치만 있어서 1h 이하는 짧게
const RANGE_DAYS: Record<ChartInterval, number> = { '1m': 2, '5m': 6, '15m': 12, '1h': 40, '1d': 400 }
const STEP: Record<ChartInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3600_000, '1d': 86400_000 }
const UPBIT_UNIT: Record<ChartInterval, UpbitUnit> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 'day' }

export interface SeriesPoint {
  t: number
  v: number
}

export interface ChartSeries {
  asset: Asset['id']
  interval: ChartInterval
  krxSource: string
  perp: (Candle & { krw: number })[] // c 는 USDC, krw 는 원화 환산 종가
  perpKrw: Candle[] // OHLC 전부 원화 환산
  krx: Candle[]
  fx: SeriesPoint[]
  premium: (SeriesPoint & { live: boolean })[] // live=false 는 국내 휴장 중(직전 종가 대비 갭)
  funding: SeriesPoint[]
  holidays: string[]
}

function bucketize(minutes: Candle[], step: number): Candle[] {
  if (step === 60_000) return minutes
  const out: Candle[] = []
  let cur: Candle | null = null
  for (const k of minutes) {
    const t = Math.floor(k.t / step) * step
    if (!cur || cur.t !== t) {
      if (cur) out.push(cur)
      cur = { t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }
    } else {
      cur.h = Math.max(cur.h, k.h)
      cur.l = Math.min(cur.l, k.l)
      cur.c = k.c
      cur.v += k.v
    }
  }
  if (cur) out.push(cur)
  return out
}

async function krxCandles(asset: Asset, interval: ChartInterval, since: number, holidays: ReadonlySet<string>): Promise<Candle[]> {
  if (interval === '1d') {
    const daily = await krxDaily(asset, kstDateKey(since), kstDateKey(Date.now()))
    return daily.map((d) => ({ t: kstToMs(d.date, '0900'), o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }))
  }
  const days: string[] = []
  // 대체 소스는 분봉을 최근 1~2주만 줘서 그 이전은 요청하지 않음
  if (krxSource() === 'naver') since = Math.max(since, Date.now() - 12 * 86400_000)
  for (let t = since; t <= Date.now(); t += 86400_000) if (isTradingDay(t, holidays)) days.push(kstDateKey(t))
  const perDay = await Promise.all(days.map((d) => krxMinutes(asset, d).catch(() => [] as Candle[])))
  return bucketize(perDay.flat(), STEP[interval])
}

export function chartSeries(asset: Asset, interval: ChartInterval): Promise<ChartSeries> {
  const ttl = interval === '1d' ? 60_000 : 15_000
  return cached(`series:${asset.id}:${interval}:${krxSource()}`, ttl, async () => {
    const holidays = await krxHolidays()
    const since = Date.now() - RANGE_DAYS[interval] * 86400_000
    const [perpRaw, krx, fx, funding] = await Promise.all([
      getPerpCandles(asset.perp, interval as HlInterval, Math.floor(since / STEP[interval]) * STEP[interval]),
      krxCandles(asset, interval, since, holidays),
      asset.fx ? getUsdcKrwCandles(UPBIT_UNIT[interval], since) : Promise.resolve([]),
      getFundingHistory(asset.perp, Math.max(since, Date.now() - 30 * 86400_000)).catch(() => []),
    ])

    const conv = (t: number) => (asset.fx ? (rateAt(fx, t + STEP[interval] - 1) ?? fx[0]?.rate ?? NaN) : 1)
    const perp = perpRaw.map((k) => ({ ...k, krw: k.c * conv(k.t) }))
    const perpKrw = perpRaw.map((k) => {
      const r = conv(k.t)
      return { t: k.t, o: k.o * r, h: k.h * r, l: k.l * r, c: k.c * r, v: k.v }
    })

    // 괴리율: 같은 봉끼리 비교. 국내 봉이 없으면 직전 국내 종가와 비교(휴장 갭)
    const krxByT = new Map(krx.map((k) => [k.t, k]))
    const premium: ChartSeries['premium'] = []
    let lastKrx: number | null = null
    let ki = 0
    for (const p of perp) {
      while (ki < krx.length && krx[ki].t <= p.t) lastKrx = krx[ki++].c
      const same = krxByT.get(p.t)
      const base = same?.c ?? lastKrx
      if (!base || !Number.isFinite(p.krw)) continue
      const live = !!same && (interval === '1d' || sessionAt(p.t, holidays) !== 'closed')
      premium.push({ t: p.t, v: Math.round((p.krw / base - 1) * 1e6) / 1e4, live })
    }

    return {
      asset: asset.id,
      interval,
      krxSource: krxSource(),
      perp,
      perpKrw,
      krx,
      fx: fx.filter((p) => p.t >= since).map((p) => ({ t: p.t, v: p.rate })),
      premium,
      funding: funding.map((f) => ({ t: f.t, v: f.rate * 100 })), // 시간당 %
      holidays: [...holidays],
    }
  })
}
