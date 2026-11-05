import { memo, useEffect, useId } from 'react'
import type { Status } from '../../shared/api'
import { useStatus } from '../lib/data'
import { subscribeUsdc, useLive } from '../lib/live'
import { kstMinutes, nxtOpenAt, useNow, venueAt } from '../lib/market'
import { useQuery } from '../lib/query'

interface Indicator {
  id: 'KOSPI' | 'KOSDAQ' | 'USDC'
  name: string
  price: number
  prevClose: number
  change: number
  changePct: number
  spark: [number, number][]
  window: { from: number; to: number }
}

/** Toss home style mini chart: dashed previous-close baseline, line drawn only up to now within the session */
function Spark({ data, base, up, window: win }: { data: [number, number][]; base: number; up: boolean; window: { from: number; to: number } }) {
  const id = useId()
  if (data.length < 2) return <svg width="56" height="40" />
  const all = [...data.map((p) => p[1]), base]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = Math.max(1, win.to - win.from)
  const x = (t: number) => Math.min(56, Math.max(0, ((t - win.from) / span) * 56))
  const y = (v: number) => 36 - ((v - min) / (max - min || 1)) * 32
  const pts = data.map(([t, v]) => [x(t), y(v)] as const)
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const lastX = pts[pts.length - 1][0]
  const color = up ? 'var(--up)' : 'var(--down)'
  return (
    <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden className="spark-mini">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2="56" y1={y(base)} y2={y(base)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3" />
      <path d={`${line}L${lastX.toFixed(1)},40L${pts[0][0].toFixed(1)},40Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function Card({ it }: { it: Indicator }) {
  const live = useLive((s) => (it.id === 'USDC' ? s.usdc?.rate : undefined))
  const price = live ?? it.price
  const change = price - it.prevClose
  const pct = (change / it.prevClose) * 100
  const up = change >= 0
  const digits = it.id === 'USDC' ? 0 : 2
  return (
    <div className="ind">
      <Spark data={live ? [...it.spark, [Date.now(), live]] : it.spark} base={it.prevClose} up={up} window={it.id === 'USDC' ? { from: it.window.from, to: Date.now() } : it.window} />
      <div className="ind__text">
        <p className="ind__name" data-fit>{it.name}</p>
        <p className="ind__value num" data-fit>
          {price.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
          {it.id === 'USDC' ? '원' : ''}{' '}
          <span className={up ? 'up' : 'down'}>
            {up ? '+' : '-'}
            {Math.abs(change).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ({Math.abs(pct).toFixed(2)}%)
          </span>
        </p>
      </div>
    </div>
  )
}

/** Which venues are trading right now (NXT: 08:00–08:50, 09:00:30–15:20, 15:30–20:00) */
function venues(status: Status | undefined, now: number) {
  const m = kstMinutes(now)
  // `closed` during 08:00–20:00 means a weekend or holiday
  const tradingDay = !!status && (status.session !== 'closed' || m < 480 || m >= 1200)
  const day = tradingDay && venueAt(now) !== 'weekend'
  return { regular: status?.session === 'regular', nxt: day && nxtOpenAt(m) }
}

export const IndicatorStrip = memo(function IndicatorStrip() {
  useEffect(() => subscribeUsdc(), [])
  const status = useStatus().data
  const q = useQuery<{ items: Indicator[] }>('/api/v1/indicators', 10_000)
  const now = useNow(15_000)
  const v = venues(status, now)
  return (
    <section className="ind-strip">
      <div className="ind-strip__head">
        <span className={`dot ${v.regular ? 'dot--on' : ''}`} />
        <b>국내 정규장</b>
        <span className="faint">09:00 ~ 15:30</span>
        <span className={`dot ${v.nxt ? 'dot--on' : ''}`} style={{ marginLeft: 12 }} />
        <b>넥스트레이드</b>
        <span className="faint">08:00 ~ 20:00</span>
        <span className="dot dot--on" style={{ marginLeft: 12 }} />
        <b>하이퍼리퀴드</b>
        <span className="faint">24시간</span>
      </div>
      {q.data ? (
        <div className="ind-strip__cards">
          {q.data.items.map((it) => (
            <Card key={it.id} it={it} />
          ))}
        </div>
      ) : (
        <div className="ind-strip__cards ind-strip__cards--loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      )}
    </section>
  )
})
