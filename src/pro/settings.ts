// 차트 설정 (프로 모드). Chart 청크와 분리해서 메인 번들에서도 가볍게 import
export interface ChartSettings {
  showKrx: boolean
  showPerp: boolean
  ma: boolean
  ribbon: boolean
  bb: boolean
  ichimoku: boolean
  vwap: boolean
  bands: boolean
  news: boolean
  convergence: boolean
  forecast: boolean
  volume: boolean
  premium: boolean
  funding: boolean
  rsi: boolean
  macd: boolean
}

export const DEFAULT_SETTINGS: ChartSettings = {
  showKrx: true,
  showPerp: true,
  ma: true,
  ribbon: false,
  bb: false,
  ichimoku: false,
  vwap: false,
  bands: true,
  news: true,
  convergence: true,
  forecast: true,
  volume: true,
  premium: true,
  funding: false,
  rsi: false,
  macd: false,
}

