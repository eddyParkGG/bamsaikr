import { memo } from 'react'
import type { ArbSnapshot, NewsMarker } from '../../shared/api'
import { ASSETS, type AssetId } from '../../shared/assets'
import { fmtPct, fmtPrice } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import { useQuery } from '../lib/query'
import { Link } from '../lib/router'
import { StockLogo } from './Brand'

/** 토스증권 우측 '관심' 패널 형태: 오늘의 이슈 한 줄 + 종목 목록 */
export const Watchlist = memo(function Watchlist({ items, active, open }: { items?: ArbSnapshot[]; active?: AssetId; open: boolean }) {
  const setSideOpen = usePrefs((s) => s.setSideOpen)
  const news = useQuery<{ items: NewsMarker[] }>(`/api/v1/news?asset=${active ?? 'KR200'}`, 300_000)
  const latest = news.data?.items.at(-1)
  const toggle = (
    <button className="icon-btn" onClick={() => setSideOpen(!open)} aria-label={open ? '관심 패널 접기' : '관심 패널 펼치기'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {open ? <path d="M6 6l6 6-6 6M13 6l6 6-6 6" /> : <path d="M18 6l-6 6 6 6M11 6l-6 6 6 6" />}
      </svg>
    </button>
  )
  if (!open)
    return (
      <aside className="rail">
        {toggle}
        {ASSETS.map((a) => {
          const ch = items?.find((x) => x.asset === a.id)?.krx.changePct ?? 0
          return (
            <Link key={a.id} href={`/s/${a.id}`} className="rail__item" aria-current={a.id === active ? 'page' : undefined} title={a.name}>
              <StockLogo id={a.id} size={30} />
              <span className={`num ${ch > 0 ? 'up' : ch < 0 ? 'down' : 'faint'}`}>{ch > 0 ? '+' : ''}{ch.toFixed(1)}</span>
            </Link>
          )
        })}
      </aside>
    )
  return (
    <aside className="watch">
      <div className="watch__head">
        <h2>관심</h2>
        {toggle}
      </div>
      {latest && (
        <a className="watch__news" href={latest.url} target="_blank" rel="noreferrer">
          <span className="watch__news-tag">
            <i className="dot-key" /> 오늘의 이슈
          </span>
          <span className="watch__news-title">{latest.title}</span>
        </a>
      )}
      <ul className="watch__list">
        {ASSETS.map((a) => {
          const s = items?.find((x) => x.asset === a.id)
          const ch = s?.krx.changePct ?? 0
          return (
            <li key={a.id}>
              <Link href={`/s/${a.id}`} className="watch__row" aria-current={a.id === active ? 'page' : undefined}>
                <StockLogo id={a.id} />
                <span className="watch__name">{a.name}</span>
                {s ? (
                  <span className="watch__nums num">
                    <span className="strong">{fmtPrice(s.krx.price, a.kind === 'index')}{a.kind === 'stock' ? '원' : ''}</span>
                    <span className={ch > 0 ? 'up' : ch < 0 ? 'down' : 'faint'}>{fmtPct(ch)}</span>
                    <span className="faint">괴리 {fmtPct(s.premiumPct)}</span>
                  </span>
                ) : (
                  <span className="skeleton" style={{ width: 80, height: 32 }} />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
})
