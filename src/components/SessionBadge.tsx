import { SESSION_LABEL, type Session } from '../lib/market'

const TONE: Record<Session, string> = { regular: 'badge badge--live', nxt: 'badge badge--nxt', closed: 'badge' }

export function SessionBadge({ session }: { session: Session }) {
  return <span className={TONE[session]}>{session === 'closed' ? `${SESSION_LABEL.closed} · 하이퍼리퀴드만 거래 중` : SESSION_LABEL[session]}</span>
}
