// 하이퍼리퀴드(trade.xyz HIP-3)에 상장된 한국 기초자산과 KRX 종목 매핑
// fx: true 면 perp 가격(USDC)에 원/USDC 를 곱해서 원화로 환산
// fx: false 면 perp 가 지수 포인트 그대로 거래돼서 환산 없이 비교 (KR200)

export type AssetId = 'SMSN' | 'SKHX' | 'HYUNDAI' | 'KR200'

export interface Asset {
  id: AssetId
  name: string
  short: string
  perp: string // 하이퍼리퀴드 코인 이름
  krxCode: string // KIS 종목코드 (지수는 업종코드)
  kind: 'stock' | 'index'
  fx: boolean
  tick: number // KRX 표시용 가격 단위
}

export const ASSETS: Asset[] = [
  { id: 'SMSN', name: '삼성전자', short: '삼성전자', perp: 'xyz:SMSN', krxCode: '005930', kind: 'stock', fx: true, tick: 50 },
  { id: 'SKHX', name: 'SK하이닉스', short: '하이닉스', perp: 'xyz:SKHX', krxCode: '000660', kind: 'stock', fx: true, tick: 1000 },
  { id: 'HYUNDAI', name: '현대차', short: '현대차', perp: 'xyz:HYUNDAI', krxCode: '005380', kind: 'stock', fx: true, tick: 500 },
  { id: 'KR200', name: '코스피200', short: '코스피200', perp: 'xyz:KR200', krxCode: '2001', kind: 'index', fx: false, tick: 0.01 },
]

export const ASSET_BY_ID = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<AssetId, Asset>

export function isAssetId(v: string): v is AssetId {
  return v in ASSET_BY_ID
}
