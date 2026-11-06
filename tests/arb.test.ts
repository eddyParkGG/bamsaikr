import { describe, expect, it } from 'vitest'
import { bookNotional, execGross, latencyCost, minuteVol, walkBook } from '../server/services/arb'

describe('order-book walk', () => {
  const asks = [
    { px: 100, sz: 10 }, // 1,000
    { px: 101, sz: 10 }, // 1,010
    { px: 103, sz: 10 }, // 1,030
  ]
  it('fills inside the best level at its price', () => {
    expect(walkBook(asks, 500)).toEqual({ avgPx: 100, filled: 500, full: true })
  })
  it('volume-weights across levels', () => {
    const f = walkBook(asks, 1505)!
    // 10 @ 100 + 5 @ 101
    expect(f.avgPx).toBeCloseTo(1505 / 15, 9)
    expect(f.full).toBe(true)
  })
  it('partial fill when the book is thinner than the notional', () => {
    const f = walkBook(asks, 5000)!
    expect(f.full).toBe(false)
    expect(f.filled).toBeCloseTo(bookNotional(asks), 9)
    expect(f.avgPx).toBeCloseTo(3040 / 30, 9)
  })
  it('null on an empty book or zero size', () => {
    expect(walkBook([], 1000)).toBeNull()
    expect(walkBook(asks, 0)).toBeNull()
  })
})

describe('latency cost', () => {
  it('scales 1-minute volatility by √(lag/60)', () => {
    expect(latencyCost(0.002, 60)).toBeCloseTo(0.002, 12)
    expect(latencyCost(0.002, 3)).toBeCloseTo(0.002 * Math.sqrt(0.05), 12)
    expect(latencyCost(0.002, 0)).toBe(0)
  })
  it('minute volatility = sample stdev of log returns over the last 60', () => {
    // alternating ±r returns: stdev ≈ r
    const r = 0.001
    const closes = [100]
    for (let i = 0; i < 80; i++) closes.push(closes[i] * Math.exp(i % 2 ? -r : r))
    expect(minuteVol(closes)!).toBeCloseTo(r * Math.sqrt(60 / 59), 9)
    expect(minuteVol([100, 101, 102])).toBeNull()
    expect(minuteVol(Array(70).fill(100))).toBe(0)
  })
})

describe('executable gross', () => {
  it('short perp at the bid fill, buy stock at the ask fill', () => {
    // mid premium 1.0%, usual 0.3% → mid gross 0.7%; fills give up 0.1% on the perp and 0.05% on the stock
    const e = execGross({ perpMid: 101, stockLast: 100, perpFill: 101 * 0.999, stockFill: 100 * 1.0005, normal: 0.003, direction: 'perp_short_stock_long' })
    const fillPrem = (101 * 0.999) / (100 * 1.0005) - 1
    expect(e.gross).toBeCloseTo(fillPrem - 0.003, 12)
    expect(e.slippage).toBeCloseTo(0.01 - fillPrem, 12)
    expect(e.slippage).toBeGreaterThan(0)
    // mid gross − slippage = executable gross
    expect(0.007 - e.slippage).toBeCloseTo(e.gross, 12)
  })
  it('long perp at the ask, sell stock at the bid: slippage is still a cost', () => {
    const e = execGross({ perpMid: 99, stockLast: 100, perpFill: 99.1, stockFill: 99.95, normal: 0, direction: 'perp_long_stock_short' })
    expect(e.slippage).toBeGreaterThan(0)
    expect(e.gross).toBeCloseTo(0.01 - e.slippage, 12)
  })
})
