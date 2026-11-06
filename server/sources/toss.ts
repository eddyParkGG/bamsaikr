// Toss Securities Open API (https://developers.tossinvest.com)
// REST: https://openapi.tossinvest.com  /  live: wss://openapi-ws.tossinvest.com/ws/v1
// Callable only from servers on the allowed IP list
import { cached, invalidate } from '../lib/cache.js'
import { markOk } from '../lib/health.js'

const BASE = 'https://openapi.tossinvest.com'

export const tossEnabled = () => !!(process.env.TOSS_CLIENT_ID && process.env.TOSS_CLIENT_SECRET)

export class TossError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Access token (valid 24h → cached 23h) */
export function tossToken(): Promise<string> {
  return cached('toss:token', 23 * 3600_000, async () => {
    const res = await fetch(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TOSS_CLIENT_ID!, client_secret: process.env.TOSS_CLIENT_SECRET! }),
      signal: AbortSignal.timeout(8000),
    })
    const j = (await res.json()) as { access_token?: string; error?: { code: string; message: string } }
    if (!res.ok || !j.access_token) throw new TossError(res.status, j.error?.code ?? 'auth', j.error?.message ?? '증권사 인증 실패')
    return j.access_token
  })
}

/**
 * Toss caps request rates per API group (published table, 2026-08: chart 20/s, quotes 15/s, index candles 5/s,
 * calendar 3/s, ...). One page load fans out to quotes, charts, indices and flows at once and visitors stack up,
 * so bursts went over and came back empty. Each group gets its own queue, set below the published cap
 */
const GROUPS: [RegExp, string, number][] = [
  [/^\/api\/v1\/market-indicators\/[^/]+\/candles/, 'indicator_chart', 4],
  [/^\/api\/v1\/market-indicators/, 'indicator', 8],
  [/^\/api\/v1\/candles/, 'chart', 15],
  [/^\/api\/v1\/(prices|orderbook)/, 'market_data', 12],
  [/^\/api\/v1\/stocks\/[^/]+\/investor/, 'trading_trend', 8],
  [/^\/api\/v1\/market-calendar/, 'market_info', 2],
  [/^\/api\/v1\/accounts/, 'account', 1],
  [/^\/api\/v1\/orders/, 'order', 8],
]
export function tossGroup(path: string): { name: string; perSec: number } {
  const g = GROUPS.find(([re]) => re.test(path))
  return g ? { name: g[1], perSec: g[2] } : { name: 'other', perSec: 4 }
}

const recent = new Map<string, number[]>()
export async function tossSlot(group: { name: string; perSec: number }, now = () => Date.now()) {
  for (;;) {
    const t = now()
    const list = (recent.get(group.name) ?? []).filter((s) => t - s < 1000)
    recent.set(group.name, list)
    if (list.length < group.perSec) {
      list.push(t)
      return
    }
    await new Promise((r) => setTimeout(r, 1000 - (t - list[0]) + 5))
  }
}

// Per-minute tally in the logs: calls and rate-limit hits per group, to tune the caps above against reality
const tally = new Map<string, { calls: number; limited: number }>()
const bump = (g: string, k: 'calls' | 'limited') => {
  const v = tally.get(g) ?? { calls: 0, limited: 0 }
  v[k]++
  tally.set(g, v)
}
setInterval(() => {
  if (!tally.size) return
  console.log(JSON.stringify({ evt: 'toss_minute', groups: Object.fromEntries(tally) }))
  tally.clear()
}, 60_000).unref?.()

async function call<T>(path: string, init: RequestInit & { account?: boolean } = {}, retry = 3): Promise<T> {
  if (!tossEnabled()) throw new TossError(503, 'no-key', '증권사 API 키가 설정되지 않았어요')
  const token = await tossToken()
  const group = tossGroup(path)
  await tossSlot(group)
  bump(group.name, 'calls')
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (init.account) headers['X-Tossinvest-Account'] = String(await accountSeq())
  const res = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(8000) })
  // Toss reports the cap as HTTP 429 or as error code rate-limit-exceeded; peek without consuming the body
  const limited = res.status === 429 || (res.status >= 400 && (await res.clone().text()).includes('rate-limit-exceeded'))
  if (limited && retry > 0) {
    bump(group.name, 'limited')
    // Back off a little longer each time (1s, 2s, 3s) unless Toss says how long
    await new Promise((r) => setTimeout(r, Number(res.headers.get('Retry-After') ?? 4 - retry) * 1000))
    return call(path, init, retry - 1)
  }
  const j = (await res.json()) as { result?: T; error?: { code: string; message: string } }
  // A token issued elsewhere invalidates this one immediately → reissue once
  if ((res.status === 401 || j.error?.code === 'token-revoked' || j.error?.code === 'token-expired') && retry > 0) {
    invalidate('toss:token')
    return call(path, init, 0)
  }
  if (!res.ok || j.error) throw new TossError(res.status, j.error?.code ?? String(res.status), j.error?.message ?? '증권사 API 오류')
  markOk('toss')
  return j.result as T
}

// ───────── Quotes ─────────

