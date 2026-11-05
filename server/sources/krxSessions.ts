// KRX regular-session open (09:00) / close (15:30)
// Toss daily candles use consolidated quotes (08:00~20:00), which differ from the regular-session open/close → derive from minute bars
// Toss minute-bar timestamps are bar end times: open of the 09:01 bar = opening auction, close of the 15:31 bar = closing auction
// Past dates are stored in bundled JSON (server/data/krx-sessions.json); only the last few days are filled via the API
import { readFileSync } from 'node:fs'
import { kstDateKey, kstToMs } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { tossCandles, tossCandlesBefore } from './toss.js'

export interface RegularSession {
  date: string
  open: number
  close: number | null // null during today's session
}

type Store = Record<string, Record<string, [number, number]>> // code → date → [open, close]

let bundled: Store = {}
try {
  bundled = JSON.parse(readFileSync(new URL('../data/krx-sessions.json', import.meta.url), 'utf8'))
} catch {
  bundled = {}
}

async function fetchDay(code: string, date: string): Promise<RegularSession | null> {
  const openBar = await tossCandlesBefore(code, '1m', kstToMs(date, '0901'), 1)
  const o = openBar.find((k) => kstDateKey(k.t) === date)
  if (!o) return null
  const closeAt = kstToMs(date, '1531')
  if (Date.now() < closeAt + 60_000) return { date, open: o.o, close: null }
  const closeBar = await tossCandlesBefore(code, '1m', closeAt, 1)
  const c = closeBar.find((k) => kstDateKey(k.t) === date)
  return { date, open: o.o, close: c?.c ?? null }
}

/** Regular-session open/close for trading days from `from` (YYYYMMDD) onward (ascending) */
export function regularSessions(code: string, from: string): Promise<RegularSession[]> {
  return cached(`krx:sessions:${code}:${from}`, 60_000, async () => {
    const daily = await tossCandles(code, '1d', kstToMs(from))
    const dates = daily.map((k) => kstDateKey(k.t)).filter((d) => d >= from)
    const known = bundled[code] ?? {}
    const out: RegularSession[] = []
    const missing = dates.filter((d) => !known[d])
    // Toss chart API allows 20 req/sec → 8 in parallel
    const fetched = new Map<string, RegularSession | null>()
    for (let i = 0; i < missing.length; i += 8) {
      const batch = await Promise.all(missing.slice(i, i + 8).map((d) => fetchDay(code, d).catch(() => null)))
      batch.forEach((s, j) => fetched.set(missing[i + j], s))
    }
    for (const d of dates) {
      const k = known[d]
      if (k) out.push({ date: d, open: k[0], close: k[1] })
      else {
        const s = fetched.get(d)
        if (s) out.push(s)
      }
    }
    return out
  })
}
