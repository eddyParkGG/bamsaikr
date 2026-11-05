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
  convergence: false,
  forecast: true,
  volume: true,
  premium: true,
  funding: false,
  rsi: false,
  macd: false,
}


/** Indicator parameters. Defaults are the standard ones used by Korean brokers and TradingView */
export interface IndicatorParams {
  ma: number[]
  bb: { period: number; mult: number }
  rsi: { period: number; upper: number; lower: number }
  macd: { fast: number; slow: number; signal: number }
}

export const DEFAULT_PARAMS: IndicatorParams = {
  ma: [5, 20, 60, 120],
  bb: { period: 20, mult: 2 },
  rsi: { period: 14, upper: 70, lower: 30 },
  macd: { fast: 12, slow: 26, signal: 9 },
}
