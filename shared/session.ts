// Korean stock market session classification (KST)
// KRX regular 09:00~15:30, Nextrade (NXT) pre-market 08:00~08:50 / after-market 15:30~20:00
// Hyperliquid perps trade 24h. The trade.xyz oracle runs on an internal price weekdays 20:00~09:01 next day, and on weekends/holidays

export type Session = 'regular' | 'nxt' | 'closed'

const KST_OFFSET = 9 * 3600_000

export function kstParts(ms: number) {
  const d = new Date(ms + KST_OFFSET)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

export function kstDateKey(ms: number): string {
  const p = kstParts(ms)
  return `${p.y}${String(p.m).padStart(2, '0')}${String(p.d).padStart(2, '0')}`
}

/** 'YYYYMMDD' + 'HHMM' (KST) → epoch ms */
export function kstToMs(date: string, hhmm = '0000'): number {
  const y = +date.slice(0, 4)
  const m = +date.slice(4, 6)
  const d = +date.slice(6, 8)
  return Date.UTC(y, m - 1, d, +hhmm.slice(0, 2), +hhmm.slice(2, 4)) - KST_OFFSET
}

export function isWeekend(ms: number) {
  const dow = kstParts(ms).dow
  return dow === 0 || dow === 6
}

/** holidays: set of 'YYYYMMDD' market holidays (weekday closures only, weekends excluded) */
export function sessionAt(ms: number, holidays: ReadonlySet<string>): Session {
  if (isWeekend(ms) || holidays.has(kstDateKey(ms))) return 'closed'
  const min = kstParts(ms).minutes
  if (min >= 540 && min < 930) return 'regular'
  if ((min >= 480 && min < 540) || (min >= 930 && min < 1200)) return 'nxt'
  return 'closed'
}

export function isTradingDay(ms: number, holidays: ReadonlySet<string>) {
  return !isWeekend(ms) && !holidays.has(kstDateKey(ms))
}

/** Time of the next KRX regular-session open (09:00 KST) */
export function nextRegularOpen(now: number, holidays: ReadonlySet<string>): number {
  let day = kstToMs(kstDateKey(now), '0900')
  if (now >= day) day += 86400_000
  for (let i = 0; i < 20 && !isTradingDay(day, holidays); i++) day += 86400_000
  return day
}

/** Time of the previous KRX regular-session close (15:30 KST) */
export function prevRegularClose(now: number, holidays: ReadonlySet<string>): number {
  let day = kstToMs(kstDateKey(now), '1530')
  if (now < day) day -= 86400_000
  for (let i = 0; i < 20 && !isTradingDay(day, holidays); i++) day -= 86400_000
  return day
}

// 2026 KRX holidays (excluding weekends). Used only when the KIS holiday API is unavailable
// Past holidays are detected from daily candles, so this list is only for computing the next open day
export const KRX_HOLIDAYS_FALLBACK = new Set([
  '20260101', '20260216', '20260217', '20260218', '20260302', '20260501', '20260505',
  '20260525', '20260603', '20260817', '20260924', '20260925', '20261005', '20261009',
  '20261225', '20261231',
])

/**
 * Domestic market = KRX + NXT, i.e. anything a retail investor can trade (08:00–20:00 on trading days).
 * The truly closed window is 20:00 → next trading day 08:00.
 */
export function nextDomesticOpen(now: number, holidays: ReadonlySet<string>): number {
  let day = kstToMs(kstDateKey(now), '0800')
  if (now >= day) day += 86400_000
  for (let i = 0; i < 20 && !isTradingDay(day, holidays); i++) day += 86400_000
  return day
}

/** True while KRX or NXT is trading (forecast for the next re-open is not meaningful then) */
export const domesticTrading = (ms: number, holidays: ReadonlySet<string>) => sessionAt(ms, holidays) !== 'closed'
