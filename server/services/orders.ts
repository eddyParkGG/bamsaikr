// Orders. Dry-run by default (returns what would be sent without sending it)
// Live orders only when the server has keys in env vars and the request carries the API token
import { privateKeyToAccount } from 'viem/accounts'
import type { Asset } from '../../shared/assets.js'
import { cancelPerpOrder, perpAccount, planPerpOrder, sendPerpOrder, type HlNetwork } from '../../shared/hlOrder.js'
import { tossBuyingPower, tossCancel, tossEnabled, tossHoldings, tossOrder, tossOrderBody } from '../sources/toss.js'
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
  dryRun?: boolean
}

/** Toss Securities has no paper trading, so real money is spent → only when the server owner sets TOSS_LIVE_ORDERS=1 */
export const tossLiveOrders = () => tossEnabled() && process.env.TOSS_LIVE_ORDERS === '1'

export async function placeKrxOrder(asset: Asset, req: KrxOrderReq) {
  if (!Number.isInteger(req.qty) || req.qty <= 0) throw new OrderError(400, '수량은 1주 이상 정수로 입력해 주세요')
  const quote = await krxQuote(asset)
  const preview = {
    market: 'krx' as const,
    code: asset.krxCode,
    name: asset.name,
    side: req.side,
    qty: req.qty,
    orderType: req.price ? '지정가' : '시장가',
    price: req.price ?? null,
    estAmount: Math.round((req.price ?? quote.price) * req.qty),
    request: tossOrderBody({ code: asset.krxCode, side: req.side, qty: req.qty, price: req.price }),
  }
  if (req.dryRun !== false) return { dryRun: true, liveAvailable: tossLiveOrders(), preview }
  if (!tossLiveOrders()) throw new OrderError(403, '이 서버는 실제 주문을 꺼뒀어요. 국내 주식은 모의투자가 없어서 실제 돈이 나가요')
  const result = await tossOrder({ code: asset.krxCode, side: req.side, qty: req.qty, price: req.price })
  return { dryRun: false, preview, result }
}

export async function cancelKrxOrder(orderId: string) {
  if (!tossLiveOrders()) throw new OrderError(403, '이 서버는 실제 주문을 꺼뒀어요')
  return tossCancel(orderId)
}

export async function krxAccount() {
  if (!tossLiveOrders()) throw new OrderError(403, '이 서버는 계좌 조회를 꺼뒀어요')
  const [holdings, buyingPower] = await Promise.all([tossHoldings(), tossBuyingPower()])
  return { holdings, buyingPower }
}

// ───────── Hyperliquid ─────────

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
  if (req.dryRun !== false) {
    try {
      return { dryRun: true, plan: await planPerpOrder(network, { coin: asset.perp, ...req }) }
    } catch (e) {
      // Testnet books for HIP-3 coins are often empty: price the preview off the mainnet book instead
      if (network !== 'testnet') throw e
      return { dryRun: true, pricedFrom: 'mainnet', plan: await planPerpOrder('mainnet', { coin: asset.perp, ...req }) }
    }
  }
  const plan = await planPerpOrder(network, { coin: asset.perp, ...req })
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

/** Arbitrage pair: perp on one side + stock on the opposite side. 1 share = 1 perp contract */
export async function placePairOrder(asset: Asset, req: { notionalKrw: number; direction: 'perp_short_stock_long' | 'perp_long_stock_short'; network?: HlNetwork; dryRun?: boolean }) {
  if (asset.kind !== 'stock') throw new OrderError(400, `${asset.name}은 국내 주식과 1:1로 맞출 수 없어서 차익 페어를 지원하지 않아요`)
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
