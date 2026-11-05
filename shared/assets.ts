// 하이퍼리퀴드(trade.xyz HIP-3)에 상장된 한국 기초자산과 KRX 종목 매핑
// fx: true 면 perp 가격(USDC)에 원/USDC 를 곱해서 원화로 환산
// 코스피200(xyz:KR200)은 토스증권 API 가 지수를 코스피·코스닥만 줘서 비교 대상에서 뺌

export type AssetId = 'SMSN' | 'SKHX' | 'HYUNDAI'

export interface Asset {
  id: AssetId
  name: string
  short: string
  perp: string // 하이퍼리퀴드 코인 이름
  krxCode: string // 국내 종목코드
  kind: 'stock' | 'index'
  fx: boolean
  tick: number // KRX 표시용 가격 단위
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
