// 차트 뉴스 마커: 하루에 하나, 가장 중요한 이슈만
import type { Asset } from '../../shared/assets.js'
import { kstToMs } from '../../shared/session.js'
import { CURATED_EVENTS } from '../data/events.js'
import { krxNews } from '../sources/krx.js'

export interface NewsMarker {
  t: number
  date: string
  title: string
  summary?: string
  source: string
  url?: string
  kind: 'curated' | 'kis'
}

// KIS 시황/공시 제목 중 하루 대표 뉴스 고르기. 가격에 영향 큰 단어에 가중치
const WEIGHTS: [RegExp, number][] = [
  [/잠정|실적|어닝|영업이익|매출/, 5],
  [/상한가|하한가|급등|급락|폭락|폭등|서킷|사이드카/, 5],
  [/HBM|감산|증설|수주|공급계약|관세|규제|제재/, 4],
  [/유상증자|무상증자|자사주|배당|합병|분할/, 4],
  [/외국인|기관|순매수|순매도|목표가|투자의견/, 2],
  [/\[속보\]|속보/, 3],
]

function score(title: string, asset: Asset) {
  let s = title.includes(asset.short) || title.includes(asset.name) ? 3 : 0
  for (const [re, w] of WEIGHTS) if (re.test(title)) s += w
  return s
}

export async function newsMarkers(asset: Asset): Promise<NewsMarker[]> {
  const byDate = new Map<string, NewsMarker>()

  for (const e of CURATED_EVENTS) {
    if (!e.assets.includes(asset.id)) continue
    const date = e.date.replace(/-/g, '')
    byDate.set(date, {
      t: kstToMs(date, (e.time ?? '09:00').replace(':', '')),
      date,
      title: e.title,
      summary: e.summary,
      source: new URL(e.url).hostname.replace(/^www\./, ''),
      url: e.url,
      kind: 'curated',
    })
  }

  const kis = await krxNews(asset)
  const best = new Map<string, { s: number; n: (typeof kis)[number] }>()
  for (const n of kis) {
    const s = score(n.title, asset)
    if (s < 5) continue
    const cur = best.get(n.date)
    if (!cur || s > cur.s) best.set(n.date, { s, n })
  }
  for (const [date, { n }] of best) {
    if (byDate.has(date)) continue // 직접 확인한 이벤트가 우선
    byDate.set(date, { t: kstToMs(date, n.time.slice(0, 4)), date, title: n.title, source: n.source, kind: 'kis' })
  }

  return [...byDate.values()].sort((a, b) => a.t - b.t)
}
