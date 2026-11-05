import { useEffect } from 'react'
import type { NewsMarker } from '../../shared/api'
import { kstDay, kstTime } from '../lib/format'

export function NewsSheet({ news, onClose }: { news: NewsMarker; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          {kstDay(news.t)} {kstTime(news.t)} · {news.source}
        </p>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45, margin: '8px 0 12px' }}>{news.title}</h3>
        {news.summary && <p style={{ fontSize: 14, lineHeight: 1.7 }}>{news.summary}</p>}
        <div className="row" style={{ marginTop: 24 }}>
          {news.url && (
            <a className="btn btn--lg btn--fill" style={{ flex: 1 }} href={news.url} target="_blank" rel="noreferrer">
              원문 보기
            </a>
          )}
          <button className="btn btn--lg btn--key" style={{ flex: 1 }} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
