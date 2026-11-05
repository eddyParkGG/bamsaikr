// 상단 지표 띠: 코스피·코스닥(토스증권) + 원/USDC(업비트). 토스 홈의 지표 카드처럼 미니 차트 포함
import { kstDateKey, kstToMs } from '../../shared/session.js'
import { cached, fetchJson } from '../lib/cache.js'
import { tossCandles, tossIndicatorPrices } from '../sources/toss.js'
import { getUsdcKrwCandles } from '../sources/upbit.js'

export interface Indicator {
  id: 'KOSPI' | 'KOSDAQ' | 'USDC'
  name: string
  price: number
  prevClose: number
  change: number
  changePct: number
  spark: [number, number][] // [epoch ms, value], max ~80 points
  window: { from: number; to: number } // x-axis span: index = regular session of that day, USDC = last 24h
}

function downsample<T>(xs: T[], n = 80): T[] {
  if (xs.length <= n) return xs
  const step = xs.length / n
  // Spread rather than concat: concat would flatten a [t, v] tuple into two numbers
  return [...Array.from({ length: n }, (_, i) => xs[Math.min(xs.length - 1, Math.round(i * step))]), xs[xs.length - 1]]
}

async function indexIndicator(id: 'KOSPI' | 'KOSDAQ', name: string, last: number): Promise<Indicator> {
  const [daily, minutes] = await Promise.all([tossCandles(id, '1d', Date.now() - 10 * 86400_000, true), tossCandles(id, '1m', Date.now() - 4 * 86400_000, true)])
  const lastDay = minutes.length ? kstDateKey(minutes[minutes.length - 1].t) : kstDateKey(Date.now())
  const isToday = daily.length && kstDateKey(daily[daily.length - 1].t) === lastDay
  const prevClose = (isToday ? daily.at(-2) : daily.at(-1))?.c ?? last
  // Toss minute candles are stamped at bar end
  const spark = downsample(minutes.filter((k) => kstDateKey(k.t) === lastDay).map((k) => [k.t - 60_000, k.c] as [number, number]))
  const change = last - prevClose
  const window = { from: kstToMs(lastDay, '0900'), to: kstToMs(lastDay, '1530') }
  return { id, name, price: last, prevClose, change, changePct: (change / prevClose) * 100, spark, window }
}

async function usdcIndicator(): Promise<Indicator> {
  const [[t], candles] = await Promise.all([
    fetchJson<{ trade_price: number; prev_closing_price: number }[]>('https://api.upbit.com/v1/ticker?markets=KRW-USDC'),
    getUsdcKrwCandles(15, Date.now() - 86400_000),
  ])
  const change = t.trade_price - t.prev_closing_price
  return {
    id: 'USDC',
    name: '원/USDC',
    price: t.trade_price,
    prevClose: t.prev_closing_price,
    change,
    changePct: (change / t.prev_closing_price) * 100,
    spark: downsample(candles.map((p) => [p.t, p.rate] as [number, number])),
    window: { from: Date.now() - 86400_000, to: Date.now() },
  }
}

export function indicators(): Promise<Indicator[]> {
  return cached('indicators', 5000, async () => {
    const prices = (await tossIndicatorPrices(['KOSPI', 'KOSDAQ'])) as { symbol: string; lastPrice: string }[]
    const px = (s: string) => Number(prices.find((p) => p.symbol === s)?.lastPrice ?? 0)
    return Promise.all([indexIndicator('KOSPI', '코스피', px('KOSPI')), indexIndicator('KOSDAQ', '코스닥', px('KOSDAQ')), usdcIndicator()])
  })
}
