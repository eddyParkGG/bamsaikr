// MCP (Streamable HTTP, stateless). Exposes read-only tools so Claude/Cursor etc. can connect with a single URL
// Orders are error-prone, so MCP only offers dry-run
import { Hono } from 'hono'
import { ASSET_BY_ID, ASSETS, canPredict, hasKrx, isAssetId } from '../shared/assets.js'
import { arbAll, arbSnapshot } from './services/arb.js'
import { loadHistory, predictOpen } from './services/predict.js'
import { newsMarkers } from './services/news.js'
import { placePairOrder } from './services/orders.js'

const assetProp = { type: 'string', enum: ASSETS.map((a) => a.id), description: 'SMSN=Samsung Electronics, SKHX=SK hynix, HYUNDAI=Hyundai Motor, SKHY=SK hynix ADR (0.1 share), KR200=KOSPI 200, EWY=MSCI Korea ETF, KORU=3x Korea ETF' }
/** Only domestic stocks have a next re-open to look at (same rule as the REST /predict and /convergence) */
const PREDICTABLE = ASSETS.filter((a) => hasKrx(a) && canPredict(a))
const stockProp = { type: 'string', enum: PREDICTABLE.map((a) => a.id), description: 'SMSN=Samsung Electronics, SKHX=SK hynix, HYUNDAI=Hyundai Motor' }
/** Assets with a domestic counterpart to compare against (same rule as REST /arb) */
const COMPARABLE = ASSETS.filter(hasKrx)
const comparableProp = { type: 'string', enum: COMPARABLE.map((a) => a.id), description: 'SMSN=Samsung Electronics, SKHX=SK hynix, HYUNDAI=Hyundai Motor, SKHY=SK hynix ADR (vs 0.1 common share)' }
function comparableOf(id: string) {
  const a = ASSET_BY_ID[id as keyof typeof ASSET_BY_ID]
  if (!COMPARABLE.includes(a)) throw new Error(`${a.name}은 국내에 같은 가격의 상품이 없어서 비교할 수 없어요. ${COMPARABLE.map((x) => x.id).join(', ')} 중 하나를 넣어 주세요`)
  return a
}
function stockOf(id: string) {
  const a = ASSET_BY_ID[id as keyof typeof ASSET_BY_ID]
  if (!PREDICTABLE.includes(a)) throw new Error(`${a.name}은 국내 주식이 아니라서 다음 국내 개장을 볼 수 없어요. ${PREDICTABLE.map((x) => x.id).join(', ')} 중 하나를 넣어 주세요`)
  return a
}

const TOOLS = [
  {
    name: 'get_arbitrage',
    description: 'Premium between Hyperliquid perp and KRX price, its usual level (5-day regular-session median) and the net left after costs on the gap beyond that level. All assets if asset is omitted',
    inputSchema: { type: 'object', properties: { asset: comparableProp } },
    run: async (a: Record<string, string>) => (a.asset ? arbSnapshot(comparableOf(a.asset)) : arbAll()),
  },
  {
    name: 'predict_open',
    description: 'Where the next domestic re-open (08:00–08:10 average on KRX/NXT, vs the 20:00 close) stands, for SMSN/SKHX/HYUNDAI. While the domestic market trades, status=in-session and preOpen is Hyperliquid at today\'s 08:00 open. Otherwise: the Hyperliquid price in KRW now and at the US close, how often past re-opens followed Hyperliquid at this stage of the night (night.follow.ratePct), the 80% band, and the overall follow rate (backtest.followRatePct). probUp and the expected price are model output, not a promise',
    inputSchema: { type: 'object', properties: { asset: stockProp }, required: ['asset'] },
    run: async (a: Record<string, string>) => predictOpen(stockOf(a.asset)),
  },
  {
    name: 'get_convergence_history',
    description: 'Past re-open record per day since 2026-04-13: Hyperliquid move while closed (20:00→08:00), actual re-open move, follow (yes/no/flat), and where the prices met. Newest first, 20 days unless limit is given',
    inputSchema: { type: 'object', properties: { asset: stockProp, limit: { type: 'number' } }, required: ['asset'] },
    run: async (a: Record<string, string>) => {
      const h = await loadHistory(stockOf(a.asset))
      return { backtest: h.backtest, events: h.events.slice(-(Number(a.limit) || 20)).reverse() }
    },
  },
  {
    name: 'get_news',
    description: 'Top issue per day for an asset (1 per day)',
    inputSchema: { type: 'object', properties: { asset: assetProp }, required: ['asset'] },
    run: async (a: Record<string, string>) => newsMarkers(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID]),
  },
  {
    name: 'preview_pair_order',
    description: 'Preview (dry-run) of an arbitrage pair order: stock quantity and the Hyperliquid order it would send. Nothing is ever sent from this server. Hyperliquid side is priced on testnet (the default network), so its price can differ from mainnet',
    inputSchema: {
      type: 'object',
      properties: { asset: assetProp, notionalKrw: { type: 'number' }, direction: { type: 'string', enum: ['perp_short_stock_long', 'perp_long_stock_short'] } },
      required: ['asset', 'notionalKrw', 'direction'],
    },
    run: async (a: Record<string, string>) =>
      placePairOrder(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID], { notionalKrw: Number(a.notionalKrw), direction: a.direction as 'perp_short_stock_long', dryRun: true }),
  },
]

type RpcReq = { jsonrpc: '2.0'; id?: string | number; method: string; params?: Record<string, unknown> }

async function handle(req: RpcReq) {
  switch (req.method) {
    case 'initialize':
      return { protocolVersion: (req.params?.protocolVersion as string) ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'bamsai', version: '1.0.0' } }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS.map(({ run: _run, ...t }) => t) }
    case 'tools/call': {
      const name = req.params?.name as string
      const args = (req.params?.arguments ?? {}) as Record<string, string>
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) throw Object.assign(new Error(`unknown tool ${name}`), { code: -32602 })
      if ('asset' in args && args.asset && !isAssetId(args.asset)) return { isError: true, content: [{ type: 'text', text: `asset 은 ${ASSETS.map((x) => x.id).join(', ')} 중 하나` }] }
      try {
        const out = await tool.run(args)
        return { content: [{ type: 'text', text: JSON.stringify(out) }] }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] }
      }
    }
    default:
      throw Object.assign(new Error(`method not found: ${req.method}`), { code: -32601 })
  }
}

export const mcp = new Hono()

mcp.get('/', (c) => c.text('MCP endpoint. POST JSON-RPC here.', 405))

mcp.post('/', async (c) => {
  const body = (await c.req.json()) as RpcReq | RpcReq[]
  const list = Array.isArray(body) ? body : [body]
  const replies = []
  for (const r of list) {
    if (r.id === undefined) continue // notification
    try {
      replies.push({ jsonrpc: '2.0', id: r.id, result: await handle(r) })
    } catch (e) {
      replies.push({ jsonrpc: '2.0', id: r.id, error: { code: (e as { code?: number }).code ?? -32603, message: (e as Error).message } })
    }
  }
  if (!replies.length) return c.body(null, 202)
  return c.json(Array.isArray(body) ? replies : replies[0])
})
