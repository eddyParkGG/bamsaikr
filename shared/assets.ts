// Korean-equity products on Hyperliquid (trade.xyz HIP-3) and their domestic counterparts
// fx: perp is quoted in USDC → multiply by KRW/USDC to compare in KRW
// krx: the KRX-listed instrument with the same economics, and how many KRX shares one perp unit equals.
//   null when there is no 1:1 domestic counterpart (index without a Toss feed, US-listed ETFs):
//   those assets get chart/order book/orders but no premium or open prediction

export type AssetId = 'SMSN' | 'SKHX' | 'HYUNDAI' | 'SKHY' | 'KR200' | 'EWY' | 'KORU'

export interface Asset {
  id: AssetId
  name: string
  short: string
  perp: string // Hyperliquid coin name
  krxCode: string // domestic ticker code ('' when there is no counterpart)
  ratio: number // KRX shares per perp unit (SKHY ADR = 0.1 common share)
  kind: 'stock' | 'adr' | 'index' | 'etf'
  fx: boolean
  note?: string // one-line explanation shown in the asset switcher
}

export const ASSETS: Asset[] = [
  { id: 'SMSN', name: '삼성전자', short: '삼성전자', perp: 'xyz:SMSN', krxCode: '005930', ratio: 1, kind: 'stock', fx: true },
  { id: 'SKHX', name: 'SK하이닉스', short: '하이닉스', perp: 'xyz:SKHX', krxCode: '000660', ratio: 1, kind: 'stock', fx: true },
  { id: 'HYUNDAI', name: '현대차', short: '현대차', perp: 'xyz:HYUNDAI', krxCode: '005380', ratio: 1, kind: 'stock', fx: true },
  { id: 'SKHY', name: 'SK하이닉스 ADR', short: '하이닉스 ADR', perp: 'xyz:SKHY', krxCode: '000660', ratio: 0.1, kind: 'adr', fx: true, note: '미국 상장 주식예탁증서 · 1주 = 보통주 0.1주' },
  { id: 'KR200', name: '코스피200', short: '코스피200', perp: 'xyz:KR200', krxCode: '', ratio: 1, kind: 'index', fx: false, note: '하이퍼리퀴드 가격만 제공해요' },
  { id: 'EWY', name: 'MSCI 한국 ETF', short: '한국 ETF', perp: 'xyz:EWY', krxCode: '', ratio: 1, kind: 'etf', fx: true, note: '미국 상장 ETF · 하이퍼리퀴드 가격만 제공해요' },
  { id: 'KORU', name: '한국 3배 ETF', short: '한국 3배', perp: 'xyz:KORU', krxCode: '', ratio: 1, kind: 'etf', fx: true, note: '미국 상장 3배 레버리지 ETF · 하이퍼리퀴드 가격만 제공해요' },
]

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, Asset>

/** Assets with a domestic counterpart: premium, spread opportunity and open prediction apply */
export const COMPARABLE = ASSETS.filter((a) => a.krxCode)

export const hasKrx = (a: Asset) => !!a.krxCode

/** Next-open prediction needs the perp to track the KRX stock itself (not an ADR with its own premium) */
export const PREDICTABLE = ASSETS.filter((a) => a.kind === 'stock')
export const canPredict = (a: Asset) => a.kind === 'stock'

export function isAssetId(v: string): v is AssetId {
  return v in ASSET_BY_ID
}
