// Prefetch and bundle past domestic prices (run before deploy, with the dev server stopped:
// a new Toss token revokes the server's)
// Run: npx tsx --env-file=.env.local server/scripts/build-sessions.ts
// - krx-sessions.json: KRX regular-session open/close per day
// - krx-days.json:     20:00 close, 08:00–08:10 average re-open, regular open/close per day (forecast + record)
import { writeFileSync } from 'node:fs'
import { ASSETS } from '../../shared/assets.js'
import { kstDateKey } from '../../shared/session.js'
import { summarizeDay } from '../sources/domesticDays.js'
import { regularSessions } from '../sources/krxSessions.js'
import { tossMinutes, type TossCandle } from '../sources/toss.js'

const codes = [...new Set(ASSETS.filter((a) => a.krxCode).map((a) => a.krxCode))]
const today = kstDateKey(Date.now())

const sessions: Record<string, Record<string, [number, number]>> = {}
for (const code of codes) {
  const rows = await regularSessions(code, '20260101')
  sessions[code] = Object.fromEntries(rows.filter((r) => r.close != null && r.date < today).map((r) => [r.date, [r.open, r.close!]]))
  console.log(code, 'sessions', Object.keys(sessions[code]).length)
}
writeFileSync(new URL('../data/krx-sessions.json', import.meta.url), JSON.stringify(sessions))

const days: Record<string, Record<string, [number | null, number | null, number | null, number | null]>> = {}
for (const code of codes) {
  const bars = await tossMinutes(code, Date.UTC(2026, 1, 15))
  const byDay = new Map<string, TossCandle[]>()
  for (const k of bars) {
    const d = kstDateKey(k.t - 1)
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(k)
  }
  days[code] = {}
  for (const [d, ks] of byDay) {
    if (d >= today) continue
    const s = summarizeDay(d, ks)
    days[code][d] = [s.close, s.reopen == null ? null : Math.round(s.reopen * 100) / 100, s.regOpen, s.regClose]
  }
  console.log(code, 'days', Object.keys(days[code]).length)
}
writeFileSync(new URL('../data/krx-days.json', import.meta.url), JSON.stringify(days))
