// Toss Securities live WebSocket relay. Connecting needs an Authorization header and an allowed IP, so browsers can't connect directly
// Limit of 2 concurrent connections per account → the server opens one and fans out to subscribers. Subscriptions are declarative (replace the whole array)
import { mapBook, tossToken, type TossLevel } from './toss.js'

const URL = 'wss://openapi-ws.tossinvest.com/ws/v1'

export type KrxEvent =
  | { type: 'trade'; code: string; t: number; price: number; volume: number }
  | { type: 'book'; code: string; t: number; asks: { px: number; sz: number }[]; bids: { px: number; sz: number }[] }
type Listener = (e: KrxEvent) => void

let ws: WebSocket | null = null
let connecting: Promise<void> | null = null
let ping: ReturnType<typeof setInterval> | undefined
const listeners = new Map<string, Set<Listener>>()

function declare() {
  if (ws?.readyState !== WebSocket.OPEN) return
  const codes = [...listeners.keys()]
  ws.send(JSON.stringify(codes.length ? [{ type: 'trade:kr', codes }, { type: 'orderbook:kr', codes }] : []))
}

function connect(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) return Promise.resolve()
  if (connecting) return connecting
  connecting = (async () => {
    const token = await tossToken()
    await new Promise<void>((resolve, reject) => {
      // Node 22's WebSocket accepts a headers option (unlike the standard browser constructor)
      const sock = new WebSocket(URL, { headers: { Authorization: `Bearer ${token}` } } as unknown as string[])
      ws = sock
      sock.onopen = () => {
        clearInterval(ping)
        ping = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('PING'), 60_000)
        resolve()
      }
      sock.onerror = () => reject(new Error('증권사 웹소켓 연결 실패'))
      sock.onclose = () => {
        clearInterval(ping)
        ws = null
        if (listeners.size) setTimeout(() => connect().then(declare).catch(() => {}), 2000)
      }
      sock.onmessage = (ev) => {
        let m: { type: string; topic?: string; data?: Record<string, unknown> }
        try {
          m = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (m.type !== 'message' || !m.topic || !m.data) return
        const [kind, , code] = m.topic.split(':')
        const set = listeners.get(code)
        if (!set) return
        const d = m.data
        let e: KrxEvent | null = null
        if (kind === 'trade') e = { type: 'trade', code, t: Date.parse(String(d.timestamp)), price: Number(d.price), volume: Number(d.volume) }
        else if (kind === 'orderbook') e = { type: 'book', code, ...mapBook(d as { timestamp: string; asks: TossLevel[]; bids: TossLevel[] }) }
        if (e) set.forEach((l) => l(e!))
      }
    })
  })().finally(() => {
    connecting = null
  })
  return connecting
}

export async function subscribeKrx(code: string, fn: Listener): Promise<() => void> {
  await connect()
  let set = listeners.get(code)
  const isNew = !set
  if (!set) {
    set = new Set()
    listeners.set(code, set)
  }
  set.add(fn)
  if (isNew) declare()
  return () => {
    set!.delete(fn)
    if (set!.size) return
    listeners.delete(code)
    if (listeners.size) declare()
    else ws?.close()
  }
}
