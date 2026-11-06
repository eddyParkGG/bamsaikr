// Deterministic backend for the E2E suite: every /api call is answered from tests/e2e/fixtures (recorded once from
// https://bamsai.kr/api/v1/... on Fri 2026-11-06 17:43 KST, Nextrade session), the Hyperliquid and Upbit websockets
// are replaced by sockets the test drives, and anything else off-site is stubbed. Tests edit `api.data` to change
// what the server says (e.g. after the 20:00 close) and push ticks with `api.hlSend`.
// Re-record: curl -s --compressed "https://bamsai.kr/api/v1/<path>" -o tests/e2e/fixtures/<key>.json (keys: see keyOf)
import { test as base, expect, type WebSocketRoute } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'

const DIR = new URL('./fixtures/', import.meta.url)

/** Fixture name for an API URL, e.g. /api/v1/series?asset=SKHX&interval=1m → series-SKHX-1m */
function keyOf(u: URL) {
  const p = u.pathname.replace(/^\/api\/v1\//, '')
  const asset = u.searchParams.get('asset')
  if (p === 'predict' || p === 'news') return asset ? `${p}-${asset}` : p === 'news' ? 'news-home' : p
  if (p === 'series') return `series-${asset}-${u.searchParams.get('interval')}`
  if (['convergence', 'orderbook', 'flows'].includes(p)) return `${p}-${asset}`
  return p
}

export interface Api {
  /** Response body per fixture key; replace entries to change what the server answers from then on */
  data: Record<string, any>
  /** Every API request the page made (path + query), in order */
  requests: { method: string; url: string; body: string | null }[]
  /** Push one Hyperliquid websocket message to the page */
  hlSend: (msg: object) => Promise<void>
  /** Subscriptions the page sent to Hyperliquid */
  hlSubs: object[]
}

export const test = base.extend<{ api: Api }>({
  api: async ({ page }, use) => {
    const data: Api['data'] = {}
    for (const f of readdirSync(DIR)) if (f.endsWith('.json')) data[f.slice(0, -5)] = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))
    const requests: Api['requests'] = []
    const unmocked: string[] = []
    const errors: string[] = []

    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))

    // Off-site assets (web font CSS); analytics is off without VITE_GA_ID
    await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
    await page.route('**/api/**', (r) => {
      const req = r.request()
      const u = new URL(req.url())
      requests.push({ method: req.method(), url: u.pathname + u.search, body: req.postData() })
      // Live KRX trades (SSE): an empty stream that asks the browser not to reconnect for an hour
      if (u.pathname === '/api/v1/stream/krx') return r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'retry: 3600000\n\n' })
      const body = data[keyOf(u)]
      if (body === undefined) {
        unmocked.push(u.pathname + u.search)
        return r.fulfill({ status: 404, json: { error: 'no fixture' } })
      }
      return r.fulfill({ status: 200, json: body })
    })

    let hl: WebSocketRoute | null = null
    const hlSubs: object[] = []
    await page.routeWebSocket('wss://api.hyperliquid.xyz/ws', (ws) => {
      hl = ws
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m))
        if (msg.method === 'subscribe') hlSubs.push(msg.subscription)
      })
    })
    // Upbit KRW/USDC: open but silent, so the page falls back to the rate in the /arb fixture
    await page.routeWebSocket('wss://api.upbit.com/websocket/v1', () => {})

    const hlSend = async (msg: object) => {
      await expect.poll(() => hl, { message: 'Hyperliquid socket not opened' }).not.toBeNull()
      hl!.send(JSON.stringify(msg))
    }

    await use({ data, requests, hlSend, hlSubs })

    expect(unmocked, 'API calls without a fixture').toEqual([])
    expect(errors, 'console errors').toEqual([])
  },
})

export { expect }

/** Epoch ms of a KST wall-clock time, e.g. kst('2026-11-06T19:59:00') */
export const kst = (iso: string) => Date.parse(`${iso}+09:00`)
