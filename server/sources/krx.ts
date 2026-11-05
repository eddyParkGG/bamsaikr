// 국내 시세 창구. KIS 키가 있으면 KIS, 없으면 공개 시세로 대체하고 출처를 같이 돌려줌
import type { Asset } from '../../shared/assets.js'
import { KRX_HOLIDAYS_FALLBACK, kstDateKey, kstToMs } from '../../shared/session.js'
import { cached } from '../lib/cache.js'
import type { Candle } from './hyperliquid.js'
import { kisDaily, kisEnabled, kisHolidays, kisIndexQuote, kisMinutes, kisNews, kisOrderbook, kisQuote, type KisQuote } from './kis.js'
import { naverDaily, naverMinutes, naverQuote } from './naver.js'

export type KrxSource = 'kis' | 'naver'
export const krxSource = (): KrxSource => (kisEnabled() ? 'kis' : 'naver')

export async function krxQuote(a: Asset): Promise<KisQuote & { source: KrxSource }> {
  if (kisEnabled()) {
    try {
      const q = a.kind === 'index' ? await kisIndexQuote(a.krxCode) : await kisQuote(a.krxCode, 'UN')
      return { ...q, source: 'kis' }
    } catch (e) {
      console.warn('[kis] quote 실패, 대체 소스 사용', (e as Error).message)
    }
  }
  return { ...(await naverQuote(a)), source: 'naver' }
}

export interface DailyBar {
  date: string
  o: number
  h: number
  l: number
  c: number
  v: number
}

export function krxDaily(a: Asset, from: string, to: string): Promise<DailyBar[]> {
  return cached(`krx:daily:${a.id}:${from}:${to}:${krxSource()}`, 5 * 60_000, async () => {
    if (kisEnabled() && a.kind === 'stock') {
      try {
        // KIS 일봉은 1회 100개 → 끝에서부터 거슬러 올라감
        const out: DailyBar[] = []
        let end = to
        for (let i = 0; i < 6; i++) {
          const page = await kisDaily(a.krxCode, from, end)
          if (!page.length) break
          out.push(...page)
          const oldest = page[page.length - 1].date
          if (oldest <= from || page.length < 100) break
          end = kstDateKey(kstToMs(oldest) - 86400_000)
        }
        return out.sort((x, y) => x.date.localeCompare(y.date))
      } catch (e) {
        console.warn('[kis] daily 실패, 대체 소스 사용', (e as Error).message)
      }
    }
    return naverDaily(a, from, to)
  })
}

/** 하루치 분봉 (KIS 는 통합시세라 NXT 08:00~20:00 포함, 대체 소스는 KRX 09:00~15:30) */
export function krxMinutes(a: Asset, date: string): Promise<Candle[]> {
  const today = kstDateKey(Date.now()) === date
  return cached(`krx:min:${a.id}:${date}:${krxSource()}`, today ? 20_000 : 3600_000, async () => {
    if (kisEnabled() && a.kind === 'stock') {
      try {
        const out: Candle[] = []
        let cursor = '200000'
        for (let i = 0; i < 8; i++) {
          const page = await kisMinutes(a.krxCode, date, cursor, 'UN')
          const sameDay = page.filter((k) => k.date === date)
          if (!sameDay.length) break
          for (const k of sameDay) out.push({ t: kstToMs(k.date, k.time.slice(0, 4)), o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })
          const oldest = sameDay[sameDay.length - 1].time
          if (oldest <= '080000' || sameDay.length < 120) break
          const ms = kstToMs(date, oldest.slice(0, 4)) - 60_000
          const d = new Date(ms + 9 * 3600_000)
          cursor = `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00`
        }
        return out.sort((x, y) => x.t - y.t)
      } catch (e) {
        console.warn('[kis] minutes 실패, 대체 소스 사용', (e as Error).message)
      }
    }
    const raw = await naverMinutes(a, date)
    return raw.map((k) => ({ t: kstToMs(k.dt.slice(0, 8), k.dt.slice(8, 12)), o: k.o, h: k.h, l: k.l, c: k.c, v: k.v }))
  })
}

export async function krxOrderbook(a: Asset) {
  if (!kisEnabled() || a.kind !== 'stock') return null
  const [krx, nxt] = await Promise.allSettled([kisOrderbook(a.krxCode, 'J'), kisOrderbook(a.krxCode, 'NX')])
  return {
    krx: krx.status === 'fulfilled' ? krx.value : null,
    nxt: nxt.status === 'fulfilled' ? nxt.value : null,
  }
}

/** 휴장일 집합. KIS 실전키면 휴장일조회 API, 아니면 내장 목록 */
export async function krxHolidays(): Promise<Set<string>> {
  if (kisEnabled() && process.env.KIS_ENV === 'prod') {
    try {
      const days = await kisHolidays(kstDateKey(Date.now()))
      const set = new Set(KRX_HOLIDAYS_FALLBACK)
      for (const d of days) if (!d.open) set.add(d.date)
      return set
    } catch (e) {
      console.warn('[kis] holiday 실패', (e as Error).message)
    }
  }
  return KRX_HOLIDAYS_FALLBACK
}

export async function krxNews(a: Asset) {
  if (!kisEnabled() || a.kind !== 'stock') return []
  try {
    return await kisNews(a.krxCode)
  } catch (e) {
    console.warn('[kis] news 실패', (e as Error).message)
    return []
  }
}
