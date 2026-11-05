// Per trading day, the domestic prices the forecast is built on (Toss consolidated KRX+NXT minute bars):
// - close:  last print up to 20:00 (end of NXT after-market) = the last price a retail investor could trade
// - reopen: volume-weighted average of 08:00–08:10 (start of NXT pre-market) = the first price they can trade again.
//           An average, because the very first pre-market prints are thin and noisy
// - regOpen / regClose: KRX regular session (09:00 auction / 15:30 auction), for reference
// Past days are bundled in server/data/krx-days.json (build with server/scripts/build-sessions.ts); recent days come from the API.
import { readFileSync } from 'node:fs'
import { kstDateKey, kstToMs } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { tossMinutes, type TossCandle } from './toss.js'

export interface DomesticDay {
  date: string
  close: number | null // null until 20:00 that day
  reopen: number | null // null if no pre-market trades in 08:00–08:10
  regOpen: number | null
  regClose: number | null
}

type Store = Record<string, Record<string, [number | null, number | null, number | null, number | null]>> // code → date → [close, reopen, regOpen, regClose]

let bundled: Store = {}
try {
  bundled = JSON.parse(readFileSync(new URL('../data/krx-days.json', import.meta.url), 'utf8'))
} catch {
  bundled = {}
}

/** Toss minute bars are stamped with their END time */
export function summarizeDay(date: string, bars: TossCandle[]): DomesticDay {
  const t0800 = kstToMs(date, '0800')
  const pre = bars.filter((k) => k.t > t0800 && k.t <= t0800 + 10 * 60_000 && k.v > 0)
  const vol = pre.reduce((s, k) => s + k.v, 0)
  const reopen = vol ? pre.reduce((s, k) => s + ((k.h + k.l + k.c) / 3) * k.v, 0) / vol : null
  const done = Date.now() >= kstToMs(date, '2001')
  const last = bars.filter((k) => k.t <= kstToMs(date, '2000')).at(-1)
  return {
    date,
    close: done && last ? last.c : null,
    reopen,
    regOpen: bars.find((k) => k.t === kstToMs(date, '0901'))?.o ?? null,
    regClose: bars.find((k) => k.t === kstToMs(date, '1531'))?.c ?? null,
  }
}

/** Domestic days from `fromMs` onward (ascending). `scale` converts to one perp unit (ADR = 0.1 share) */
export function domesticDays(code: string, fromMs: number, scale = 1): Promise<DomesticDay[]> {
  return cached(`krx:days:${code}:${Math.floor(fromMs / 86400_000)}:${scale}`, 60_000, async () => {
    const known = bundled[code] ?? {}
    const knownDates = Object.keys(known).sort()
    // Fetch only what the bundle does not cover (recent days)
    const fetchFrom = knownDates.length ? Math.max(fromMs, kstToMs(knownDates.at(-1)!, '0000') + 86400_000) : fromMs
    const bars = fetchFrom <= Date.now() ? await tossMinutes(code, fetchFrom) : []
    const byDay = new Map<string, TossCandle[]>()
    for (const k of bars) {
      const d = kstDateKey(k.t - 1)
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(k)
    }
    const out: DomesticDay[] = []
    for (const d of knownDates) {
      if (kstToMs(d, '2359') < fromMs) continue
      const [close, reopen, regOpen, regClose] = known[d]
      out.push({ date: d, close, reopen, regOpen, regClose })
    }
    for (const [d, ks] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) out.push(summarizeDay(d, ks))
    const s = (v: number | null) => (v == null ? null : v * scale)
    return out.map((x) => ({ ...x, close: s(x.close), reopen: s(x.reopen), regOpen: s(x.regOpen), regClose: s(x.regClose) }))
  })
}
