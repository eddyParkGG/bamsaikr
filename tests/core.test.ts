import { describe, expect, it } from 'vitest'
import { kstToMs, nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session'
import { formatPx, formatSz } from '../shared/hlOrder'
import { bollinger, rsi, sma } from '../src/pro/indicators'
import { normCdf } from '../server/services/predict'

const NONE = new Set<string>()

describe('market session classification (KST)', () => {
  it('regular / Nextrade / closed', () => {
    expect(sessionAt(kstToMs('20261105', '1000'), NONE)).toBe('regular')
    expect(sessionAt(kstToMs('20261105', '0830'), NONE)).toBe('nxt')
    expect(sessionAt(kstToMs('20261105', '1700'), NONE)).toBe('nxt')
    expect(sessionAt(kstToMs('20261105', '2100'), NONE)).toBe('closed')
    expect(sessionAt(kstToMs('20261107', '1000'), NONE)).toBe('closed') // Saturday
    expect(sessionAt(kstToMs('20261225', '1000'), new Set(['20261225']))).toBe('closed')
  })

  it('after Friday close, next open is Monday 09:00', () => {
    expect(nextRegularOpen(kstToMs('20261106', '1600'), NONE)).toBe(kstToMs('20261109', '0900'))
  })

  it('skips holidays to find the previous close', () => {
    const holidays = new Set(['20261009']) // Hangul Day (Fri)
    expect(prevRegularClose(kstToMs('20261010', '1200'), holidays)).toBe(kstToMs('20261008', '1530'))
  })
})

describe('Hyperliquid price/size rules', () => {
  it('5 significant figures, decimals up to 6 - szDecimals', () => {
    expect(formatPx(1306.2671, 3)).toBe('1306.3')
    expect(formatPx(152.1349, 3)).toBe('152.13')
    expect(formatPx(9.54321, 1)).toBe('9.5432')
  })
  it('size rounds down', () => {
    expect(formatSz(1.23456, 3)).toBe('1.234')
    expect(formatSz(0.0009, 3)).toBe('0')
  })
})

describe('indicators', () => {
  const bars = Array.from({ length: 40 }, (_, i) => ({ t: i, o: i, h: i + 1, l: i - 1, c: i, v: 1 }))
  it('SMA', () => {
    expect(sma(bars, 5).at(-1)!.v).toBe(37)
  })
  it('RSI is 100 when price only rises', () => {
    expect(rsi(bars).at(-1)!.v).toBe(100)
  })
  it('Bollinger middle band = 20-period mean', () => {
    expect(bollinger(bars).mid.at(-1)!.v).toBeCloseTo(29.5)
  })
})

describe('normal CDF', () => {
  it('symmetric', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6)
    expect(normCdf(1.2816)).toBeCloseTo(0.9, 3)
  })
})
