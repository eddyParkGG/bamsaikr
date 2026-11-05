// One place for "what is the Korean market doing now": session labels, trading windows (KST),
// time left in the current window and a ticking countdown. Every page reads from here.
import { useEffect, useState } from 'react'
import type { Status } from '../../shared/api'
import { kstDay, untilText } from './format'

export type Session = Status['session']

const KST = 9 * 3600_000

/** Labels used everywhere a session is named */
export const SESSION_LABEL: Record<Session, string> = { regular: '정규장', nxt: '넥스트레이드', closed: '휴장' }

/** KST minutes since midnight (fractional) */
export function kstMinutes(ms = Date.now()) {
  const d = new Date(ms + KST)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
}

const isWeekend = (ms: number) => [0, 6].includes(new Date(ms + KST).getUTCDay())

/** NXT continuous trading: 08:00–08:50, 09:00:30–15:20, 15:30–20:00 */
export const nxtOpenAt = (m: number) => (m >= 480 && m < 530) || (m >= 540.5 && m < 920) || (m >= 930 && m < 1200)

/**
 * Which venue a moment belongs to by the clock alone (weekdays; holidays are not known here).
 * Used to label historical bars; for "now", prefer the server's status.session.
 */
export function venueAt(ms: number): 'regular' | 'nxt' | 'closed' | 'weekend' {
  if (isWeekend(ms)) return 'weekend'
  const m = kstMinutes(ms)
  if (m >= 540 && m < 930) return 'regular'
  if ((m >= 480 && m < 530) || (m >= 930 && m < 1200)) return 'nxt'
  return 'closed'
}

const kstToday = (now: number, h: number, m: number) => {
  const d = new Date(now + KST)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - KST
}

/** Today's regular-session close (15:30 KST) */
export const regularCloseAt = (now = Date.now()) => kstToday(now, 15, 30)

/** End of the trading window we are in: regular 15:30, NXT pre-market 08:50 or after-market 20:00 */
export function sessionCloseAt(session: Session, now = Date.now()) {
  if (session === 'regular') return regularCloseAt(now)
  return kstMinutes(now) < 530 ? kstToday(now, 8, 50) : kstToday(now, 20, 0)
}

/** Which venues are trading right now. `closed` during 08:00–20:00 means a weekend or holiday */
export function venuesNow(session: Session | undefined, now = Date.now()) {
  const m = kstMinutes(now)
  const tradingDay = !!session && (session !== 'closed' || m < 480 || m >= 1200) && !isWeekend(now)
  return { regular: session === 'regular', nxt: tradingDay && nxtOpenAt(m), perp: true }
}

/** Re-render every `ms` (default 1s) */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/** 'H:MM:SS' */
export function hms(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000))
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** '2시간 10분', '25분' */
export function hoursMinutes(msLeft: number) {
  const m = Math.max(0, Math.ceil(msLeft / 60_000))
  const h = Math.floor(m / 60)
  return h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`
}

/** Ticking 'H:MM:SS' until the current trading window closes */
export function Countdown({ session }: { session: Exclude<Session, 'closed'> }) {
  const now = useNow(1000)
  return <span className="num">{hms(sessionCloseAt(session, now) - now)}</span>
}

/**
 * What the market is doing now, as one line. `clock` ticks H:MM:SS (bottom bar);
 * `words` says '2시간 10분' (sentences). Same facts on every page.
 */
export function SessionLine({ status, style }: { status: Pick<Status, 'session' | 'nextOpen' | 'nextRegularOpen'>; style: 'clock' | 'words' }) {
  const now = useNow(style === 'clock' ? 1000 : 30_000)
  const s = status.session
  const left = (sess: Exclude<Session, 'closed'>) => (style === 'clock' ? hms(sessionCloseAt(sess, now) - now) : hoursMinutes(sessionCloseAt(sess, now) - now))
  const at = (ms: number, hh: string, word: string) => (style === 'clock' ? `${kstDay(ms)} ${hh}` : `${kstDay(ms)} ${word}`)
  if (s === 'regular') return <>장 마감까지 <span className="num">{left('regular')}</span></>
  if (s === 'nxt')
    return (
      <>
        {style === 'words' ? '넥스트레이드 ' : ''}마감까지 <span className="num">{left('nxt')}</span>
        {kstMinutes(now) < 540 && <> · 정규장 {at(status.nextRegularOpen, '09:00', '오전 9시')}</>}
      </>
    )
  return (
    <>
      다음 개장 {at(status.nextOpen, '08:00', '오전 8시')} ({untilText(status.nextOpen)})
    </>
  )
}
