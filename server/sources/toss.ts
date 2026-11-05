// 토스증권 Open API (https://developers.tossinvest.com)
// REST: https://openapi.tossinvest.com  /  실시간: wss://openapi-ws.tossinvest.com/ws/v1
// 허용 IP 에 등록된 서버에서만 호출 가능
import { cached, invalidate } from '../lib/cache.js'

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

/** 액세스 토큰 (유효 24시간 → 23시간 캐시) */
export function tossToken(): Promise<string> {
  return cached('toss:token', 23 * 3600_000, async () => {
    const res = await fetch(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.TOSS_CLIENT_ID!, client_secret: process.env.TOSS_CLIENT_SECRET! }),
      signal: AbortSignal.timeout(8000),
    })
    const j = (await res.json()) as { access_token?: string; error?: { code: string; message: string } }
    if (!res.ok || !j.access_token) throw new TossError(res.status, j.error?.code ?? 'auth', j.error?.message ?? '토스증권 인증 실패')
    return j.access_token
  })
}

async function call<T>(path: string, init: RequestInit & { account?: boolean } = {}, retry = 2): Promise<T> {
  if (!tossEnabled()) throw new TossError(503, 'no-key', '토스증권 키가 설정되지 않았어요')
  const token = await tossToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (init.account) headers['X-Tossinvest-Account'] = String(await accountSeq())
  const res = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(8000) })
  if (res.status === 429 && retry > 0) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('Retry-After') ?? 1) * 1000))
    return call(path, init, retry - 1)
  }
  const j = (await res.json()) as { result?: T; error?: { code: string; message: string } }
  // 다른 곳에서 토큰을 새로 받으면 이 토큰은 바로 무효가 됨 → 한 번 다시 발급
  if ((res.status === 401 || j.error?.code === 'token-revoked' || j.error?.code === 'token-expired') && retry > 0) {
    invalidate('toss:token')
    return call(path, init, 0)
  }
  if (!res.ok || j.error) throw new TossError(res.status, j.error?.code ?? String(res.status), j.error?.message ?? '토스증권 API 오류')
  return j.result as T
}

// ───────── 시세 ─────────

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

/** 캔들 (1m, 1d). 1회 200개라 since 까지 거슬러 올라가며 이어붙임. 반환은 오름차순 */
export function tossCandles(code: string, interval: '1m' | '1d', since: number, indicator = false): Promise<TossCandle[]> {
  const step = interval === '1d' ? 86400_000 : 60_000
  const bucket = Math.floor(since / (interval === '1d' ? 86400_000 : 600_000))
  const ttl = interval === '1d' ? 60_000 : 10_000
  return cached(`toss:candles:${code}:${interval}:${bucket}`, ttl, async () => {
    const out: TossCandle[] = []
    let before: string | undefined
    const base = indicator ? `/api/v1/market-indicators/${code}/candles?interval=${interval}` : `/api/v1/candles?symbol=${code}&interval=${interval}`
    for (let i = 0; i < 60; i++) {
      const r = await call<{ candles: RawCandle[]; nextBefore: string | null }>(`${base}&count=200${before ? `&before=${encodeURIComponent(before)}` : ''}`)
      if (!r.candles.length) break
      out.push(...r.candles.map(mapCandle))
      if (!r.nextBefore || Date.parse(r.nextBefore) < since) break
      before = r.nextBefore
    }
    return out.filter((k) => k.t >= since - step).sort((a, b) => a.t - b.t)
  })
}

/** 특정 시각 이전 count 개 (과거 하루치 확인용). 지난 데이터라 오래 캐시 */
export function tossCandlesBefore(code: string, interval: '1m' | '1d', before: number, count: number): Promise<TossCandle[]> {
  const iso = new Date(before + 9 * 3600_000).toISOString().replace('Z', '+09:00')
  return cached(`toss:before:${code}:${interval}:${before}:${count}`, before < Date.now() - 3600_000 ? 24 * 3600_000 : 10_000, async () => {
    const r = await call<{ candles: RawCandle[] }>(`/api/v1/candles?symbol=${code}&interval=${interval}&count=${count}&before=${encodeURIComponent(iso)}`)
    return r.candles.map(mapCandle).sort((a, b) => a.t - b.t)
  })
}

/**
 * 기간 분봉. 하루(08:00~20:00, 약 720개)씩 나눠 날짜끼리 병렬로 받음
 * 지난 날짜는 바뀌지 않으므로 하루 단위로 오래 캐시
 */
export async function tossMinutes(code: string, since: number): Promise<TossCandle[]> {
  const KST = 9 * 3600_000
  const days: number[] = []
  for (let d = Math.floor((since + KST) / 86400_000); d <= Math.floor((Date.now() + KST) / 86400_000); d++) days.push(d)
  const oneDay = (d: number) => {
    const dayStart = d * 86400_000 - KST // 해당 KST 날짜 00:00
    const isPast = dayStart + 86400_000 < Date.now()
    return cached(`toss:minday:${code}:${d}`, isPast ? 24 * 3600_000 : 15_000, async () => {
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
  }
  const all: TossCandle[] = []
  // 차트 API 초당 20회 한도 → 4일씩
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

// ───────── 계좌·주문 (실제 돈) ─────────

export function accountSeq() {
  return cached('toss:account', 3600_000, async () => {
    if (process.env.TOSS_ACCOUNT_SEQ) return Number(process.env.TOSS_ACCOUNT_SEQ)
    const r = await call<{ accountSeq: number; accountType: string }[]>(`/api/v1/accounts`)
    const acc = r.find((a) => a.accountType === 'BROKERAGE') ?? r[0]
    if (!acc) throw new TossError(404, 'no-account', '토스증권 계좌가 없어요')
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
