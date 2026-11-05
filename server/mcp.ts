// MCP (Streamable HTTP, stateless). Claude/Cursor 등에서 URL 하나로 붙일 수 있게 조회 도구만 노출
// 주문은 실수 위험이 커서 MCP 에서는 dry-run 만 제공
import { Hono } from 'hono'
import { ASSET_BY_ID, ASSETS, isAssetId } from '../shared/assets.js'
import { arbAll, arbSnapshot } from './services/arb.js'
import { loadHistory, predictOpen } from './services/predict.js'
import { newsMarkers } from './services/news.js'
import { placePairOrder } from './services/orders.js'

const assetProp = { type: 'string', enum: ASSETS.map((a) => a.id), description: 'SMSN=삼성전자, SKHX=SK하이닉스, HYUNDAI=현대차, KR200=코스피200' }

const TOOLS = [
  {
    name: 'get_arbitrage',
    description: '하이퍼리퀴드 perp 와 KRX 가격 괴리율, 비용 뺀 순차익. asset 생략 시 전체 종목',
    inputSchema: { type: 'object', properties: { asset: assetProp } },
    run: async (a: Record<string, string>) => (a.asset && isAssetId(a.asset) ? arbSnapshot(ASSET_BY_ID[a.asset]) : arbAll()),
  },
  {
    name: 'predict_open',
    description: '다음 KRX 개장 시가 예측. 상승 확률(probUp), 예상 시가, 80% 구간, 과거 적중률',
    inputSchema: { type: 'object', properties: { asset: assetProp }, required: ['asset'] },
    run: async (a: Record<string, string>) => predictOpen(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID]),
  },
  {
    name: 'get_convergence_history',
    description: '과거 개장일별로 perp 가 예고한 갭과 실제 시가 갭, 어느 쪽이 맞췄는지',
    inputSchema: { type: 'object', properties: { asset: assetProp, limit: { type: 'number' } }, required: ['asset'] },
    run: async (a: Record<string, string>) => {
      const h = await loadHistory(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID])
      return { backtest: h.backtest, events: h.events.slice(-(Number(a.limit) || 20)).reverse() }
    },
  },
  {
    name: 'get_news',
    description: '종목의 날짜별 대표 이슈 (하루 1건)',
    inputSchema: { type: 'object', properties: { asset: assetProp }, required: ['asset'] },
    run: async (a: Record<string, string>) => newsMarkers(ASSET_BY_ID[a.asset as keyof typeof ASSET_BY_ID]),
  },
  {
    name: 'preview_pair_order',
    description: '차익 페어 주문 미리보기(dry-run). 실제 주문은 보내지 않음',
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
