import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArbSnapshot } from '../../shared/api'
import { ASSETS, type Asset, type AssetId } from '../../shared/assets'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, tone } from '../lib/format'
import { useLive } from '../lib/live'
import { useQuery } from '../lib/query'
import { navigate } from '../lib/router'
import { StockLogo } from './Brand'

export interface PerpQuote {
  asset: AssetId
  mid: number
  prevDay: number
  fundingHourly: number
  openInterest: number
  volume24hUsd: number
  maxLeverage: number
}

/** Latest price per asset: domestic price when there is one, otherwise the Hyperliquid price in KRW */
export function useAssetQuotes() {
  const arb = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const perps = useQuery<{ items: PerpQuote[] }>('/api/v1/perps', 3000)
  const live = useLive((s) => s.usdc?.rate)
  const rate = live ?? arb.data?.items.find((x) => x.fx)?.fx?.rate ?? 0
  return useMemo(() => {
    const out: Partial<Record<AssetId, { price: number; changePct: number; isIdx: boolean }>> = {}
    for (const a of ASSETS) {
      const s = arb.data?.items.find((x) => x.asset === a.id)
      const p = perps.data?.items.find((x) => x.asset === a.id)
      const isIdx = a.kind === 'index'
      if (s && a.kind === 'stock') out[a.id] = { price: s.krx.price, changePct: s.krx.changePct, isIdx }
      else if (p && (!a.fx || rate)) out[a.id] = { price: p.mid * (a.fx ? rate : 1), changePct: (p.mid / p.prevDay - 1) * 100, isIdx }
    }
    return out
  }, [arb.data, perps.data, rate])
}

const Key = ({ d }: { d: string }) => (
  <kbd className="kbd-icon">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  </kbd>
)
const RETURN = 'M19.6 4v8.6a2.6 2.6 0 0 1-2.6 2.6H4.5M9.3 10.4l-4.8 4.8 4.8 4.8'
const UP = 'M12 20.5V3.8M4.5 11.2 12 3.8l7.5 7.4'
const DOWN = 'M12 3.5v16.7M4.5 12.8l7.5 7.4 7.5-7.4'

const subOf = (a: Asset) => (a.kind === 'stock' ? a.krxCode : a.kind === 'adr' ? `${a.perp.replace('xyz:', '')} · ADR` : a.kind === 'index' ? '지수' : `${a.perp.replace('xyz:', '')} · 미국 ETF`)

/** Highlight the matched part of the name */
function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

const match = (a: Asset, q: string) => {
  const k = q.trim().toLowerCase()
  if (!k) return true
  return [a.name, a.short, a.krxCode, a.perp.replace('xyz:', ''), a.id].some((v) => v.toLowerCase().includes(k))
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const quotes = useAssetQuotes()
  const input = useRef<HTMLInputElement>(null)
  const list = ASSETS.filter((a) => match(a, q))

  useEffect(() => input.current?.focus(), [])
  useEffect(() => setIdx(0), [q])

  const go = (a: Asset) => {
    track('asset_switch', { asset: a.id, query: q ? 'typed' : 'list' })
    onClose()
    navigate(`/s/${a.id}`)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(list.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && list[idx]) go(list[idx])
    else if (e.key === 'Escape') {
      e.preventDefault()
      if (q) setQ('')
      else onClose()
    }
  }

  return (
    <div className="search-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search" role="dialog" aria-label="종목 검색" onKeyDown={onKey}>
        <label className="search__box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목 이름이나 코드를 입력해 주세요" aria-label="검색어" />
          {q && (
            <button className="search__clear" aria-label="지우기" onClick={() => setQ('')}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="10" fill="currentColor" />
                <path d="M8.5 8.5l7 7m0-7l-7 7" stroke="var(--bg-layer)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>
        <div className="search__head">
          <span>{q ? '종목' : '밤사이에서 볼 수 있는 종목'}</span>
          {!q && <span className="faint">하이퍼리퀴드에 상장된 한국 종목 전부예요</span>}
        </div>
        <div className="search__list" role="listbox">
          {list.length === 0 && <p className="search__empty">찾는 종목이 없어요. 하이퍼리퀴드에 있는 한국 종목만 볼 수 있어요.</p>}
          {list.map((a, i) => {
            const qt = quotes[a.id]
            return (
              <button key={a.id} role="option" aria-selected={i === idx} className="search__row" onMouseEnter={() => setIdx(i)} onClick={() => go(a)}>
                <StockLogo id={a.id} size={36} />
                <span className="search__name">
                  <b>
                    <Hl text={a.name} q={q.trim()} />
                  </b>
                  <span>{a.note ?? subOf(a)}</span>
                </span>
                <span className="search__px num">
                  <b>{qt ? `${fmtPrice(qt.price, qt.isIdx)}${qt.isIdx ? '' : '원'}` : '-'}</b>
                  {qt && <span className={tone(qt.changePct)}>{fmtPct(qt.changePct)}</span>}
                </span>
                <span className="search__enter" aria-hidden>
                  <Key d={RETURN} />
                </span>
              </button>
            )
          })}
        </div>
        <div className="search__foot">
          <span>
            <Key d={RETURN} />
            종목으로 이동하기
          </span>
          <span>
            <kbd className="kbd-text">ESC</kbd>
            지우기
          </span>
          <span>
            <span className="search__arrows">
              <Key d={UP} />
              <Key d={DOWN} />
            </span>
            탐색하기
          </span>
        </div>
      </div>
    </div>
  )
}

/** Header search field: click or press "/" to open */
export function SearchTrigger() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !open && !/INPUT|TEXTAREA/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('bamsai:search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('bamsai:search', onOpen)
    }
  }, [open])
  return (
    <>
      <button className="search-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <kbd>/</kbd>를 눌러 검색하세요
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  )
}

export const openSearch = () => window.dispatchEvent(new Event('bamsai:search'))
