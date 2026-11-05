// 국내 시세 창구: 토스증권 Open API (통합 시세 KRX+NXT)
import type { Asset } from '../../shared/assets.js'
import { isTradingDay, isWeekend, kstDateKey, kstToMs } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import type { Candle } from './hyperliquid.js'
import { regularSessions } from './krxSessions.js'
import { tossCalendar, tossCandles, tossMinutes, tossOrderbook, tossPrices } from './toss.js'

export const krxSource = () => 'toss' as const

export interface KrxQuote {
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  volume: number
  tradeValue: number
  changePct: number
  source: 'toss'
}

export async function krxQuote(a: Asset): Promise<KrxQuote> {
  const [prices, daily] = await Promise.all([tossPrices([a.krxCode]), tossCandles(a.krxCode, '1d', Date.now() - 12 * 86400_000)])
  const price = prices.get(a.krxCode)?.price ?? daily.at(-1)?.c ?? 0
  const last = daily.at(-1)
  const isToday = !!last && kstDateKey(last.t) === kstDateKey(Date.now())
  // '어제보다'는 KRX 정규장 종가 기준 (토스 앱과 같은 기준). 오늘이 거래일이면 오늘 이전 마지막 종가
  const [sessions, holidays] = await Promise.all([regularSessions(a.krxCode, kstDateKey(Date.now() - 12 * 86400_000)), krxHolidays()])
  const today = kstDateKey(Date.now())
  const done = sessions.filter((s) => s.close != null)
  const prevSession = isTradingDay(Date.now(), holidays) ? done.filter((s) => s.date < today).at(-1) : done.at(-2)
  const prevClose = prevSession?.close ?? (isToday ? daily.at(-2) : last)?.c ?? price
  return {
    price,
    prevClose,
    open: isToday ? last.o : price,
    high: isToday ? Math.max(last.h, price) : price,
    low: isToday ? Math.min(last.l, price) : price,
    volume: isToday ? last.v : 0,
    tradeValue: 0,
    changePct: prevClose ? Math.round((price / prevClose - 1) * 10000) / 100 : 0,
    source: 'toss',
  }
}

export interface DailyBar {
  date: string
  o: number
  h: number
  l: number
  c: number
  v: number
}

export async function krxDaily(a: Asset, from: string, _to?: string): Promise<DailyBar[]> {
  const rows = await tossCandles(a.krxCode, '1d', kstToMs(from))
  return rows.map((k) => ({ date: kstDateKey(k.t), o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }))
}

/** 1분봉 (통합 시세라 08:00~20:00 넥스트레이드 포함). 토스는 봉 끝 시각이라 시작 시각으로 1분 당김 */
export async function krxMinutes(a: Asset, since: number): Promise<Candle[]> {
  const rows = await tossMinutes(a.krxCode, since)
  return rows.filter((k) => k.v > 0).map((k) => ({ ...k, t: k.t - 60_000 }))
}

export function krxOrderbook(a: Asset) {
  return tossOrderbook(a.krxCode)
}

/**
 * 휴장일(평일) 집합
 * 과거: 일봉이 없는 평일 / 앞으로: 토스 장 운영 캘린더의 다음 영업일까지 건너뛴 평일
 */
export function krxHolidays(): Promise<Set<string>> {
  return cached('krx:holidays', 30 * 60_000, async () => {
    const [daily, cal] = await Promise.all([tossCandles('005930', '1d', Date.now() - 400 * 86400_000), tossCalendar()])
    const traded = new Set(daily.map((k) => kstDateKey(k.t)))
    const set = new Set<string>()
    const first = daily[0]?.t ?? Date.now()
    for (let t = first; t < Date.now() - 86400_000; t += 86400_000) if (!isWeekend(t) && !traded.has(kstDateKey(t))) set.add(kstDateKey(t))
    if (!cal.today.integrated?.regularMarket) set.add(cal.today.date.replace(/-/g, ''))
    const next = kstToMs(cal.nextBusinessDay.date.replace(/-/g, ''))
    for (let t = Date.now() + 86400_000; t < next; t += 86400_000) if (!isWeekend(t)) set.add(kstDateKey(t))
    return set
  })
}
