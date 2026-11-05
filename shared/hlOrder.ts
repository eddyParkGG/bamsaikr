// Hyperliquid perp orders. Shared by the server (API agent wallet) and the browser (user-approved agent wallet)
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

/** HL price rule: 5 significant figures, up to (6 - szDecimals) decimals */
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
  size: number // contracts (1 = 1 share)
  price?: number // market order if omitted (IOC + slippage)
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

/** Finalize order contents before signing (also shown as-is in dry-run) */
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

/** wallet: agent wallet (API wallet). Key pre-approved by the main wallet via approveAgent */
export async function sendPerpOrder(wallet: PrivateKeyAccount, plan: PerpOrderPlan) {
  const exchange = new ExchangeClient({ transport: hlTransport(plan.network), wallet })
  if (plan.leverage) {
    // trade.xyz Korean assets are isolated-margin only
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
