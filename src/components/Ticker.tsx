import { memo, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { fmtPct, fmtPrice, kstDay, untilText } from '../lib/format'
import { subscribeUsdc, useLive } from '../lib/live'

/** 토스증권 하단 지수 띠 자리: 장 상태, 원/USDC, perp 환산가 */
export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const usdc = useLive((s) => s.usdc?.rate)
  return (
    <footer className="ticker num">
      <span className="ticker__notice">투자 유의사항</span>
      <span className="ticker__sep" />
      {status && (
        <span>
          {status.session === 'regular' ? '정규장' : status.session === 'nxt' ? '넥스트레이드' : '휴장'}
          <span className="faint"> · 다음 개장 {kstDay(status.nextOpen)} 09:00 ({untilText(status.nextOpen)})</span>
        </span>
      )}
      <span className="spacer" />
      <span>
        <span className="faint">원/USDC</span> {usdc ? usdc.toLocaleString('ko-KR') : (items?.[0]?.fx?.rate.toLocaleString('ko-KR') ?? '-')}
      </span>
      {items?.map((s) => (
        <span key={s.asset}>
          <span className="faint">{s.name} perp</span> {fmtPrice(s.perpKrw)}{' '}
          <span className={s.perp.changePct >= 0 ? 'up' : 'down'}>{fmtPct(s.perp.changePct)}</span>
        </span>
      ))}
    </footer>
  )
})
