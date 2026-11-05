// KRX 정규장 시가(09:00)·종가(15:30)
// 토스 일봉은 통합 시세(08:00~20:00) 기준이라 정규장 시가·종가와 다름 → 분봉에서 직접 뽑음
// 토스 분봉 timestamp 는 봉이 끝나는 시각: 09:01 봉의 시가 = 개장 동시호가, 15:31 봉의 종가 = 마감 동시호가
// 지난 날짜는 bundled JSON(server/data/krx-sessions.json)에 저장해두고 최근 며칠만 API 로 채움
import { readFileSync } from 'node:fs'
import { kstDateKey, kstToMs } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import { tossCandles, tossCandlesBefore } from './toss.js'

export interface RegularSession {
  date: string
  open: number
  close: number | null // 오늘 장중이면 null
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

/** from(YYYYMMDD) 이후 거래일의 정규장 시가·종가 (오름차순) */
export function regularSessions(code: string, from: string): Promise<RegularSession[]> {
  return cached(`krx:sessions:${code}:${from}`, 60_000, async () => {
    const daily = await tossCandles(code, '1d', kstToMs(from))
    const dates = daily.map((k) => kstDateKey(k.t)).filter((d) => d >= from)
    const known = bundled[code] ?? {}
    const out: RegularSession[] = []
    const missing = dates.filter((d) => !known[d])
    // 토스 차트 API 초당 20회 → 8개씩 병렬
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
