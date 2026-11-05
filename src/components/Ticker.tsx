import { memo, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { useUsdcRate } from '../lib/data'
import { fmtPct, fmtPrice } from '../lib/format'
import { subscribeUsdc } from '../lib/live'
import { SESSION_LABEL, SessionLine } from '../lib/market'

/** Bottom strip (where brokerage apps show indices): market status, KRW/USDC, perp converted price */
export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const usdc = useUsdcRate()
  return (
    <footer className="ticker num">
      {status && (
        <span>
          {SESSION_LABEL[status.session]}
          <span className="faint">
            {' '}
            · <SessionLine status={status} style="clock" />
          </span>
        </span>
      )}
      <span className="spacer" />
      <span>
        <span className="faint">USDC</span> {usdc ? `${usdc.toLocaleString('ko-KR')}원` : '-'}
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
