// MCP (Streamable HTTP, stateless). Exposes read-only tools so Claude/Cursor etc. can connect with a single URL
// Orders are error-prone, so MCP only offers dry-run
import { Hono } from 'hono'
import { ASSET_BY_ID, ASSETS, isAssetId } from '../shared/assets.js'
import { arbAll, arbSnapshot } from './services/arb.js'
import { loadHistory, predictOpen } from './services/predict.js'
import { newsMarkers } from './services/news.js'
import { placePairOrder } from './services/orders.js'

const assetProp = { type: 'string', enum: ASSETS.map((a) => a.id), description: 'SMSN=Samsung Electronics, SKHX=SK hynix, HYUNDAI=Hyundai Motor, KR200=KOSPI 200' }

const TOOLS = [
  {
    name: 'get_arbitrage',
    description: 'Premium between Hyperliquid perp and KRX price, and net arbitrage after costs. All assets if asset is omitted',
    inputSchema: { type: 'object', properties: { asset: assetProp } },
    run: async (a: Record<string, string>) => (a.asset && isAssetId(a.asset) ? arbSnapshot(ASSET_BY_ID[a.asset]) : arbAll()),
  },
  {
    name: 'predict_open',
    description: 'Forecast of the next KRX opening price: probability of rising (probUp), expected open, 80% band, historical hit rate',
    inputSchema: { type: 'object', properties: { asset: assetProp }, required: ['asset'] },
    run: async (a: Record<string, string>) => predictOpen(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID]),
  },
  {
    name: 'get_convergence_history',
    description: 'Per past open day: gap implied by perp vs actual opening gap, and which side converged',
    inputSchema: { type: 'object', properties: { asset: assetProp, limit: { type: 'number' } }, required: ['asset'] },
    run: async (a: Record<string, string>) => {
      const h = await loadHistory(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID])
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
    description: 'Preview (dry-run) of an arbitrage pair order. No real order is sent',
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
