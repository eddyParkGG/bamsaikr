export function SessionBadge({ session }: { session: 'regular' | 'nxt' | 'closed' }) {
  if (session === 'regular') return <span className="badge badge--live">정규장</span>
  if (session === 'nxt') return <span className="badge badge--nxt">넥스트레이드</span>
  return <span className="badge">휴장 · perp만 거래 중</span>
}
