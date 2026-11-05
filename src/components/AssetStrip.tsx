import { memo } from 'react'
import type { ArbSnapshot } from '../../shared/api'
import { ASSETS, type AssetId } from '../../shared/assets'
import { fmtPct, fmtPrice, tone } from '../lib/format'
import { Link } from '../lib/router'

export const AssetStrip = memo(function AssetStrip({ items, active }: { items?: ArbSnapshot[]; active: AssetId }) {
  return (
    <nav className="strip" aria-label="종목">
      {ASSETS.map((a) => {
        const s = items?.find((x) => x.asset === a.id)
        return (
          <Link key={a.id} href={`/s/${a.id}`} className="strip__item" aria-current={a.id === active ? 'page' : undefined}>
            <span className="strip__name">{a.name}</span>
            {s ? (
              <span className="num strip__nums">
                {fmtPrice(s.krx.price, a.kind === 'index')} <span className={tone(s.krx.changePct)}>{fmtPct(s.krx.changePct)}</span>
                <span className="faint"> · 괴리 </span>
                <span className={tone(s.premiumPct)}>{fmtPct(s.premiumPct)}</span>
              </span>
            ) : (
              <span className="skeleton" style={{ width: 120, height: 14 }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
})
