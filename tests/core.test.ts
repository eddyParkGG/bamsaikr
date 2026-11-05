import { describe, expect, it } from 'vitest'
import { kstToMs, nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session'
import { formatPx, formatSz } from '../shared/hlOrder'
import { bollinger, rsi, sma } from '../src/pro/indicators'
import { normCdf } from '../server/services/predict'

const NONE = new Set<string>()

describe('장 시간 구분 (KST)', () => {
  it('정규장 / 넥스트레이드 / 휴장', () => {
    expect(sessionAt(kstToMs('20261105', '1000'), NONE)).toBe('regular')
    expect(sessionAt(kstToMs('20261105', '0830'), NONE)).toBe('nxt')
    expect(sessionAt(kstToMs('20261105', '1700'), NONE)).toBe('nxt')
    expect(sessionAt(kstToMs('20261105', '2100'), NONE)).toBe('closed')
    expect(sessionAt(kstToMs('20261107', '1000'), NONE)).toBe('closed') // 토요일
    expect(sessionAt(kstToMs('20261225', '1000'), new Set(['20261225']))).toBe('closed')
  })

  it('금요일 장 끝난 뒤 다음 개장은 월요일 09:00', () => {
    expect(nextRegularOpen(kstToMs('20261106', '1600'), NONE)).toBe(kstToMs('20261109', '0900'))
  })

  it('휴장일을 건너뛰고 직전 종가를 찾음', () => {
    const holidays = new Set(['20261009']) // 한글날(금)
    expect(prevRegularClose(kstToMs('20261010', '1200'), holidays)).toBe(kstToMs('20261008', '1530'))
  })
})

describe('하이퍼리퀴드 가격·수량 규칙', () => {
  it('유효숫자 5자리, 소수점은 6 - szDecimals', () => {
    expect(formatPx(1306.2671, 3)).toBe('1306.3')
    expect(formatPx(152.1349, 3)).toBe('152.13')
    expect(formatPx(9.54321, 1)).toBe('9.5432')
  })
  it('수량은 내림', () => {
    expect(formatSz(1.23456, 3)).toBe('1.234')
    expect(formatSz(0.0009, 3)).toBe('0')
  })
})

describe('보조지표', () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({ t: i, o: i, h: i + 1, l: i - 1, c: i, v: 1 }))
  it('SMA', () => {
    expect(sma(bars, 5).at(-1)!.v).toBe(37)
  })
  it('계속 오르기만 하면 RSI 100', () => {
    expect(rsi(bars).at(-1)!.v).toBe(100)
  })
  it('볼린저 중심선 = 20일 평균', () => {
    expect(bollinger(bars).mid.at(-1)!.v).toBeCloseTo(29.5)
  })
})

describe('정규분포 CDF', () => {
  it('대칭', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6)
    expect(normCdf(1.2816)).toBeCloseTo(0.9, 3)
  })
})
