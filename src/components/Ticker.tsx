import { memo, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../../shared/api'
import { fmtPct, tone } from '../lib/format'
import { arbKind, arbText } from '../lib/arb'
import { subscribeUsdc } from '../lib/live'
import { SessionLine, useNow, venuesNow } from '../lib/market'

/** Bottom strip: the three venues with their hours (trading ones lit), time to close or next open,
 *  then for the two main stocks how far Hyperliquid sits from the domestic price and what the spread leaves after costs */
const SHOWN = ['SMSN', 'SKHX']

export const Ticker = memo(function Ticker({ items, status }: { items?: ArbSnapshot[]; status?: Status }) {
  useEffect(() => subscribeUsdc(), [])
  const now = useNow(15_000)
  const on = venuesNow(status?.session, now)
  const shown = items?.filter((s) => SHOWN.includes(s.asset)) ?? []
  const closed = shown.length > 0 && shown.every((s) => arbKind(s) === 'gap')
  const venue = (lit: boolean, name: string, hours: string) => (
    <span className={`ticker__venue ${lit ? 'is-on' : ''}`}>
      <span className={`dot ${lit ? 'dot--on' : ''}`} />
      {name} <span className="faint">{hours}</span>
    </span>
  )
  return (
    <footer className="ticker num">
      {venue(on.regular, '국내 정규장', '09:00~15:30')}
      {venue(on.nxt, '넥스트레이드', '08:00~20:00')}
      {venue(on.perp, '하이퍼리퀴드', '24시간')}
      {status && (
        <>
          <span className="ticker__sep" />
          <span>
            <SessionLine status={status} style="clock" />
          </span>
        </>
      )}
      <span className="spacer" />
      {shown.map((s) => (
        <span key={s.asset}>
          <span className="strong">{s.name}</span> <span className="faint">하이퍼리퀴드</span>{' '}
          <span className={tone(s.premiumPct)}>{fmtPct(s.premiumPct)}</span>
          {arbKind(s) === 'go' ? (
            <>
              {' '}
              <span className="faint">· 시세차익</span> <span className="up">{fmtPct(s.net.netPct)}</span>
            </>
          ) : (
            !closed && <span className="faint"> · {arbText(s).short}</span>
          )}
        </span>
      ))}
      {/* While the domestic market is closed the reason is the same for every stock: say it once */}
      {closed && <span className="faint">{arbText(shown[0]).short}</span>}
    </footer>
  )
})
