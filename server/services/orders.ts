// 주문. 기본은 dry-run (실제로 보내지 않고 보낼 내용만 돌려줌)
// 실주문은 서버 환경변수로 키가 있고, 요청에 API 토큰이 있을 때만
import { privateKeyToAccount } from 'viem/accounts'
import type { Asset } from '../../shared/assets.js'
import { cancelPerpOrder, perpAccount, planPerpOrder, sendPerpOrder, type HlNetwork } from '../../shared/hlOrder.js'
import { kisBalance, kisBuyable, kisCancel, kisConfig, kisOrder } from '../sources/kis.js'
import { krxQuote } from '../sources/krx.js'

export class OrderError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 503,
    message: string,
  ) {
    super(message)
  }
}

export interface KrxOrderReq {
  side: 'buy' | 'sell'
  qty: number
  price?: number
  exchange?: 'KRX' | 'NXT' | 'SOR'
  dryRun?: boolean
}

export async function placeKrxOrder(asset: Asset, req: KrxOrderReq) {
  if (asset.kind !== 'stock') throw new OrderError(400, '지수는 직접 주문할 수 없어요. ETF 종목코드로 주문해 주세요')
  if (!Number.isInteger(req.qty) || req.qty <= 0) throw new OrderError(400, '수량은 1주 이상 정수로 입력해 주세요')
  const quote = await krxQuote(asset)
  const cfg = kisConfig()
  const preview = {
    market: 'krx' as const,
    code: asset.krxCode,
    name: asset.name,
    side: req.side,
    qty: req.qty,
    orderType: req.price ? '지정가' : '시장가',
    price: req.price ?? null,
    estAmount: Math.round((req.price ?? quote.price) * req.qty),
    account: cfg ? (cfg.env === 'prod' ? '실전' : '모의투자') : null,
  }
  if (req.dryRun !== false) return { dryRun: true, preview }
  if (!cfg) throw new OrderError(503, 'KIS 키가 설정되지 않아서 실제 주문은 할 수 없어요')
  const result = await kisOrder({ code: asset.krxCode, side: req.side, qty: req.qty, price: req.price, exchange: req.exchange })
  return { dryRun: false, preview, result }
}

export async function cancelKrxOrder(orderId: string, branch: string) {
  return kisCancel({ orderId, branch })
}

export async function krxAccount() {
  if (!kisConfig()) throw new OrderError(503, 'KIS 키가 설정되지 않았어요')
  return kisBalance()
}

export async function krxBuyable(asset: Asset, price?: number) {
  if (!kisConfig()) throw new OrderError(503, 'KIS 키가 설정되지 않았어요')
  const p = price ?? (await krxQuote(asset)).price
  return kisBuyable(asset.krxCode, p)
}

// ───────── 하이퍼리퀴드 ─────────

function serverAgent() {
  const key = process.env.HL_AGENT_KEY as `0x${string}` | undefined
  const account = process.env.HL_ACCOUNT as `0x${string}` | undefined
  if (!key || !account) return null
  return { wallet: privateKeyToAccount(key), account }
}

export function resolveNetwork(v: unknown): HlNetwork {
  if (v === 'mainnet') {
    if (process.env.HL_ALLOW_MAINNET !== '1') throw new OrderError(403, '이 서버는 메인넷 주문을 막아뒀어요. 테스트넷으로 보내 주세요')
    return 'mainnet'
  }
  return 'testnet'
}

export interface PerpOrderReq {
  side: 'buy' | 'sell'
  size: number
  price?: number
  leverage?: number
  reduceOnly?: boolean
  slippagePct?: number
  network?: HlNetwork
  dryRun?: boolean
}

export async function placePerpOrder(asset: Asset, req: PerpOrderReq) {
  if (!(req.size > 0)) throw new OrderError(400, '수량을 입력해 주세요')
  const network = req.dryRun === false ? resolveNetwork(req.network) : (req.network ?? 'testnet')
  const plan = await planPerpOrder(network, { coin: asset.perp, ...req })
  if (req.dryRun !== false) return { dryRun: true, plan }
  const agent = serverAgent()
  if (!agent) throw new OrderError(503, '서버에 하이퍼리퀴드 에이전트 지갑이 설정되지 않았어요')
  const status = await sendPerpOrder(agent.wallet, plan)
  return { dryRun: false, plan, status }
}

export async function cancelPerp(asset: Asset, oid: number, network: unknown) {
  const agent = serverAgent()
  if (!agent) throw new OrderError(503, '서버에 하이퍼리퀴드 에이전트 지갑이 설정되지 않았어요')
  return cancelPerpOrder(agent.wallet, resolveNetwork(network), asset.perp, oid)
}

export async function perpPositions(network: HlNetwork, user?: string) {
  const addr = (user ?? serverAgent()?.account) as `0x${string}` | undefined
  if (!addr) throw new OrderError(400, '조회할 지갑 주소(user)를 알려 주세요')
  return perpAccount(network, addr)
}

/** 차익 거래 한 쌍: perp 한쪽 + 주식 반대쪽. 수량은 1주 = perp 1계약 */
export async function placePairOrder(asset: Asset, req: { notionalKrw: number; direction: 'perp_short_stock_long' | 'perp_long_stock_short'; network?: HlNetwork; dryRun?: boolean }) {
  if (asset.kind !== 'stock') throw new OrderError(400, '페어 주문은 개별 종목만 가능해요')
  const quote = await krxQuote(asset)
  const qty = Math.floor(req.notionalKrw / quote.price)
  if (qty < 1) throw new OrderError(400, `1주(${quote.price.toLocaleString()}원) 이상 금액을 입력해 주세요`)
  const stockSide = req.direction === 'perp_short_stock_long' ? 'buy' : 'sell'
  const perpSide = stockSide === 'buy' ? 'sell' : 'buy'
  const dryRun = req.dryRun !== false
  const [stock, perp] = await Promise.all([
    placeKrxOrder(asset, { side: stockSide, qty, dryRun }),
    placePerpOrder(asset, { side: perpSide, size: qty, network: req.network, dryRun, leverage: 2 }),
  ])
  return { dryRun, qty, stock, perp }
}
