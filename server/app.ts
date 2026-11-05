import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { subscribeKrx } from './sources/tossWs.js'
import { ASSET_BY_ID, ASSETS, canPredict, hasKrx, isAssetId, PREDICTABLE, type Asset } from '../shared/assets.js'
import { nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session.js'
import { TossError, tossEnabled, tossInvestors } from './sources/toss.js'
import { getPerpBook, getPerpCtxs } from './sources/hyperliquid.js'
import { krxHolidays, krxOrderbook, krxSource } from './sources/krx.js'
import { arbAll, arbSnapshot, DEFAULT_COST, type CostInput } from './services/arb.js'
import { loadHistory, predictOpen } from './services/predict.js'
import { chartSeries, type ChartInterval } from './services/series.js'
import { newsMarkers } from './services/news.js'
import { indicators } from './services/indicators.js'
import {
  cancelKrxOrder,
  cancelPerp,
  krxAccount,
  OrderError,
  perpPositions,
  placeKrxOrder,
  placePairOrder,
  placePerpOrder,
  tossLiveOrders,
} from './services/orders.js'
import { openapi } from './openapi.js'
import { mcp } from './mcp.js'

export const app = new Hono().basePath('/api')

app.use('*', cors())

// For measuring the agent hypothesis (H5): log calls coming from outside the UI (aggregated in Vercel logs)
app.use('*', async (c, next) => {
  await next()
  if (c.req.header('sec-fetch-site') === 'same-origin') return
  console.log(JSON.stringify({ evt: 'api_call', path: c.req.path, status: c.res.status, ua: c.req.header('user-agent')?.slice(0, 80) }))
})

app.onError((err, c) => {
  if (err instanceof OrderError) return c.json({ error: err.message }, err.status)
  if (err instanceof TossError) return c.json({ error: err.message, code: err.code, source: 'toss' }, err.status === 403 ? 502 : 502)
  console.error(err)
  return c.json({ error: '잠시 후 다시 시도해 주세요', detail: (err as Error).message }, 500)
})

function assetOf(c: Context): Asset {
  const id = (c.req.query('asset') ?? c.req.param('asset') ?? '').toUpperCase()
  if (!isAssetId(id)) throw new OrderError(400, `asset 은 ${ASSETS.map((a) => a.id).join(', ')} 중 하나예요`)
  return ASSET_BY_ID[id]
}

function predictableOf(c: Context): Asset {
  const a = comparableOf(c)
  if (!canPredict(a)) throw new OrderError(400, `${a.name}은 미국 상장 상품이라 다음 날 국내 가격 예측을 하지 않아요`)
  return a
}

/** Premium/prediction endpoints only make sense for assets with a domestic counterpart */
function comparableOf(c: Context): Asset {
  const a = assetOf(c)
  if (!hasKrx(a)) throw new OrderError(400, `${a.name}은 국내에 같은 가격의 상품이 없어서 비교할 수 없어요`)
  return a
}

/**
 * Live order authorization
 * - Domestic (Toss Securities) has no paper trading, so only when the server owner sets TOSS_LIVE_ORDERS=1 (orders.ts)
 * - Orders from the same-site UI need no token; external (agent) calls require API_TOKEN
 * - Hyperliquid mainnet always requires the token; testnet is open
 */
const isExternal = (c: Context) => c.req.header('sec-fetch-site') !== 'same-origin'
function requireToken(c: Context) {
  const token = process.env.API_TOKEN
  if (!token) throw new OrderError(403, '이 서버는 실주문을 받지 않아요 (API_TOKEN 미설정). dryRun 으로 확인해 주세요')
  if (c.req.header('authorization') !== `Bearer ${token}`) throw new OrderError(401, 'Authorization: Bearer <API_TOKEN> 헤더가 필요해요')
}

function costFrom(c: Context): CostInput {
  const q = (k: keyof CostInput) => {
    const v = c.req.query(k)
    return v == null || v === '' || !Number.isFinite(+v) ? DEFAULT_COST[k] : +v
  }
  return { stockFeeBps: q('stockFeeBps'), stockTaxBps: q('stockTaxBps'), perpFeeBps: q('perpFeeBps'), fxFeeBps: q('fxFeeBps'), leverage: q('leverage'), holdHours: q('holdHours') }
}

const v1 = new Hono()

v1.get('/assets', (c) => c.json({ assets: ASSETS }))

v1.get('/status', async (c) => {
  const holidays = await krxHolidays()
  const now = Date.now()
  return c.json({
    now,
    session: sessionAt(now, holidays),
    nextOpen: nextRegularOpen(now, holidays),
    prevClose: prevRegularClose(now, holidays),
    krxSource: krxSource(),
    toss: tossEnabled(),
    liveKrxOrders: tossLiveOrders(),
    hlAgent: !!process.env.HL_AGENT_KEY,
  })
})

v1.get('/indicators', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30')
  return c.json({ items: await indicators() })
})

v1.get('/arb', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=4')
  const cost = costFrom(c)
  if (c.req.query('asset')) return c.json(await arbSnapshot(comparableOf(c), cost))
  const items = await arbAll(cost)
  return c.json({ items, best: [...items].sort((a, b) => b.net.netPct - a.net.netPct)[0] ?? null, cost })
})

