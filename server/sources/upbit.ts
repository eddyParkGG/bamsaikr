// 업비트 원화마켓 USDC 시세. 하이퍼리퀴드 perp 는 USDC 로 정산되므로 원/달러가 아니라 원/USDC 로 환산
import { cached, fetchJson } from '../lib/cache.js'

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
 * 원/USDC 시간봉. 1회 최대 200개라 거슬러 올라가며 이어붙임
 * 반환: 오름차순, t = 봉 시작 시각
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
      // 업비트 캔들 API 초당 10회 제한
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 1000))
    }
    out.sort((a, b) => a.t - b.t)
    return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t)
  })
}

/** 정렬된 시계열에서 t 시점 직전 값 (이진 탐색) */
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

/** 구간별 원/USDC 캔들 종가 (오름차순). 차트의 perp 원화 환산용 */
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
