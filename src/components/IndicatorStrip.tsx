import { memo, useEffect, useId } from 'react'
import type { Status } from '../../shared/api'
import { subscribeUsdc, useLive } from '../lib/live'
import { useQuery } from '../lib/query'

interface Indicator {
  id: 'KOSPI' | 'KOSDAQ' | 'USDC'
  name: string
  price: number
  prevClose: number
  change: number
  changePct: number
  spark: number[]
}

/** 토스증권 홈 지표 카드: 미니 차트(전일 기준 점선) + 이름 + 값 + 등락 */
function Spark({ data, base, up }: { data: number[]; base: number; up: boolean }) {
  const id = useId()
  if (data.length < 2) return <svg width="56" height="40" />
  const all = [...data, base]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const x = (i: number) => (i / (data.length - 1)) * 56
  const y = (v: number) => 36 - ((v - min) / (max - min || 1)) * 32
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
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
      <path d={`${line}L56,40L0,40Z`} fill={`url(#${id})`} />
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
      <Spark data={live ? [...it.spark, live] : it.spark} base={it.prevClose} up={up} />
      <div>
        <p className="ind__name">{it.name}</p>
        <p className="ind__value num">
          {price.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}{' '}
          <span className={up ? 'up' : 'down'}>
            {up ? '+' : '-'}
            {Math.abs(change).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ({Math.abs(pct).toFixed(2)}%)
          </span>
        </p>
      </div>
    </div>
  )
}

export const IndicatorStrip = memo(function IndicatorStrip({ status }: { status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const q = useQuery<{ items: Indicator[] }>('/api/v1/indicators', 10_000)
  const open = status?.session === 'regular'
  // 넥스트레이드는 정규장 시간에도 같이 열려 있음
  const nxt = status?.session === 'nxt' || status?.session === 'regular'
  return (
    <section className="ind-strip">
      <div className="ind-strip__head">
        <span className={`dot ${open ? 'dot--on' : ''}`} />
        <b>국내 정규장</b>
        <span className="faint">09:00 ~ 15:30</span>
        <span className={`dot ${nxt ? 'dot--on' : ''}`} style={{ marginLeft: 12 }} />
        <b>넥스트레이드</b>
        <span className="faint">08:00 ~ 20:00</span>
        <span className="dot dot--on" style={{ marginLeft: 12 }} />
        <b>해외 perp</b>
        <span className="faint">24시간</span>
      </div>
      <div className="ind-strip__cards">{q.data ? q.data.items.map((it) => <Card key={it.id} it={it} />) : [0, 1, 2].map((i) => <div key={i} className="ind skeleton" style={{ height: 40 }} />)}</div>
    </section>
  )
})