// Hyperliquid market state for every listed asset (works for perp-only assets too)
v1.get('/perps', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=4')
  const ctxs = await getPerpCtxs()
  const items = ASSETS.map((a) => {
    const x = ctxs.get(a.perp)
    if (!x) return null
    const mid = x.midPx ?? x.markPx
    return { asset: a.id, coin: a.perp, mid, mark: x.markPx, prevDay: x.prevDayPx, fundingHourly: x.funding, openInterest: x.openInterest, volume24hUsd: x.dayNtlVlm, maxLeverage: x.maxLeverage }
  }).filter((x) => x != null)
  return c.json({ items })
})

v1.get('/predict', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30')
  if (c.req.query('asset')) return c.json(await predictOpen(predictableOf(c)))
  const items = await Promise.all(PREDICTABLE.map((a) => predictOpen(a)))
  return c.json({ items })
})

v1.get('/convergence', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  const h = await loadHistory(predictableOf(c))
  const limit = Math.min(500, Number(c.req.query('limit') ?? 200))
  return c.json({ backtest: h.backtest, events: h.events.slice(-limit).reverse() })
})

const INTERVALS = new Set<ChartInterval>(['1m', '5m', '15m', '1h', '1d'])
v1.get('/series', async (c) => {
  const interval = (c.req.query('interval') ?? '5m') as ChartInterval
  if (!INTERVALS.has(interval)) throw new OrderError(400, 'interval 은 1m, 5m, 15m, 1h, 1d 중 하나예요')
  c.header('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60')
  return c.json(await chartSeries(assetOf(c), interval))
})

v1.get('/orderbook', async (c) => {
  const asset = assetOf(c)
  const [perp, krx] = await Promise.all([getPerpBook(asset.perp), hasKrx(asset) ? krxOrderbook(asset) : null])
  return c.json({ perp, krx })
})

v1.get('/news', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  if (c.req.query('asset')) return c.json({ items: await newsMarkers(assetOf(c)) })
  // All assets: dedupe same-day same-title items, newest first
  const all = (await Promise.all(ASSETS.map(async (a) => (await newsMarkers(a)).map((n) => ({ ...n, asset: a.id }))))).flat()
  const seen = new Set<string>()
  const items = all
    .sort((a, b) => b.t - a.t)
    .filter((n) => (seen.has(n.date + n.title) ? false : (seen.add(n.date + n.title), true)))
    .slice(0, Number(c.req.query('limit') ?? 10))
  return c.json({ items })
})

v1.get('/flows', async (c) => {
  const asset = assetOf(c)
  c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  if (!hasKrx(asset)) return c.json({ investors: [], available: false })
  return c.json({ investors: await tossInvestors(asset.krxCode), available: true })
})

// Domestic live trades/orderbook (Toss Securities WebSocket relay, SSE). The browser reconnects automatically after the max function duration
v1.get('/stream/krx', async (c) => {
  const asset = comparableOf(c)
  const r = asset.ratio
  return streamSSE(c, async (stream) => {
    let closed = false
    const unsub = await subscribeKrx(asset.krxCode, (m) => {
      if (closed) return
      // Scale to one perp unit (SKHY ADR = 0.1 common share)
      const out = r === 1 ? m : m.type === 'trade' ? { ...m, price: m.price * r } : { ...m, asks: m.asks.map((l) => ({ ...l, px: l.px * r })), bids: m.bids.map((l) => ({ ...l, px: l.px * r })) }
      stream.writeSSE({ event: m.type, data: JSON.stringify(out) }).catch(() => {})
    })
    stream.onAbort(() => {
      closed = true
      unsub()
    })
    // Keep-alive comment + close ourselves before the function time limit
    const until = Date.now() + 55_000
    while (!closed && Date.now() < until) {
      await stream.sleep(15_000)
      await stream.write(': ping\n\n')
    }
    closed = true
    unsub()
  })
})

// ───────── Orders ─────────

v1.post('/orders/krx', async (c) => {
  const body = await c.req.json()
  const asset = assetOf(c)
  if (body.dryRun === false && isExternal(c)) requireToken(c)
  return c.json(await placeKrxOrder(asset, body))
})

v1.delete('/orders/krx/:orderId', async (c) => {
  if (isExternal(c)) requireToken(c)
  return c.json(await cancelKrxOrder(c.req.param('orderId')))
})

v1.get('/account/krx', async (c) => {
  if (isExternal(c)) requireToken(c)
  return c.json(await krxAccount())
})

v1.post('/orders/perp', async (c) => {
  const body = await c.req.json()
  if (body.dryRun === false && body.network === 'mainnet') requireToken(c)
  return c.json(await placePerpOrder(assetOf(c), body))
})

v1.delete('/orders/perp/:oid', async (c) => {
  if (c.req.query('network') === 'mainnet') requireToken(c)
  return c.json(await cancelPerp(assetOf(c), Number(c.req.param('oid')), c.req.query('network')))
})

v1.get('/account/perp', async (c) => {
  const network = c.req.query('network') === 'mainnet' ? 'mainnet' : 'testnet'
  return c.json(await perpPositions(network, c.req.query('user')))
})

v1.post('/orders/pair', async (c) => {
  const body = await c.req.json()
  if (body.dryRun === false && (isExternal(c) || body.network === 'mainnet')) requireToken(c)
  return c.json(await placePairOrder(assetOf(c), body))
})

app.route('/v1', v1)
app.get('/openapi.json', (c) => c.json(openapi))
app.route('/mcp', mcp)
app.get('/', (c) => c.json({ name: '밤사이 API', docs: '/api/openapi.json', mcp: '/api/mcp' }))