export interface TossLevel {
  price: string
  volume: string
}

export function tossOrderbook(code: string) {
  return cached(`toss:book:${code}`, 500, async () => {
    const r = await call<{ timestamp: string; asks: TossLevel[]; bids: TossLevel[] }>(`/api/v1/orderbook?symbol=${code}`)
    return mapBook(r)
  })
}

export function mapBook(r: { timestamp: string; asks: TossLevel[]; bids: TossLevel[] }) {
  const m = (l: TossLevel) => ({ px: +l.price, sz: +l.volume })
  return { t: Date.parse(r.timestamp), asks: r.asks.map(m), bids: r.bids.map(m) }
}

export function tossPrices(codes: string[]) {
  return cached(`toss:prices:${codes.join(',')}`, 800, async () => {
    const r = await call<{ symbol: string; timestamp: string; lastPrice: string }[]>(`/api/v1/prices?symbols=${codes.join(',')}`)
    return new Map(r.map((p) => [p.symbol, { price: +p.lastPrice, t: Date.parse(p.timestamp) }]))
  })
}

export interface TossCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

type RawCandle = { timestamp: string; openPrice: string; highPrice: string; lowPrice: string; closePrice: string; volume: string }
const mapCandle = (k: RawCandle): TossCandle => ({ t: Date.parse(k.timestamp), o: +k.openPrice, h: +k.highPrice, l: +k.lowPrice, c: +k.closePrice, v: +k.volume })

/** Candles (1m, 1d). 200 per call, so page backwards to `since` and concatenate. Returns ascending */
/**
 * Candles since `since`. Past bars never change, so the full history is cached for long (10 min for minutes,
 * 1 h for days) and only the newest page of 200 is refetched often (10 s / 60 s) and laid over it.
 * Before, minute charts refetched days of bars every 10 s: the index sparklines alone took ~50 calls a minute
 */
