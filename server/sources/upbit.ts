// Upbit KRW-market USDC price. Hyperliquid perps settle in USDC, so convert with KRW/USDC rather than KRW/USD
import { cached, fetchJson as rawFetchJson } from '../lib/cache.js'

/** Upbit allows ~10 req/sec per IP; several history loads at once can hit it, so back off and retry */
async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rawFetchJson<T>(url)
    } catch (e) {
      if (attempt >= 4 || !String((e as Error).message).includes('429')) throw e
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

const BASE = 'https://api.upbit.com/v1'
const MARKET = 'KRW-USDC'

export interface FxPoint {
  t: number
  rate: number
}

export function getUsdcKrw(): Promise<{ rate: number; bid: number; ask: number; t: number }> {
  return cached('upbit:usdc', 1000, async () => {
    const [ob] = await fetchJson<{ timestamp: number; orderbook_units: { ask_price: number; bid_price: number }[] }[]>(
      `${BASE}/orderbook?markets=${MARKET}`,
    )
    const top = ob.orderbook_units[0]
    return { rate: (top.ask_price + top.bid_price) / 2, bid: top.bid_price, ask: top.ask_price, t: ob.timestamp }
  })
}

type RawCandle = { candle_date_time_utc: string; opening_price: number; trade_price: number; high_price: number; low_price: number }

/**
 * KRW/USDC hourly candles. Max 200 per call, so page backwards and concatenate
 * Returns: ascending, t = bar start time
 */
export function getUsdcKrwHourly(sinceMs: number): Promise<FxPoint[]> {
  const bucket = Math.floor(sinceMs / 86400_000)
  return cached(`upbit:usdc:1h:${bucket}`, 10 * 60_000, async () => {
    const out: FxPoint[] = []
    let to: string | undefined
    for (let i = 0; i < 60; i++) {
      const url = `${BASE}/candles/minutes/60?market=${MARKET}&count=200${to ? `&to=${encodeURIComponent(to)}` : ''}`
      const page = await fetchJson<RawCandle[]>(url)
      if (!page.length) break
      for (const k of page) out.push({ t: Date.parse(k.candle_date_time_utc + 'Z'), rate: k.trade_price })
      const oldest = page[page.length - 1]
      to = oldest.candle_date_time_utc + 'Z'
      if (Date.parse(to) <= sinceMs) break
      // Upbit candle API is limited to 10 req/sec
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 1000))
    }
    out.sort((a, b) => a.t - b.t)
    return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t)
  })
}

/** Value at or just before t in a sorted series (binary search) */
export function rateAt(series: FxPoint[], t: number): number | null {
  let lo = 0
  let hi = series.length - 1
  if (hi < 0 || series[0].t > t) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (series[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return series[lo].rate
}

export type UpbitUnit = 1 | 5 | 15 | 60 | 240 | 'day'

/** KRW/USDC candle closes per interval (ascending). Used to convert perp prices to KRW on the chart */
export function getUsdcKrwCandles(unit: UpbitUnit, sinceMs: number): Promise<FxPoint[]> {
  const step = unit === 'day' ? 86400_000 : unit * 60_000
  const bucket = Math.floor(sinceMs / step)
  const ttl = unit === 'day' ? 10 * 60_000 : Math.min(60_000, step)
  return cached(`upbit:usdc:${unit}:${bucket}`, ttl, async () => {
    const path = unit === 'day' ? 'candles/days' : `candles/minutes/${unit}`
    const out: FxPoint[] = []
    let to: string | undefined
    for (let i = 0; i < 40; i++) {
      const page = await fetchJson<RawCandle[]>(`${BASE}/${path}?market=${MARKET}&count=200${to ? `&to=${encodeURIComponent(to)}` : ''}`)
      if (!page.length) break
      for (const k of page) out.push({ t: Date.parse(k.candle_date_time_utc + 'Z'), rate: k.trade_price })
      to = page[page.length - 1].candle_date_time_utc + 'Z'
      if (Date.parse(to) <= sinceMs) break
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 1000))
    }
    out.sort((a, b) => a.t - b.t)
    return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t)
  })
}
