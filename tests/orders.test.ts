import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Live orders must never go through without API_TOKEN, even when a request claims to come from the site itself
describe('live order guard', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.API_TOKEN
    delete process.env.TOSS_CLIENT_ID
    delete process.env.TOSS_CLIENT_SECRET
    delete process.env.TOSS_LIVE_ORDERS
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  const sameSite = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }

  it('refuses a live domestic order with a spoofed same-site header and no token', async () => {
    const { app } = await import('../server/app')
    const res = await app.request('/api/v1/orders/krx?asset=SMSN', { method: 'POST', headers: sameSite, body: JSON.stringify({ side: 'buy', qty: 1, price: 1000, dryRun: false }) })
    expect(res.status).toBe(403)
  })

  it('refuses account reads and cancels without a token', async () => {
    const { app } = await import('../server/app')
    expect((await app.request('/api/v1/account/krx', { headers: sameSite })).status).toBe(403)
    expect((await app.request('/api/v1/orders/krx/123', { method: 'DELETE', headers: sameSite })).status).toBe(403)
  })

  it('refuses a live pair order without a token, wrong token is 401', async () => {
    const { app } = await import('../server/app')
    const body = JSON.stringify({ notionalKrw: 1_000_000, direction: 'perp_short_stock_long', dryRun: false })
    expect((await app.request('/api/v1/orders/pair?asset=SMSN', { method: 'POST', headers: sameSite, body })).status).toBe(403)
    process.env.API_TOKEN = 'secret'
    expect((await app.request('/api/v1/orders/pair?asset=SMSN', { method: 'POST', headers: { ...sameSite, authorization: 'Bearer nope' }, body })).status).toBe(401)
  })
})
