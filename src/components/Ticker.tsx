import { memo, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { fmtPct, fmtPrice, kstDay, leftText, regularCloseAt, untilText } from '../lib/format'
import { subscribeUsdc, useLive } from '../lib/live'

/** Bottom strip (where brokerage apps show indices): market status, KRW/USDC, perp converted price */
export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const usdc = useLive((s) => s.usdc?.rate)
  return (
    <footer className="ticker num">
      {status && (
        <span>
          {status.session === 'regular' ? '정규장' : status.session === 'nxt' ? '넥스트레이드' : '휴장'}
          {status.session === 'regular' ? (
            <span className="faint"> · 장 마감까지 {leftText(regularCloseAt())}</span>
          ) : (
            <span className="faint"> · 다음 개장 {kstDay(status.nextOpen)} 09:00 ({untilText(status.nextOpen)})</span>
          )}
        </span>
      )}
      <span className="spacer" />
      <span>
        <span className="faint">원/USDC</span> {usdc ? usdc.toLocaleString('ko-KR') : (items?.[0]?.fx?.rate.toLocaleString('ko-KR') ?? '-')}
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
