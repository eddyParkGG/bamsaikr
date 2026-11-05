import { memo, useEffect, useId } from 'react'
import { useStatus } from '../lib/data'
import { subscribeUsdc, useLive } from '../lib/live'
import { useQuery } from '../lib/query'

interface Indicator {
  id: 'KOSPI' | 'KOSDAQ' | 'NDX' | 'SPX' | 'USDC'
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
  if (data.length < 2) return <svg width="48" height="28" />
  const all = [...data.map((p) => p[1]), base]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = Math.max(1, win.to - win.from)
  const x = (t: number) => Math.min(48, Math.max(0, ((t - win.from) / span) * 48))
  const y = (v: number) => 25 - ((v - min) / (max - min || 1)) * 22
  const pts = data.map(([t, v]) => [x(t), y(v)] as const)
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const lastX = pts[pts.length - 1][0]
  const color = up ? 'var(--up)' : 'var(--down)'
  return (
    <svg width="48" height="28" viewBox="0 0 48 28" aria-hidden className="spark-mini">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2="48" y1={y(base)} y2={y(base)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3" />
      <path d={`${line}L${lastX.toFixed(1)},28L${pts[0][0].toFixed(1)},28Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
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
        <p className="ind__name" data-fit>
          {it.name}
          {(it.id === 'NDX' || it.id === 'SPX') && <span className="faint"> · 하이퍼리퀴드</span>}
        </p>
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

/** Korean indices only move in the regular session; the rest of the day the US indices (Hyperliquid, 24h) are the live ones */
const KR = ['KOSPI', 'KOSDAQ', 'USDC']
const US = ['NDX', 'SPX', 'USDC']

/** Header indicators (Toss home cards, compact): index pair + USDC with mini charts */
export const NavIndicators = memo(function NavIndicators() {
  useEffect(() => subscribeUsdc(), [])
  const status = useStatus().data
  const q = useQuery<{ items: Indicator[] }>('/api/v1/indicators', 10_000)
  // Same footprint as the cards (mini chart + name + value) so the nav does not jump when data arrives
  if (!q.data || !status)
    return (
      <div className="nav-ind" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="ind">
            <span className="skeleton" style={{ width: 48, height: 28, borderRadius: 6 }} />
            <div className="ind__text">
              <span className="skeleton" style={{ display: 'block', width: 56, height: 11, borderRadius: 4 }} />
              <span className="skeleton" style={{ display: 'block', width: 138, height: 15, borderRadius: 4, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
    )
  const ids = status.session === 'regular' ? KR : US
  return (
    <div className="nav-ind">
      {ids.map((id) => {
        const it = q.data!.items.find((x) => x.id === id)
        return it ? <Card key={id} it={it} /> : null
      })}
    </div>
  )
})
