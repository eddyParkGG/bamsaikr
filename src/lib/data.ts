// Shared data hooks: one definition (endpoint + refresh interval) per server resource,
// so every page shows the same numbers and refreshes them the same way.
import type { ArbSnapshot, Prediction, Status } from '../../shared/api'
import type { AssetId } from '../../shared/assets'
import { useLive } from './live'
import { useQuery } from './query'

export interface PerpQuote {
  asset: AssetId
  mid: number
  prevDay: number
  fundingHourly: number
  openInterest: number
  volume24hUsd: number
  maxLeverage: number
}

const REFRESH = { status: 60_000, arb: 3000, perps: 3000, predict: 15_000 } as const

export const useStatus = () => useQuery<Status & { liveKrxOrders?: boolean }>('/api/v1/status', REFRESH.status)

export function useArb(asset?: AssetId) {
  const q = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', REFRESH.arb)
  return { ...q, item: asset ? (q.data?.items.find((x) => x.asset === asset) ?? null) : null }
}

export function usePerps(asset?: AssetId) {
  const q = useQuery<{ items: PerpQuote[] }>('/api/v1/perps', REFRESH.perps)
  return { ...q, item: asset ? (q.data?.items.find((x) => x.asset === asset) ?? null) : null }
}

export const usePredictions = () => useQuery<{ items: Prediction[] }>('/api/v1/predict', REFRESH.predict)
export const usePrediction = (asset: AssetId | null) => useQuery<Prediction>(asset ? `/api/v1/predict?asset=${asset}` : null, REFRESH.predict)

/** KRW per USDC: live Upbit quote, else the rate the server used for the last spread snapshot */
export function useUsdcRate(): number | null {
  const live = useLive((s) => s.usdc?.rate)
  const arb = useArb()
  return live ?? arb.data?.items.find((x) => x.fx)?.fx?.rate ?? null
}