export async function tossCandles(code: string, interval: '1m' | '1d', since: number, indicator = false): Promise<TossCandle[]> {
  const step = interval === '1d' ? 86400_000 : 60_000
  const bucket = Math.floor(since / (interval === '1d' ? 86400_000 : 600_000))
  const base = indicator ? `/api/v1/market-indicators/${code}/candles?interval=${interval}` : `/api/v1/candles?symbol=${code}&interval=${interval}`
  const full = cached(`toss:candles:${code}:${interval}:${bucket}`, interval === '1d' ? 3600_000 : 10 * 60_000, async () => {
    const out: TossCandle[] = []
    let before: string | undefined
    for (let i = 0; i < 60; i++) {
      const r = await call<{ candles: RawCandle[]; nextBefore: string | null }>(`${base}&count=200${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      if (!r.candles.length) break
      out.push(...r.candles.map(mapCandle))
      if (!r.nextBefore || Date.parse(r.nextBefore) < since) break
      before = r.nextBefore
    }
    return out
  })
  const head = cached(`toss:candles:head:${code}:${interval}`, interval === '1d' ? 60_000 : 10_000, async () =>
    (await call<{ candles: RawCandle[] }>(`${base}&count=200`)).candles.map(mapCandle),
  )
  // Await both together: awaiting one at a time leaves the other's rejection unhandled, which kills the process
  const [fullBars, headBars] = await Promise.all([full, head])
  const byTime = new Map<number, TossCandle>()
  for (const k of fullBars) byTime.set(k.t, k)
  for (const k of headBars) byTime.set(k.t, k)
  return [...byTime.values()].filter((k) => k.t >= since - step).sort((a, b) => a.t - b.t)
}

/** `count` candles before a given time (to inspect a past day). Historical, so cached long */
export function tossCandlesBefore(code: string, interval: '1m' | '1d', before: number, count: number): Promise<TossCandle[]> {
  const iso = new Date(before + 9 * 3600_000).toISOString().replace('Z', '+09:00')
  return cached(`toss:before:${code}:${interval}:${before}:${count}`, before < Date.now() - 3600_000 ? 24 * 3600_000 : 10_000, async () => {
    const r = await call<{ candles: RawCandle[] }>(`/api/v1/candles?symbol=${code}&interval=${interval}&count=${count}&before=${encodeURIComponent(iso)}`)
    return r.candles.map(mapCandle).sort((a, b) => a.t - b.t)
  })
}

/**
 * Minute bars for a range. Split per day (08:00~20:00, ~720 bars) and fetched in parallel across days
 * Past days never change, so they are cached long per day
 */
export async function tossMinutes(code: string, since: number): Promise<TossCandle[]> {
  const KST = 9 * 3600_000
  const days: number[] = []
  for (let d = Math.floor((since + KST) / 86400_000); d <= Math.floor((Date.now() + KST) / 86400_000); d++) days.push(d)
  const oneDay = (d: number) => {
    const dayStart = d * 86400_000 - KST // 00:00 of that KST date
    const isPast = dayStart + 86400_000 < Date.now()
    const day = cached(`toss:minday:${code}:${d}`, isPast ? 24 * 3600_000 : 10 * 60_000, async () => {
      const out: TossCandle[] = []
      let before = Math.min(Date.now(), dayStart + 20 * 3600_000 + 60_000)
      for (let i = 0; i < 5; i++) {
        const iso = new Date(before + KST).toISOString().replace('Z', '+09:00')
        const r = await call<{ candles: RawCandle[]; nextBefore: string | null }>(`/api/v1/candles?symbol=${code}&interval=1m&count=200&before=${encodeURIComponent(iso)}`)
        const rows = r.candles.map(mapCandle).filter((k) => k.t >= dayStart)
        out.push(...rows)
        if (rows.length < r.candles.length || !r.nextBefore) break
        before = Date.parse(r.nextBefore)
        if (before < dayStart + 8 * 3600_000) break
      }
      return out
    })
    if (isPast) return day
    // Today: the pages already fetched stay for 10 min; only the newest 200 bars are refetched every 10 s
    // Same request and cache key as tossCandles' newest page, so the two share one call
    const head = cached(`toss:candles:head:${code}:1m`, 10_000, async () =>
      (await call<{ candles: RawCandle[] }>(`/api/v1/candles?symbol=${code}&interval=1m&count=200`)).candles.map(mapCandle),
    ).then((rows) => rows.filter((k) => k.t >= dayStart))
    return Promise.all([day, head]).then(([a, b]) => {
      const byTime = new Map<number, TossCandle>()
      for (const k of a) byTime.set(k.t, k)
      for (const k of b) byTime.set(k.t, k)
      return [...byTime.values()]
    })
  }
  const all: TossCandle[] = []
  // Chart API limit is 20 req/sec → 4 days at a time
  for (let i = 0; i < days.length; i += 4) all.push(...(await Promise.all(days.slice(i, i + 4).map(oneDay))).flat())
  return all.filter((k) => k.t >= since).sort((a, b) => a.t - b.t)
}

export function tossIndicatorPrices(symbols: string[]) {
  return cached(`toss:ind:${symbols.join(',')}`, 2000, async () => {
    const r = await call<Record<string, unknown>[]>(`/api/v1/market-indicators/prices?symbols=${symbols.join(',')}`)
    return r
  })
}

export interface TossCalendarDay {
  date: string
  integrated: { preMarket?: { startTime: string; endTime: string }; regularMarket?: { startTime: string; endTime: string }; afterMarket?: { startTime: string; endTime: string } } | null
}

export function tossCalendar() {
  return cached('toss:calendar', 10 * 60_000, () => call<{ today: TossCalendarDay; previousBusinessDay: TossCalendarDay; nextBusinessDay: TossCalendarDay }>(`/api/v1/market-calendar/KR`))
}

export function tossInvestors(code: string) {
  return cached(`toss:investor:${code}`, 60_000, async () => {
    const r = await call<{ records: { date: string; individual: { netBuyVolume: string } | null; foreigner: { netBuyVolume: string } | null; institution: { netBuyVolume: string } | null }[] }>(
      `/api/v1/stocks/${code}/investor-trading?count=20`,
    )
    return r.records.map((d) => ({
      date: d.date.replace(/-/g, ''),
      individual: d.individual ? +d.individual.netBuyVolume : null,
      foreign: d.foreigner ? +d.foreigner.netBuyVolume : null,
      institution: d.institution ? +d.institution.netBuyVolume : null,
    }))
  })
}

// ───────── Account / orders (real money) ─────────

export function accountSeq() {
  return cached('toss:account', 3600_000, async () => {
    if (process.env.TOSS_ACCOUNT_SEQ) return Number(process.env.TOSS_ACCOUNT_SEQ)
    const r = await call<{ accountSeq: number; accountType: string }[]>(`/api/v1/accounts`)
    const acc = r.find((a) => a.accountType === 'BROKERAGE') ?? r[0]
    if (!acc) throw new TossError(404, 'no-account', '증권 계좌가 없어요')
    return acc.accountSeq
  })
}

export interface TossOrderInput {
  code: string
  side: 'buy' | 'sell'
  qty: number
  price?: number
}

export function tossOrderBody(p: TossOrderInput) {
  return {
    clientOrderId: `bamsai-${Date.now()}`,
    symbol: p.code,
    side: p.side === 'buy' ? 'BUY' : 'SELL',
    orderType: p.price ? 'LIMIT' : 'MARKET',
    quantity: String(p.qty),
    ...(p.price ? { price: String(p.price) } : {}),
  }
}

export function tossOrder(p: TossOrderInput) {
  return call<Record<string, unknown>>(`/api/v1/orders`, { method: 'POST', body: JSON.stringify(tossOrderBody(p)), account: true })
}

export function tossCancel(orderId: string) {
  return call<Record<string, unknown>>(`/api/v1/orders/${orderId}/cancel`, { method: 'POST', body: '{}', account: true })
}

export function tossHoldings() {
  return call<Record<string, unknown>>(`/api/v1/holdings`, { account: true })
}

export function tossBuyingPower() {
  return call<Record<string, unknown>>(`/api/v1/buying-power?currency=KRW`, { account: true })
}
