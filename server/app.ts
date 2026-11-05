import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { subscribeKrx } from './sources/tossWs.js'
import { ASSET_BY_ID, ASSETS, isAssetId, type Asset } from '../shared/assets.js'
import { nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session.js'
import { TossError, tossEnabled, tossInvestors } from './sources/toss.js'
import { getPerpBook } from './sources/hyperliquid.js'
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

// 에이전트 가설(H5) 측정용: 화면 밖 호출을 구분해서 로그로 남김 (Vercel 로그에서 집계)
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

/**
 * 실주문 권한
 * - 국내(토스증권)는 모의투자가 없어서 서버 주인이 TOSS_LIVE_ORDERS=1 로 켰을 때만 (orders.ts)
 * - 같은 사이트 화면에서 누른 주문은 토큰 없이, 외부(에이전트) 호출은 API_TOKEN 필요
 * - 하이퍼리퀴드 메인넷은 항상 토큰 필요, 테스트넷은 바로
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
  const [perp, krx] = await Promise.all([getPerpBook(asset.perp), krxOrderbook(asset)])
  return c.json({ perp, krx })
})

v1.get('/news', async (c) => {
  c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  if (c.req.query('asset')) return c.json({ items: await newsMarkers(assetOf(c)) })
  // 전체 종목: 같은 날 같은 제목은 하나로, 최신순
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
  return c.json({ investors: await tossInvestors(asset.krxCode), available: true })
})

// 국내 실시간 체결·호가 (토스증권 웹소켓 중계, SSE). 함수 최대 실행시간이 지나면 브라우저가 알아서 다시 붙음
v1.get('/stream/krx', async (c) => {
  const asset = assetOf(c)
  return streamSSE(c, async (stream) => {
    let closed = false
    const unsub = await subscribeKrx(asset.krxCode, (m) => {
      if (!closed) stream.writeSSE({ event: m.type, data: JSON.stringify(m) }).catch(() => {})
    })
    stream.onAbort(() => {
      closed = true
      unsub()
    })
    // 연결 유지용 주석 + 함수 시간 제한 전에 스스로 닫기
    const until = Date.now() + 55_000
    while (!closed && Date.now() < until) {
      await stream.sleep(15_000)
      await stream.write(': ping\n\n')
    }
    closed = true
    unsub()
  })
})

// ───────── 주문 ─────────

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
