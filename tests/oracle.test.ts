import { describe, expect, it } from 'vitest'
import { detectOracleAnomaly, WINDOW_MIN } from '../server/services/oracle'
import type { Candle } from '../server/sources/hyperliquid'

const M = 60_000
const T0 = Date.UTC(2026, 6, 27, 22, 30) // 2026-07-28 07:30 KST

/** 1m candles from a list of closes: open = previous close, high/low just around the bar */
function series(closes: number[], opts: { n?: number; v?: number; start?: number } = {}): Candle[] {
  const start = opts.start ?? T0
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c
    return { t: start + i * M, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: opts.v ?? 40, n: opts.n ?? 25 }
  })
}

/** Small deterministic wiggle around `base` (±0.15%) */
const wiggle = (base: number, len: number) => Array.from({ length: len }, (_, i) => base * (1 + 0.0015 * Math.sin(i * 1.7)))

describe('oracle anomaly detection', () => {
  it('2026-07-28 replay: one thin oracle print, perp spikes to 927 with huge volume → active, robust ≈ pre-spike', () => {
    const bars = series(wiggle(1128, 29))
    // 08:00 candle: the oracle took the limit-down print, liquidations ran the perp to 927 on 100× volume
    const spikeAt = bars.at(-1)!.t + M
    bars.push({ t: spikeAt, o: 1128, h: 1129, l: 927, c: 1000, v: 5000, n: 900 })
    bars.push({ t: spikeAt + M, o: 1000, h: 1060, l: 990, c: 1050, v: 800, n: 200 })
    const now = spikeAt + 2 * M
    // EWY and KR200 barely moved in the same minutes
    const ewy = series(wiggle(98, 31))
    const kr200 = series(wiggle(560, 31))
    // The oracle followed the print, so mid/mark sit near it: the gap check alone would miss this
    const r = detectOracleAnomaly({ mid: 1052, mark: 1045, oracle: 1040, bars, index: [ewy, kr200], now })
    expect(r.active).toBe(true)
    expect(r.reasons).toContain('spike_1m')
    expect(r.reasons).toContain('index_divergence')
    expect(r.reasons).not.toContain('oracle_gap')
    expect(r.since).toBe(spikeAt)
    expect(r.movePct!).toBeLessThan(-17)
    expect(Math.abs(r.indexMovePct!)).toBeLessThan(1)
    expect(r.robustPx!).toBeGreaterThan(1128 * 0.99)
    expect(r.robustPx!).toBeLessThan(1128 * 1.01)
  })

  it('normal volatility → not active', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 1128 * (1 + 0.004 * Math.sin(i * 0.9) + 0.0005 * i))
    const bars = series(closes)
    const now = bars.at(-1)!.t + M
    const r = detectOracleAnomaly({ mid: closes.at(-1)!, mark: closes.at(-1)!, oracle: closes.at(-1)! * 1.002, bars, index: [], now })
    expect(r.active).toBe(false)
    expect(r.reasons).toEqual([])
    expect(r.since).toBeNull()
    expect(r.robustPx).not.toBeNull()
  })

  it('a market-wide drop that EWY/KR200 share is a real move → not active', () => {
    const closes = [...wiggle(1128, 20), 1060, 1055]
    const bars = series(closes)
    const ewy = series([...wiggle(98, 20), 93.5, 93.4])
    const r = detectOracleAnomaly({ mid: 1055, mark: 1055, oracle: 1056, bars, index: [ewy], now: bars.at(-1)!.t + M })
    expect(r.movePct!).toBeLessThan(-5)
    expect(r.indexMovePct!).toBeLessThan(-4)
    expect(r.active).toBe(false)
  })

  it('same drop with no cross-check data still flags the spike', () => {
    const bars = series([...wiggle(1128, 20), 1060, 1055])
    const r = detectOracleAnomaly({ mid: 1055, mark: 1055, oracle: 1056, bars, index: [], now: bars.at(-1)!.t + M })
    expect(r.active).toBe(true)
    expect(r.reasons).toEqual(['spike_1m'])
  })

  it('mid or mark ≥3% off the oracle → active (oracle_gap)', () => {
    const bars = series(wiggle(1128, 30))
    const r = detectOracleAnomaly({ mid: 1128, mark: 1128, oracle: 1090, bars, index: [], now: bars.at(-1)!.t + M })
    expect(r.active).toBe(true)
    expect(r.reasons).toEqual(['oracle_gap'])
    expect(r.oracleGapPct).toBeGreaterThan(3)
  })

  it('a 2.5% jump counts only on a thin candle (≤3 trades)', () => {
    const closes = [...wiggle(1128, 20), 1100]
    const thin = series(closes, { n: 2 })
    const busy = series(closes, { n: 60 })
    const now = thin.at(-1)!.t + M
    expect(detectOracleAnomaly({ mid: 1100, mark: 1100, oracle: 1100, bars: thin, index: [], now }).reasons).toEqual(['thin_spike'])
    expect(detectOracleAnomaly({ mid: 1100, mark: 1100, oracle: 1100, bars: busy, index: [], now }).active).toBe(false)
  })

  it('a spike older than the window no longer flags', () => {
    const bars = series([...wiggle(1128, 10), 1000, ...wiggle(1000, WINDOW_MIN + 5)])
    const r = detectOracleAnomaly({ mid: 1000, mark: 1000, oracle: 1000, bars, index: [], now: bars.at(-1)!.t + M })
    expect(r.active).toBe(false)
    // the price stayed there: the robust price has moved to the new level
    expect(r.robustPx!).toBeCloseTo(1000, -1)
  })

  it('too few candles: no robust price', () => {
    const bars = series([1128, 1129, 1127])
    const r = detectOracleAnomaly({ mid: 1128, mark: 1128, oracle: 1128, bars, index: [], now: bars.at(-1)!.t + M })
    expect(r.robustPx).toBeNull()
  })

  it('sparse trading: no candle in the window, robust price from the last candles before it', () => {
    const bars = series(wiggle(208, 10))
    const r = detectOracleAnomaly({ mid: 208, mark: 208, oracle: 208, bars, index: [], now: bars.at(-1)!.t + 45 * M })
    expect(r.robustPx!).toBeCloseTo(208, 0)
  })
})
