import { memo } from 'react'
import type { NewsMarker } from '../../shared/api'
import { kstDay } from '../lib/format'

const kstDate = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
import { track } from '../lib/ga'
import { useQuery } from '../lib/query'
import { StockLogo } from './Brand'

/** Today's issues. For the given asset, or across all assets when omitted, newest first */
export const TodayIssue = memo(function TodayIssue({ asset, limit = 3, onOpen }: { asset?: string; limit?: number; onOpen?: (n: NewsMarker) => void }) {
  const q = useQuery<{ items: (NewsMarker & { asset?: string })[] }>(asset ? `/api/v1/news?asset=${asset}` : `/api/v1/news?limit=${limit}`, 300_000)
  const all = asset ? [...(q.data?.items ?? [])].reverse() : (q.data?.items ?? [])
  // Only the latest day: today's issues, or the most recent day's when nothing happened today
  const latest = all[0]?.date
  const items = all.filter((n) => n.date === latest).slice(0, limit)
  const isToday = latest === kstDate(Date.now())
  return (
    <section className="panel issue">
      <div className="panel__head">
        <span className="panel__title">
          <i className="dot-key" style={{ marginRight: 6 }} />
          {isToday || !latest ? '오늘의 이슈' : '최근 이슈'}
        </span>
        {latest && !isToday && <span className="faint" style={{ fontSize: 12, marginLeft: 8 }}>{kstDay(all[0].t)}</span>}
      </div>
      <ul className="issue__list">
        {q.data
          ? items.map((n) => (
              <li key={n.date + n.title}>
                <button
                  className="issue__row"
                  onClick={() => {
                    track('news_open', { from: 'issue', date: n.date })
                    if (onOpen) onOpen(n)
                    else if (n.url) window.open(n.url, '_blank', 'noreferrer')
                  }}
                >
                  {n.asset && <StockLogo id={n.asset} size={20} />}
                  <span className="issue__title">{n.title}</span>
                  {!onOpen && n.url && (
                    <svg className="issue__ext" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="새 탭에서 열기">
                      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                    </svg>
                  )}
                </button>
              </li>
            ))
          : [0, 1].map((i) => <li key={i} className="skeleton" style={{ height: 20, margin: '10px 16px' }} />)}
      </ul>
    </section>
  )
})
