import { describe, expect, it } from 'vitest'
import { kstToMs, nextRegularOpen, prevRegularClose, sessionAt } from '../shared/session'
import { formatPx, formatSz } from '../shared/hlOrder'
import { bollinger, rsi, sma } from '../src/pro/indicators'
import { normCdf } from '../server/services/predict'
import { clientIp, createLimiter } from '../server/lib/rateLimit'
import { nightStage } from '../src/lib/night'

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

describe('per-IP rate limit', () => {
  it('caps each visitor, resets every minute, and caps a shared peer separately', () => {
    const l = createLimiter(3, 5)
    const t = 60_000 * 100
    expect([1, 2, 3].map(() => l.hit('a', 'edge', t))).toEqual([false, false, false])
    expect(l.hit('a', 'edge', t)).toBe(true) // 4th from the same visitor
    expect(l.hit('b', 'edge', t)).toBe(false) // new visitor, peer at its cap of 5
    expect(l.hit('b', 'edge', t)).toBe(true) // 6th through the same peer
    expect(l.hit('a', 'edge', t + 60_000)).toBe(false) // next minute
  })
  it('takes the visitor from the first X-Forwarded-For entry', () => {
    expect(clientIp('1.2.3.4, 76.76.21.1', '76.76.21.1')).toBe('1.2.3.4')
    expect(clientIp(undefined, '9.9.9.9')).toBe('9.9.9.9')
  })
})

describe('night stage before the next open (US session in KST, DST-aware)', () => {
  const kst = (iso: string) => Date.parse(iso + '+09:00')
  const fri8 = kst('2026-11-06T08:00')
  it('standard time: US open 23:30, close 06:00 KST', () => {
    expect(nightStage(fri8, kst('2026-11-05T21:00')).stage).toBe('before')
    expect(nightStage(fri8, kst('2026-11-06T01:00')).stage).toBe('during')
    expect(nightStage(fri8, kst('2026-11-06T06:30')).stage).toBe('after')
    expect(nightStage(fri8, kst('2026-11-05T21:00')).when).toBe('미국장이 닫히는 새벽 6시 이후가 가장 정확해요')
  })
  it('daylight saving: US open 22:30, close 05:00 KST', () => {
    const thu8 = kst('2026-10-15T08:00')
    expect(nightStage(thu8, kst('2026-10-14T22:45')).stage).toBe('during')
    expect(nightStage(thu8, kst('2026-10-15T05:30')).stage).toBe('after')
    expect(nightStage(thu8, kst('2026-10-14T21:00')).when).toBe('미국장이 닫히는 새벽 5시 이후가 가장 정확해요')
  })
  it('weekend: Friday night session still ahead, then settled until Monday', () => {
    const mon8 = kst('2026-11-09T08:00')
    expect(nightStage(mon8, kst('2026-11-06T21:00')).stage).toBe('before')
    expect(nightStage(mon8, kst('2026-11-08T12:00')).stage).toBe('after')
  })
})


describe('api usage events', () => {
  it('tells agents and scripts from browsers by User-Agent', async () => {
    const { callerKind } = await import('../server/lib/gaEvents')
    expect(callerKind('Claude-User (claude-code/2.1)')).toBe('agent')
    expect(callerKind('curl/8.7.1')).toBe('curl')
    expect(callerKind('python-requests/2.32')).toBe('python')
    expect(callerKind('node')).toBe('node')
    expect(callerKind('Mozilla/5.0 (Macintosh)')).toBe('browser')
    expect(callerKind('')).toBe('unknown')
  })
})

describe('toss request queue', () => {
  it('maps paths to Toss API groups', async () => {
    const { tossGroup } = await import('../server/sources/toss')
    expect(tossGroup('/api/v1/market-indicators/KOSPI/candles?interval=1m').name).toBe('indicator_chart')
    expect(tossGroup('/api/v1/candles?symbol=005930').name).toBe('chart')
    expect(tossGroup('/api/v1/prices?symbols=005930').name).toBe('market_data')
    expect(tossGroup('/api/v1/market-calendar/KR').name).toBe('market_info')
  })
  it('lets at most perSec calls of a group through per second', async () => {
    const { tossSlot } = await import('../server/sources/toss')
    const g = { name: 'test', perSec: 5 }
    const start = Date.now()
    const done: number[] = []
    await Promise.all(Array.from({ length: 7 }, () => tossSlot(g).then(() => done.push(Date.now() - start))))
    done.sort((a, b) => a - b)
    expect(done[4]).toBeLessThan(200)
    expect(done[5]).toBeGreaterThanOrEqual(950)
  })
})

describe('api caller counting', () => {
  it('a caller id is stable for the same IP + UA, differs across IPs, and hides the IP', async () => {
    const { callerId } = await import('../server/lib/gaEvents')
    const a = callerId('1.2.3.4', 'python-requests/2.34', 's')
    expect(callerId('1.2.3.4', 'python-requests/2.34', 's')).toBe(a)
    expect(callerId('5.6.7.8', 'python-requests/2.34', 's')).not.toBe(a)
    expect(a).not.toContain('1.2.3.4')
  })
  it('counts only data reads: REST /v1 and MCP tool calls, not handshakes or errors', async () => {
    const { isDataCall } = await import('../server/lib/gaEvents')
    expect(isDataCall('/api/v1/predict', 200)).toBe(true)
    expect(isDataCall('/api/v1/predict', 429)).toBe(false)
    expect(isDataCall('/api/mcp', 200, 'get_arbitrage')).toBe(true)
    expect(isDataCall('/api/mcp', 200, 'initialize')).toBe(false)
    expect(isDataCall('/api/mcp', 200, 'tools/list')).toBe(false)
    expect(isDataCall('/api/mcp', 202, 'notifications/initialized')).toBe(false)
    expect(isDataCall('/api/mcp/.well-known/agent.json', 404)).toBe(false)
  })
})
