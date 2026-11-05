// 실시간 시세: 하이퍼리퀴드 WS + 업비트 WS 를 브라우저에서 직접 구독
// 메시지는 rAF 한 번에 모아서 store 에 반영 → 초당 수십 건이 와도 렌더는 프레임당 1회
import { create } from 'zustand'

export interface Level {
  px: number
  sz: number
}
export interface LiveCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

interface LiveState {
  ctx: Record<string, { mid: number; mark: number; oracle: number; funding: number; prevDay: number; t: number }>
  book: Record<string, { bids: Level[]; asks: Level[]; t: number }>
  candle: Record<string, LiveCandle>
  usdc: { rate: number; bid: number; ask: number; t: number } | null
  hlConnected: boolean
}

export const useLive = create<LiveState>(() => ({ ctx: {}, book: {}, candle: {}, usdc: null, hlConnected: false }))

let pending: Partial<LiveState> & { ctx?: LiveState['ctx']; book?: LiveState['book']; candle?: LiveState['candle'] } = {}
let raf = 0
function queue(patch: (p: typeof pending) => void) {
  patch(pending)
  if (!raf) {
    raf = requestAnimationFrame(() => {
      raf = 0
      const p = pending
      pending = {}
      useLive.setState((s) => ({
        ...p,
        ctx: p.ctx ? { ...s.ctx, ...p.ctx } : s.ctx,
        book: p.book ? { ...s.book, ...p.book } : s.book,
        candle: p.candle ? { ...s.candle, ...p.candle } : s.candle,
      }))
    })
  }
}

// ───────── 하이퍼리퀴드 ─────────

type Sub = { type: 'l2Book' | 'activeAssetCtx'; coin: string } | { type: 'candle'; coin: string; interval: string }

const subKey = (s: Sub) => JSON.stringify(s)
const refs = new Map<string, number>()
let ws: WebSocket | null = null
let retry = 0
let pingTimer: ReturnType<typeof setInterval> | undefined

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function connect() {
  ws = new WebSocket('wss://api.hyperliquid.xyz/ws')
  ws.onopen = () => {
    retry = 0
    useLive.setState({ hlConnected: true })
    for (const k of refs.keys()) send({ method: 'subscribe', subscription: JSON.parse(k) })
    clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ method: 'ping' }), 30_000)
  }
  ws.onclose = () => {
    useLive.setState({ hlConnected: false })
    clearInterval(pingTimer)
    ws = null
    if (refs.size) setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++))
  }
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data as string)
    switch (msg.channel) {
      case 'l2Book': {
        const d = msg.data
        const map = (l: { px: string; sz: string }) => ({ px: +l.px, sz: +l.sz })
        queue((p) => ((p.book ??= {})[d.coin] = { bids: d.levels[0].map(map), asks: d.levels[1].map(map), t: d.time }))
        break
      }
      case 'activeAssetCtx': {
        const { coin, ctx } = msg.data
        queue(
          (p) =>
            ((p.ctx ??= {})[coin] = {
              mid: +(ctx.midPx ?? ctx.markPx),
              mark: +ctx.markPx,
              oracle: +ctx.oraclePx,
              funding: +ctx.funding,
              prevDay: +ctx.prevDayPx,
              t: Date.now(),
            }),
        )
        break
      }
      case 'candle': {
        const k = msg.data
        queue((p) => ((p.candle ??= {})[`${k.s}:${k.i}`] = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }))
        break
      }
    }
  }
}

export function subscribeHl(sub: Sub): () => void {
  const k = subKey(sub)
  const n = (refs.get(k) ?? 0) + 1
  refs.set(k, n)
  if (!ws) connect()
  else if (n === 1) send({ method: 'subscribe', subscription: sub })
  return () => {
    const left = (refs.get(k) ?? 1) - 1
    if (left > 0) return void refs.set(k, left)
    refs.delete(k)
    send({ method: 'unsubscribe', subscription: sub })
  }
}

// ───────── 업비트 원/USDC ─────────

let upbit: WebSocket | null = null
let upbitRefs = 0

function connectUpbit() {
  upbit = new WebSocket('wss://api.upbit.com/websocket/v1')
  upbit.binaryType = 'arraybuffer'
  const dec = new TextDecoder()
  upbit.onopen = () => upbit?.send(JSON.stringify([{ ticket: `bamsai-${Math.random().toString(36).slice(2)}` }, { type: 'orderbook', codes: ['KRW-USDC.1'] }]))
  upbit.onmessage = (ev) => {
    const d = JSON.parse(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data))
    const u = d.orderbook_units?.[0]
    if (!u) return
    queue((p) => (p.usdc = { rate: (u.ask_price + u.bid_price) / 2, bid: u.bid_price, ask: u.ask_price, t: d.timestamp }))
  }
  upbit.onclose = () => {
    upbit = null
    if (upbitRefs) setTimeout(connectUpbit, 2000)
  }
}

export function subscribeUsdc(): () => void {
  upbitRefs++
  if (!upbit) connectUpbit()
  return () => {
    upbitRefs--
    if (!upbitRefs) upbit?.close()
  }
}
