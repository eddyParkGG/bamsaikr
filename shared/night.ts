// The US regular session sits inside the domestic overnight gap and moves the next open more than anything else.
// Backtest since the 2026-02 listing: the Hyperliquid price at 21:00 KST called the re-open direction about half the
// time, after the US close (05:00/06:00 KST) 86–90%. Pure (no DOM), shared by the server backtest and the UI.

const H = 3600_000
const DAY = 24 * H

/** New York's UTC offset in hours at `ms` (−5 standard, −4 daylight saving) */
function nyOffset(ms: number) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')?.value
  return Number(name?.replace('GMT', '')) || -5
}

/** US regular sessions (09:30–16:00 New York, weekdays; US holidays ignored) overlapping [from, to] */
export function usSessions(from: number, to: number) {
  const out: { open: number; close: number }[] = []
  for (let day = Math.floor((from - DAY) / DAY) * DAY; day <= to; day += DAY) {
    const dow = new Date(day).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const off = nyOffset(day + 12 * H)
    const open = day + (9.5 - off) * H
    const close = day + (16 - off) * H
    if (close > from && open < to) out.push({ open, close })
  }
  return out
}

export type NightStage = 'before' | 'during' | 'after'

/** Where `now` sits relative to the last US session that closes before the next domestic open */
export function nightStageAt(nextOpen: number, now: number): { stage: NightStage; usClose: number | null } {
  const sessions = usSessions(now - DAY, nextOpen).filter((s) => s.close <= nextOpen)
  const last = sessions.at(-1)
  if (!last) return { stage: 'after', usClose: null }
  if (now >= last.close) return { stage: 'after', usClose: last.close }
  return { stage: now < last.open ? 'before' : 'during', usClose: last.close }
}
