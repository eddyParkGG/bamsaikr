// 한국 주식시장 시간대 구분 (KST 기준)
// KRX 정규장 09:00~15:30, 넥스트레이드(NXT) 프리마켓 08:00~08:50 / 애프터마켓 15:30~20:00
// 하이퍼리퀴드 perp 는 24시간. trade.xyz 오라클은 평일 20:00~익일 09:01, 주말·휴장일에 내부 가격으로 움직임

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

/** holidays: 휴장일 'YYYYMMDD' 집합 (주말 제외 평일 휴장) */
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

/** 다음 KRX 정규장 시가(09:00 KST) 시각 */
export function nextRegularOpen(now: number, holidays: ReadonlySet<string>): number {
  let day = kstToMs(kstDateKey(now), '0900')
  if (now >= day) day += 86400_000
  for (let i = 0; i < 20 && !isTradingDay(day, holidays); i++) day += 86400_000
  return day
}

/** 직전 KRX 정규장 종가(15:30 KST) 시각 */
export function prevRegularClose(now: number, holidays: ReadonlySet<string>): number {
  let day = kstToMs(kstDateKey(now), '1530')
  if (now < day) day -= 86400_000
  for (let i = 0; i < 20 && !isTradingDay(day, holidays); i++) day -= 86400_000
  return day
}

// 2026 KRX 휴장일 (주말 제외). KIS 휴장일조회 API 를 쓸 수 없을 때만 사용
// 과거 휴장일은 일봉 데이터에서 직접 판별하므로 이 목록은 '다음 개장일' 계산용
export const KRX_HOLIDAYS_FALLBACK = new Set([
  '20260101', '20260216', '20260217', '20260218', '20260302', '20260501', '20260505',
  '20260525', '20260603', '20260817', '20260924', '20260925', '20261005', '20261009',
  '20261225', '20261231',
])
