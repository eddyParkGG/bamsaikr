import { memo, useEffect, useState } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { fmtPct, fmtPrice, kstDay, sessionCloseAt, untilText } from '../lib/format'
import { subscribeUsdc, useLive } from '../lib/live'

/** Bottom strip (where brokerage apps show indices): market status, KRW/USDC, perp converted price */
/** Ticking H:MM:SS until the current trading window closes (regular or NXT) */
function CloseClock({ session }: { session: 'regular' | 'nxt' }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((sessionCloseAt(session, now) - now) / 1000))
  const hms = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return <span className="num">{hms}</span>
}

export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const usdc = useLive((s) => s.usdc?.rate)
  return (
    <footer className="ticker num">
      {status && (
        <span>
          {status.session === 'regular' ? '정규장' : status.session === 'nxt' ? '넥스트레이드' : '휴장'}
          {status.session === 'regular' ? (
            <span className="faint">
              {' '}
              · 장 마감까지 <CloseClock session="regular" />
            </span>
          ) : status.session === 'nxt' ? (
            // NXT is trading too: count down to its close, and say when the regular session starts
            <span className="faint">
              {' '}
              · 마감까지 <CloseClock session="nxt" /> · 정규장 {kstDay(status.nextOpen)} 09:00
            </span>
          ) : (
            <span className="faint"> · 다음 개장 {kstDay(status.nextOpen)} 09:00 ({untilText(status.nextOpen)})</span>
          )}
        </span>
      )}
      <span className="spacer" />
      <span>
        <span className="faint">USDC</span> {usdc ? usdc.toLocaleString('ko-KR') : (items?.[0]?.fx?.rate.toLocaleString('ko-KR') ?? '-')}원
      </span>
      {items?.map((s) => (
        <span key={s.asset}>
          <span className="faint">{s.name} 하이퍼리퀴드</span> {fmtPrice(s.perpKrw)}{' '}
          <span className={s.perp.changePct >= 0 ? 'up' : 'down'}>{fmtPct(s.perp.changePct)}</span>
        </span>
      ))}
    </footer>
  )
})
