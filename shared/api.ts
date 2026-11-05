// API response types used by the frontend (taken directly from the server implementation)
export type { ArbSnapshot } from '../server/services/arb.js'
export type { ChartSeries, ChartInterval } from '../server/services/series.js'
export type { OpenEvent } from '../server/services/predict.js'
export type { NewsMarker } from '../server/services/news.js'
import type { predictOpen } from '../server/services/predict.js'
export type Prediction = Awaited<ReturnType<typeof predictOpen>>
export interface Status {
  now: number
  session: 'regular' | 'nxt' | 'closed'
  nextOpen: number // next domestic (KRX or NXT) open, 08:00
  nextRegularOpen: number // next KRX regular session, 09:00
  prevClose: number
  krxSource: 'toss'
  toss: boolean
  liveKrxOrders: boolean
  hlAgent: boolean
}
