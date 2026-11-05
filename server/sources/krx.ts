// Domestic quotes: Toss Securities Open API (consolidated KRX+NXT quotes)
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

/** Prices are scaled by asset.ratio so they are directly comparable to one perp unit (SKHY ADR = 0.1 share) */
export async function krxQuote(a: Asset): Promise<KrxQuote> {
  if (!a.krxCode) throw new Error(`${a.id} has no KRX counterpart`)
  const q = await rawQuote(a)
  const r = a.ratio
  return { ...q, price: q.price * r, prevClose: q.prevClose * r, open: q.open * r, high: q.high * r, low: q.low * r }
}

async function rawQuote(a: Asset): Promise<KrxQuote> {
  const [prices, daily] = await Promise.all([tossPrices([a.krxCode]), tossCandles(a.krxCode, '1d', Date.now() - 12 * 86400_000)])
  const price = prices.get(a.krxCode)?.price ?? daily.at(-1)?.c ?? 0
  const last = daily.at(-1)
  const isToday = !!last && kstDateKey(last.t) === kstDateKey(Date.now())
  // 'vs yesterday' uses the KRX regular-session close (same as the Toss app). On a trading day, the last close before today
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
  if (!a.krxCode) return []
  const r = a.ratio
  const rows = await tossCandles(a.krxCode, '1d', kstToMs(from))
  return rows.map((k) => ({ date: kstDateKey(k.t), o: k.o * r, h: k.h * r, l: k.l * r, c: k.c * r, v: k.v }))
}

/** 1-minute candles (consolidated, so 08:00~20:00 incl. Nextrade). Toss stamps bar end time, so shift back 1 min to bar start */
export async function krxMinutes(a: Asset, since: number): Promise<Candle[]> {
  if (!a.krxCode) return []
  const r = a.ratio
  const rows = await tossMinutes(a.krxCode, since)
  return rows.filter((k) => k.v > 0).map((k) => ({ t: k.t - 60_000, o: k.o * r, h: k.h * r, l: k.l * r, c: k.c * r, v: k.v }))
}

export async function krxOrderbook(a: Asset) {
  if (!a.krxCode) return null
  const b = await tossOrderbook(a.krxCode)
  const r = a.ratio
  return r === 1 ? b : { ...b, asks: b.asks.map((l) => ({ ...l, px: l.px * r })), bids: b.bids.map((l) => ({ ...l, px: l.px * r })) }
}

/** KRX regular-session open/close, scaled to one perp unit */
export async function krxSessions(a: Asset, from: string) {
  if (!a.krxCode) return []
  const r = a.ratio
  return (await regularSessions(a.krxCode, from)).map((s) => ({ ...s, open: s.open * r, close: s.close == null ? null : s.close * r }))
}

/**
 * Set of market holidays (weekdays)
 * Past: weekdays with no daily candle / Future: weekdays skipped until the next business day in Toss's market calendar
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
