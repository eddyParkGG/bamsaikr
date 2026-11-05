// 하이퍼리퀴드 perp 주문. 서버(API 에이전트 지갑)와 브라우저(사용자가 승인한 에이전트 지갑) 양쪽에서 같이 씀
import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid'
import { SymbolConverter } from '@nktkas/hyperliquid/utils'
import type { PrivateKeyAccount } from 'viem/accounts'

export type HlNetwork = 'mainnet' | 'testnet'

const transports = new Map<HlNetwork, HttpTransport>()
const converters = new Map<HlNetwork, Promise<SymbolConverter>>()

export function hlTransport(network: HlNetwork) {
  let t = transports.get(network)
  if (!t) {
    t = new HttpTransport({ isTestnet: network === 'testnet' })
    transports.set(network, t)
  }
  return t
}

function converter(network: HlNetwork) {
  let c = converters.get(network)
  if (!c) {
    c = SymbolConverter.create({ transport: hlTransport(network), dexs: ['xyz'] })
    converters.set(network, c)
  }
  return c
}

/** HL 가격 규칙: 유효숫자 5자리, 소수점은 (6 - szDecimals) 자리까지 */
export function formatPx(px: number, szDecimals: number) {
  const maxDecimals = Math.max(0, 6 - szDecimals)
  const sig = Number(px.toPrecision(5))
  return String(Number(sig.toFixed(maxDecimals)))
}

export function formatSz(sz: number, szDecimals: number) {
  const f = 10 ** szDecimals
  return String(Math.floor(sz * f) / f)
}

export interface PerpOrderInput {
  coin: string // 'xyz:SMSN'
  side: 'buy' | 'sell'
  size: number // 계약 수 (1 = 1주)
  price?: number // 없으면 시장가 (IOC + 슬리피지)
  slippagePct?: number
  leverage?: number
  reduceOnly?: boolean
}

export interface PerpOrderPlan {
  network: HlNetwork
  asset: number
  coin: string
  isBuy: boolean
  px: string
  sz: string
  tif: 'Gtc' | 'Ioc'
  leverage: number | null
  reduceOnly: boolean
  referencePx: number
}

/** 서명 전 주문 내용 확정 (dry-run 에서도 그대로 보여줌) */
export async function planPerpOrder(network: HlNetwork, input: PerpOrderInput): Promise<PerpOrderPlan> {
  const conv = await converter(network)
  const asset = conv.getAssetId(input.coin)
  const szDecimals = conv.getSzDecimals(input.coin)
  if (asset === undefined || szDecimals === undefined) throw new Error(`${network}에 ${input.coin} 마켓이 없어요`)

  const info = new InfoClient({ transport: hlTransport(network) })
  const book = await info.l2Book({ coin: input.coin })
  const bestBid = Number(book?.levels[0][0]?.px ?? 0)
  const bestAsk = Number(book?.levels[1][0]?.px ?? 0)
  const referencePx = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk
  if (!referencePx) throw new Error('호가가 비어 있어서 가격을 정할 수 없어요')

  const isBuy = input.side === 'buy'
  const slip = (input.slippagePct ?? 1) / 100
  const raw = input.price ?? (isBuy ? referencePx * (1 + slip) : referencePx * (1 - slip))
  const sz = formatSz(input.size, szDecimals)
  if (Number(sz) <= 0) throw new Error(`수량이 너무 작아요. 최소 단위는 ${10 ** -szDecimals}이에요`)
  return {
    network,
    asset,
    coin: input.coin,
    isBuy,
    px: formatPx(raw, szDecimals),
    sz,
    tif: input.price ? 'Gtc' : 'Ioc',
    leverage: input.leverage ?? null,
    reduceOnly: !!input.reduceOnly,
    referencePx,
  }
}

/** wallet: 에이전트 지갑(API wallet). 메인 지갑이 approveAgent 로 미리 승인해둔 키 */
export async function sendPerpOrder(wallet: PrivateKeyAccount, plan: PerpOrderPlan) {
  const exchange = new ExchangeClient({ transport: hlTransport(plan.network), wallet })
  if (plan.leverage) {
    // trade.xyz 한국 종목은 격리(isolated) 전용
    await exchange.updateLeverage({ asset: plan.asset, isCross: false, leverage: plan.leverage })
  }
  const res = await exchange.order({
    orders: [{ a: plan.asset, b: plan.isBuy, p: plan.px, s: plan.sz, r: plan.reduceOnly, t: { limit: { tif: plan.tif } } }],
    grouping: 'na',
  })
  const status = res.response.data.statuses[0]
  return status
}

export async function cancelPerpOrder(wallet: PrivateKeyAccount, network: HlNetwork, coin: string, oid: number) {
  const conv = await converter(network)
  const asset = conv.getAssetId(coin)
  if (asset === undefined) throw new Error(`${coin} 마켓이 없어요`)
  const exchange = new ExchangeClient({ transport: hlTransport(network), wallet })
  return exchange.cancel({ cancels: [{ a: asset, o: oid }] })
}

export async function perpAccount(network: HlNetwork, user: `0x${string}`) {
  const info = new InfoClient({ transport: hlTransport(network) })
  const [state, orders] = await Promise.all([info.clearinghouseState({ user, dex: 'xyz' }), info.frontendOpenOrders({ user, dex: 'xyz' })])
  return { state, orders }
}
