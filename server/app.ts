import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { ASSET_BY_ID, ASSETS, isAssetId, type Asset } from '../shared/assets.js'
import { nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session.js'
import { KisError, kisEnabled, kisInvestors, kisProgramTrade } from './sources/kis.js'
import { getPerpBook } from './sources/hyperliquid.js'
import { krxHolidays, krxOrderbook, krxSource } from './sources/krx.js'
import { arbAll, arbSnapshot, DEFAULT_COST, type CostInput } from './services/arb.js'
import { loadHistory, predictOpen } from './services/predict.js'
import { chartSeries, type ChartInterval } from './services/series.js'
import { newsMarkers } from './services/news.js'
import {
  cancelKrxOrder,
  cancelPerp,
  krxAccount,
  krxBuyable,
  OrderError,
  perpPositions,
  placeKrxOrder,
  placePairOrder,
  placePerpOrder,
} from './services/orders.js'
import { openapi } from './openapi.js'
import { mcp } from './mcp.js'

export const app = new Hono().basePath('/api')

app.use('*', cors())

app.onError((err, c) => {
  if (err instanceof OrderError) return c.json({ error: err.message }, err.status)
  if (err instanceof KisError) return c.json({ error: err.message, code: err.code, source: 'kis' }, 502)
  console.error(err)
  return c.json({ error: '잠시 후 다시 시도해 주세요', detail: (err as Error).message }, 500)
})

function assetOf(c: Context): Asset {
  const id = (c.req.query('asset') ?? c.req.param('asset') ?? '').toUpperCase()
  if (!isAssetId(id)) throw new OrderError(400, `asset 은 ${ASSETS.map((a) => a.id).join(', ')} 중 하나예요`)
  return ASSET_BY_ID[id]
}

/** 실주문은 API_TOKEN 이 맞을 때만 */
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
    kis: kisEnabled(),
    hlAgent: !!process.env.HL_AGENT_KEY,
  })
})

v1.get('/arb', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=4')
  const cost = costFrom(c)
  if (c.req.query('asset')) return c.json(await arbSnapshot(assetOf(c), cost))
  const items = await arbAll(cost)
  return c.json({ items, best: [...items].sort((a, b) => b.net.netPct - a.net.netPct)[0] ?? null, cost })
})

v1.get('/predict', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30')
  if (c.req.query('asset')) return c.json(await predictOpen(assetOf(c)))
  const items = await Promise.all(ASSETS.map((a) => predictOpen(a)))
  return c.json({ items })
})

v1.get('/convergence', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  const h = await loadHistory(assetOf(c))
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
  const [perp, krx] = await Promise.all([getPerpBook(asset.perp), krxOrderbook(asset).catch(() => null)])
  return c.json({ perp, krx: krx?.krx ?? null, nxt: krx?.nxt ?? null, krxAvailable: !!krx })
})

v1.get('/news', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return c.json({ items: await newsMarkers(assetOf(c)) })
})

v1.get('/flows', async (c) => {
  const asset = assetOf(c)
  if (!kisEnabled() || asset.kind !== 'stock') return c.json({ investors: [], program: [], available: false })
  const [investors, program] = await Promise.all([kisInvestors(asset.krxCode).catch(() => []), kisProgramTrade(asset.krxCode).catch(() => [])])
  return c.json({ investors, program, available: true })
})

// ───────── 주문 ─────────

v1.post('/orders/krx', async (c) => {
  const body = await c.req.json()
  const asset = assetOf(c)
  if (body.dryRun === false) requireToken(c)
  return c.json(await placeKrxOrder(asset, body))
})

v1.delete('/orders/krx/:orderId', async (c) => {
  requireToken(c)
  return c.json(await cancelKrxOrder(c.req.param('orderId'), c.req.query('branch') ?? ''))
})

v1.get('/account/krx', async (c) => {
  requireToken(c)
  return c.json(await krxAccount())
})

v1.get('/account/krx/buyable', async (c) => {
  requireToken(c)
  const p = c.req.query('price')
  return c.json(await krxBuyable(assetOf(c), p ? +p : undefined))
})

v1.post('/orders/perp', async (c) => {
  const body = await c.req.json()
  if (body.dryRun === false) requireToken(c)
  return c.json(await placePerpOrder(assetOf(c), body))
})

v1.delete('/orders/perp/:oid', async (c) => {
  requireToken(c)
  return c.json(await cancelPerp(assetOf(c), Number(c.req.param('oid')), c.req.query('network')))
})

v1.get('/account/perp', async (c) => {
  const network = c.req.query('network') === 'mainnet' ? 'mainnet' : 'testnet'
  return c.json(await perpPositions(network, c.req.query('user')))
})

v1.post('/orders/pair', async (c) => {
  const body = await c.req.json()
  if (body.dryRun === false) requireToken(c)
  return c.json(await placePairOrder(assetOf(c), body))
})

app.route('/v1', v1)
app.get('/openapi.json', (c) => c.json(openapi))
app.route('/mcp', mcp)
app.get('/', (c) => c.json({ name: '밤사이 API', docs: '/api/openapi.json', mcp: '/api/mcp' }))
