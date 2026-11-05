// Chart settings (pro mode). Kept separate from the Chart chunk so the main bundle can import it cheaply
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

