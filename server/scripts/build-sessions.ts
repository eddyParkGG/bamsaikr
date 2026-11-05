// Prefetch and store KRX regular-session open/close for past trading days (run once before deploy)
// Run: npx tsx --env-file=.env.local server/scripts/build-sessions.ts
import { writeFileSync } from 'node:fs'
import { ASSETS } from '../../shared/assets.js'
import { kstDateKey } from '../../shared/session.js'
import { regularSessions } from '../sources/krxSessions.js'

const store: Record<string, Record<string, [number, number]>> = {}
const today = kstDateKey(Date.now())
for (const a of ASSETS) {
  const rows = await regularSessions(a.krxCode, '20260101')
  store[a.krxCode] = Object.fromEntries(rows.filter((r) => r.close != null && r.date < today).map((r) => [r.date, [r.open, r.close!]]))
  console.log(a.name, Object.keys(store[a.krxCode]).length, 'days')
}
writeFileSync(new URL('../data/krx-sessions.json', import.meta.url), JSON.stringify(store))
