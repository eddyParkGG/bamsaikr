// Mapping of Korean underlyings listed on Hyperliquid (trade.xyz HIP-3) to KRX symbols
// fx: true multiplies the perp price (USDC) by KRW/USDC to convert to KRW
// KOSPI 200 (xyz:KR200) is excluded because the Toss Securities API only provides KOSPI/KOSDAQ indices

export type AssetId = 'SMSN' | 'SKHX' | 'HYUNDAI'

export interface Asset {
  id: AssetId
  name: string
  short: string
  perp: string // Hyperliquid coin name
  krxCode: string // domestic ticker code
  kind: 'stock' | 'index'
  fx: boolean
  tick: number // KRX price tick for display
}

export const ASSETS: Asset[] = [
  { id: 'SMSN', name: '삼성전자', short: '삼성전자', perp: 'xyz:SMSN', krxCode: '005930', kind: 'stock', fx: true, tick: 50 },
  { id: 'SKHX', name: 'SK하이닉스', short: '하이닉스', perp: 'xyz:SKHX', krxCode: '000660', kind: 'stock', fx: true, tick: 1000 },
  { id: 'HYUNDAI', name: '현대차', short: '현대차', perp: 'xyz:HYUNDAI', krxCode: '005380', kind: 'stock', fx: true, tick: 500 },
]

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, Asset>

export function isAssetId(v: string): v is AssetId {
  return v in ASSET_BY_ID
}
