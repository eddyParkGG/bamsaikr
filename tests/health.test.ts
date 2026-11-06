import { afterAll, describe, expect, it, vi } from 'vitest'

// No Toss keys: the check must never issue a token (one live token per key; production holds it)
delete process.env.TOSS_CLIENT_ID
delete process.env.TOSS_CLIENT_SECRET
const { app } = await import('../server/app')

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const upstream = (url: string) =>
  url.includes('hyperliquid')
    ? ok([{ universe: [] }, []])
    : url.includes('upbit')
      ? ok([{ timestamp: Date.now(), orderbook_units: [{ ask_price: 1361, bid_price: 1359 }] }])
      : new Response('unexpected', { status: 500 })

describe('GET /api/health', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('200 ok while Hyperliquid and Upbit answer; Toss shown as disabled', async () => {
    const fetch = vi.fn(async (u: string | URL | Request) => upstream(String(u instanceof Request ? u.url : u)))
    vi.stubGlobal('fetch', fetch)
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ status: 'ok', coreFresh: true, sources: { hyperliquid: { core: true, fresh: true }, upbit: { core: true, fresh: true }, toss: { core: false, enabled: false, fresh: false } } })
    expect(fetch.mock.calls.some(([u]) => String(u).includes('tossinvest'))).toBe(false)
  })

  it('503 once the core sources have not answered for over 5 minutes, even with cached values', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 6 * 60_000 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })))
    const res = await app.request('/api/health')
    expect(res.status).toBe(503)
    const j = await res.json()
    expect(j).toMatchObject({ status: 'degraded', coreFresh: false, sources: { hyperliquid: { fresh: false }, upbit: { fresh: false } } })
    expect(j.sources.hyperliquid.ageSec).toBeGreaterThan(300)
  }, 10_000)
})
