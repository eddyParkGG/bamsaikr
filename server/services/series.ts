// Chart series: candles for both markets + KRW conversion + premium
import type { Asset } from '../../shared/assets.js'
import { kstDateKey, kstToMs, sessionAt } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { getFundingHistory, getPerpCandles, type Candle, type HlInterval } from '../sources/hyperliquid.js'
import { krxDaily, krxHolidays, krxMinutes, krxSource } from '../sources/krx.js'
import { getUsdcKrwCandles, rateAt, type UpbitUnit } from '../sources/upbit.js'

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '1d'

// Domestic minute bars are 200 per Toss API call, so long ranges need many calls → cap 1h bars at 3 weeks
// Loaded span per interval. Longer than what is shown at first so long indicators (MA 120 etc.)
// are fully warmed up across the visible range and the user can scroll back
const RANGE_DAYS: Record<ChartInterval, number> = { '1m': 3, '5m': 8, '15m': 20, '1h': 45, '1d': 800 }
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
  perp: (Candle & { krw: number })[] // c is USDC, krw is the KRW-converted close
  perpKrw: Candle[] // full OHLC converted to KRW
  krx: Candle[]
  fx: SeriesPoint[]
  premium: (SeriesPoint & { live: boolean })[] // live=false while domestic market is closed (gap vs last close)
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

async function krxCandles(asset: Asset, interval: ChartInterval, since: number): Promise<Candle[]> {
  if (interval === '1d') {
    const daily = await krxDaily(asset, kstDateKey(since), kstDateKey(Date.now()))
    return daily.map((d) => ({ t: kstToMs(d.date, '0900'), o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }))
  }
  return bucketize(await krxMinutes(asset, since), STEP[interval])
}

export function chartSeries(asset: Asset, interval: ChartInterval): Promise<ChartSeries> {
  const ttl = interval === '1d' ? 60_000 : 15_000
  return cached(`series:${asset.id}:${interval}:${krxSource()}`, ttl, async () => {
    const holidays = await krxHolidays()
    const since = Date.now() - RANGE_DAYS[interval] * 86400_000
    const [perpRaw, krx, fx, funding] = await Promise.all([
      getPerpCandles(asset.perp, interval as HlInterval, Math.floor(since / STEP[interval]) * STEP[interval]),
      krxCandles(asset, interval, since),
      asset.fx ? getUsdcKrwCandles(UPBIT_UNIT[interval], since) : Promise.resolve([]),
      getFundingHistory(asset.perp, Math.max(since, Date.now() - 30 * 86400_000)).catch(() => []),
    ])

    const conv = (t: number) => (asset.fx ? (rateAt(fx, t + STEP[interval] - 1) ?? fx[0]?.rate ?? NaN) : 1)
    const perp = perpRaw.map((k) => ({ ...k, krw: k.c * conv(k.t) }))
    const perpKrw = perpRaw.map((k) => {
      const r = conv(k.t)
      return { t: k.t, o: k.o * r, h: k.h * r, l: k.l * r, c: k.c * r, v: k.v }
    })

    // Premium: compare matching bars. Without a domestic bar, compare to the last domestic close (closed-market gap)
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
      funding: funding.map((f) => ({ t: f.t, v: f.rate * 100 })), // % per hour
      holidays: [...holidays],
    }
  })
}
