const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const dec2 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtWon = (v: number) => won.format(Math.round(v))
export const fmtPrice = (v: number, isIndex = false) => (isIndex ? dec2.format(v) : won.format(Math.round(v)))
export const fmtUsd = (v: number) => (v >= 100 ? dec2.format(v) : v.toPrecision(5))

export function fmtPct(v: number, digits = 2, sign = true) {
  const s = Math.abs(v).toFixed(digits)
  if (!sign) return `${s}%`
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${s}%`
}

export const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')

/** 1억 이상은 '억', 1만 이상은 '만' */
export function fmtKoreanUnit(v: number) {
  const a = Math.abs(v)
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e10 ? 0 : 1)}억`
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`
  return won.format(v)
}

export function fmtUsdCompact(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

const KST = 9 * 3600_000

export function kstTime(ms: number) {
  const d = new Date(ms + KST)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function kstDay(ms: number) {
  const d = new Date(ms + KST)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`
}

/** 개장까지 남은 시간: '3시간 20분 뒤', '2일 뒤' */
export function untilText(ms: number) {
  const diff = ms - Date.now()
  if (diff <= 0) return '지금'
  const m = Math.round(diff / 60_000)
  if (m < 60) return `${m}분 뒤`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 ${m % 60 ? `${m % 60}분 ` : ''}뒤`
  return `${Math.floor(h / 24)}일 ${h % 24 ? `${h % 24}시간 ` : ''}뒤`
}

/** 시가 예상일을 사람 말로: 오늘/내일/월요일 */
export function openDayText(ms: number) {
  const d = new Date(ms + KST)
  const today = new Date(Date.now() + KST)
  const days = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400_000)
  if (days === 0) return '오늘'
  if (days === 1) return '내일'
  return `${DOW[d.getUTCDay()]}요일`
}
