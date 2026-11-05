// 프론트에서 쓰는 API 응답 타입 (서버 구현에서 그대로 가져옴)
export type { ArbSnapshot } from '../server/services/arb.js'
export type { ChartSeries, ChartInterval } from '../server/services/series.js'
export type { OpenEvent } from '../server/services/predict.js'
export type { NewsMarker } from '../server/services/news.js'
import type { predictOpen } from '../server/services/predict.js'
export type Prediction = Awaited<ReturnType<typeof predictOpen>>
export interface Status {
  now: number
  session: 'regular' | 'nxt' | 'closed'
  nextOpen: number
  prevClose: number
  krxSource: 'toss'
  toss: boolean
  liveKrxOrders: boolean
  hlAgent: boolean
}
