// Where tonight is relative to the US session that moves the next domestic open (pure: no DOM, testable)
const KST = 9 * 3600_000

/** New York's UTC offset in hours at `ms` (−5 standard, −4 daylight saving) */
function nyOffset(ms: number) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')?.value
  return Number(name?.replace('GMT', '')) || -5
}

/** US regular sessions (09:30–16:00 New York, weekdays; US holidays ignored) overlapping [from, to] */
function usSessions(from: number, to: number) {
  const out: { open: number; close: number }[] = []
  for (let day = Math.floor((from - 86400_000) / 86400_000) * 86400_000; day <= to; day += 86400_000) {
    const off = nyOffset(day + 12 * 3600_000)
    const dow = new Date(day).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const open = day + (9.5 - off) * 3600_000
    const close = day + (16 - off) * 3600_000
    if (close > from && open < to) out.push({ open, close })
  }
  return out
}

export type NightStage = 'before' | 'during' | 'after'

/**
 * Where tonight is relative to the US session that moves the next domestic open.
 * Backtest (since the Feb 2026 listing): the Hyperliquid price at 21:00 calls the re-open direction about half the
 * time, at 06:00–07:00 (after the US close) 86–90% — so tell people how far the number can still move.
 */
export function nightStage(nextOpen: number, now = Date.now()) {
  const s = usSessions(now, nextOpen).find((x) => x.close > now && x.close <= nextOpen)
  const closeHour = s ? new Date(s.close + KST).getUTCHours() : 6
  const stage: NightStage = !s ? 'after' : now < s.open ? 'before' : 'during'
  const when = `새벽 ${closeHour}시 이후가 가장 정확해요`
  const text = stage === 'before' ? '아직 미장 전이라 크게 바뀔 수 있어요' : stage === 'during' ? '미장 중이라 계속 바뀌어요' : '미장이 끝나 거의 확정이에요'
  return { stage, text, when, short: stage === 'after' ? text : when }
}
