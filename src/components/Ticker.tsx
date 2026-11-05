import { memo, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { fmtPct, tone } from '../lib/format'
import { subscribeUsdc } from '../lib/live'
import { SESSION_LABEL, SessionLine } from '../lib/market'

/** Bottom strip (where brokerage apps show indices): market status, then for the two main stocks how far
 *  Hyperliquid sits from the domestic price and what the spread leaves after costs */
const SHOWN = ['SMSN', 'SKHX']

export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
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
      {items
        ?.filter((s) => SHOWN.includes(s.asset))
        .map((s) => (
          <span key={s.asset}>
            <span className="strong">{s.name}</span> <span className="faint">하이퍼리퀴드</span>{' '}
            <span className={tone(s.premiumPct)}>{fmtPct(s.premiumPct)}</span> <span className="faint">· 시세차익</span>{' '}
            <span className={tone(s.net.netPct)}>{fmtPct(s.net.netPct)}</span>
          </span>
        ))}
    </footer>
  )
})
