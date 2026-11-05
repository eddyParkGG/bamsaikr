// KIS 키가 없을 때 쓰는 공개 시세 (네이버 증권 차트 API, 비공식)
// 분봉은 최근 1~2주치만 제공됨
import { cached, fetchJson } from '../lib/cache.js'
import type { Asset } from '../../shared/assets.js'

const BASE = 'https://api.stock.naver.com/chart/domestic'

const path = (a: Asset) => (a.kind === 'index' ? `index/KPI200` : `item/${a.krxCode}`)

type Raw = { localDate?: string; localDateTime?: string; openPrice: number; highPrice: number; lowPrice: number; closePrice?: number; currentPrice?: number; accumulatedTradingVolume: number }

export function naverDaily(a: Asset, from: string, to: string) {
  return cached(`naver:day:${a.id}:${from}:${to}`, 5 * 60_000, async () => {
    const raw = await fetchJson<Raw[]>(`${BASE}/${path(a)}/day?startDateTime=${from}0000&endDateTime=${to}2359`)
    return raw.map((k) => ({ date: k.localDate!, o: k.openPrice, h: k.highPrice, l: k.lowPrice, c: k.closePrice!, v: k.accumulatedTradingVolume }))
  })
}

export function naverMinutes(a: Asset, date: string) {
  return cached(`naver:min:${a.id}:${date}`, 30_000, async () => {
    const raw = await fetchJson<Raw[]>(`${BASE}/${path(a)}/minute?startDateTime=${date}0800&endDateTime=${date}2000`)
    return raw.map((k) => ({ dt: k.localDateTime!, o: k.openPrice, h: k.highPrice, l: k.lowPrice, c: k.currentPrice!, v: k.accumulatedTradingVolume }))
  })
}

export function naverQuote(a: Asset) {
  return cached(`naver:quote:${a.id}`, 2000, async () => {
    const kind = a.kind === 'index' ? 'index/KPI200' : `stock/${a.krxCode}`
    const r = await fetchJson<{ datas: Record<string, unknown>[] }>(`https://polling.finance.naver.com/api/realtime/domestic/${kind}`)
    const d = r.datas[0]
    const num = (v: unknown) => Number(String(v ?? '0').replace(/,/g, ''))
    const price = num(d.closePrice)
    const change = num(d.compareToPreviousClosePrice)
    return {
      price,
      prevClose: price - change,
      open: num(d.openPrice),
      high: num(d.highPrice),
      low: num(d.lowPrice),
      volume: num(d.accumulatedTradingVolume),
      tradeValue: 0,
      changePct: num(d.fluctuationsRatio),
      viActive: false,
      marketStatus: String(d.marketStatus ?? ''),
    }
  })
}
