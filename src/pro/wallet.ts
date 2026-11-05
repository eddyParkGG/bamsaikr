// 브라우저 지갑 → 에이전트 지갑 승인 → 에이전트 키로 주문 서명
// 메인 지갑 키는 페이지에 들어오지 않고, 주문 권한만 있는 에이전트 키를 이 브라우저에만 저장 (출금 권한 없음)
import { ExchangeClient } from '@nktkas/hyperliquid'
import { createWalletClient, custom, type EIP1193Provider } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { hlTransport, planPerpOrder, sendPerpOrder, type HlNetwork, type PerpOrderInput } from '../../shared/hlOrder'

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

const storeKey = (master: string, network: HlNetwork) => `bamsai-agent:${network}:${master.toLowerCase()}`

export async function connectWallet(): Promise<`0x${string}`> {
  if (!window.ethereum) throw new Error('브라우저 지갑(메타마스크, 래빗 등)이 필요해요')
  const [addr] = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[]
  return addr
}

export function getAgent(master: string, network: HlNetwork) {
  try {
    const key = localStorage.getItem(storeKey(master, network)) as `0x${string}` | null
    return key ? privateKeyToAccount(key) : null
  } catch {
    return null
  }
}

export async function approveAgent(master: `0x${string}`, network: HlNetwork) {
  const key = generatePrivateKey()
  const agent = privateKeyToAccount(key)
  const wallet = createWalletClient({ account: master, transport: custom(window.ethereum!) })
  const exchange = new ExchangeClient({ transport: hlTransport(network), wallet })
  await exchange.approveAgent({ agentAddress: agent.address, agentName: 'bamsai' })
  localStorage.setItem(storeKey(master, network), key)
  return agent
}

export function forgetAgent(master: string, network: HlNetwork) {
  localStorage.removeItem(storeKey(master, network))
}

export async function placeWithAgent(master: string, network: HlNetwork, input: PerpOrderInput) {
  const agent = getAgent(master, network)
  if (!agent) throw new Error('먼저 주문용 에이전트를 승인해 주세요')
  const plan = await planPerpOrder(network, input)
  const status = await sendPerpOrder(agent, plan)
  return { plan, status }
}
