// Chart news markers: one per day, only the most important issue
import type { Asset } from '../../shared/assets.js'
import { kstToMs } from '../../shared/session.js'
import { CURATED_EVENTS } from '../data/events.js'

export interface NewsMarker {
  t: number
  date: string
  title: string
  summary?: string
  source: string
  url?: string
  kind: 'curated'
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

  return [...byDate.values()].sort((a, b) => a.t - b.t)
}
