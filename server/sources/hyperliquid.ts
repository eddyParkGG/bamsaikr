import { cached, fetchJson } from '../lib/cache.js'

const MAINNET = 'https://api.hyperliquid.xyz'
const TESTNET = 'https://api.hyperliquid-testnet.xyz'

async function info<T>(body: object, testnet = false): Promise<T> {
  // Retry briefly: several cold history loads at once can hit the public rate limit
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJson<T>(`${testnet ? TESTNET : MAINNET}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
    }
  }
}

export interface PerpCtx {
  coin: string
  markPx: number
  midPx: number | null
  oraclePx: number
  prevDayPx: number
  funding: number // 1-hour funding rate
  openInterest: number
  dayNtlVlm: number
  maxLeverage: number
  szDecimals: number
}

type RawUniverse = { name: string; szDecimals: number; maxLeverage: number }
type RawCtx = Record<string, string | null>

export function getPerpCtxs(): Promise<Map<string, PerpCtx>> {
  return cached('hl:ctx:xyz', 1500, async () => {
    const [meta, ctxs] = await info<[{ universe: RawUniverse[] }, RawCtx[]]>({ type: 'metaAndAssetCtxs', dex: 'xyz' })
    const out = new Map<string, PerpCtx>()
    meta.universe.forEach((u, i) => {
      const c = ctxs[i]
      out.set(u.name, {
        coin: u.name,
        markPx: Number(c.markPx),
        midPx: c.midPx == null ? null : Number(c.midPx),
        oraclePx: Number(c.oraclePx),
        prevDayPx: Number(c.prevDayPx),
        funding: Number(c.funding),
        openInterest: Number(c.openInterest),
        dayNtlVlm: Number(c.dayNtlVlm),
        maxLeverage: u.maxLeverage,
        szDecimals: u.szDecimals,
      })
    })
    return out
  })
}

export interface Candle {
  t: number // start time ms
  o: number
  h: number
  l: number
  c: number
  v: number // volume (perp: contracts, KRX: shares)
}

export type HlInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

const TTL: Record<HlInterval, number> = { '1m': 10_000, '5m': 20_000, '15m': 30_000, '1h': 60_000, '4h': 120_000, '1d': 300_000 }

export function getPerpCandles(coin: string, interval: HlInterval, startTime = 0): Promise<Candle[]> {
  return cached(`hl:candles:${coin}:${interval}:${startTime}`, TTL[interval], async () => {
    const raw = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime },
    })
    return raw.map((k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }))
  })
}

/** When the perp started trading: the first 4h bar (4h bars still reach back to the Feb 2026 listings) */
export function getPerpListedAt(coin: string): Promise<number | null> {
  return cached(`hl:listed:${coin}`, 24 * 3600_000, async () => (await getPerpCandles(coin, '4h', 0))[0]?.t ?? null)
}

/**
 * Full 1h history since `fromMs`. One candleSnapshot call returns at most 5,000 candles
 * (about 208 days of 1h bars), so walk forward in 5,000-hour windows.
 */
export function getPerpHourlySince(coin: string, fromMs: number): Promise<Candle[]> {
  const H = 3600_000
  return cached(`hl:candles:${coin}:1h:since:${Math.floor(fromMs / 86400_000)}`, 60_000, async () => {
    const out: Candle[] = []
    for (let start = fromMs; start < Date.now(); start += 5000 * H) {
      const raw = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>({
        type: 'candleSnapshot',
        req: { coin, interval: '1h', startTime: start, endTime: Math.min(Date.now(), start + 5000 * H - 1) },
      })
      for (const k of raw) out.push({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v })
    }
    out.sort((a, b) => a.t - b.t)
    return out.filter((k, i) => i === 0 || k.t !== out[i - 1].t)
  })
}

export interface BookLevel {
  px: number
  sz: number
  n: number
}

export function getPerpBook(coin: string, testnet = false) {
  return cached(`hl:book:${coin}:${testnet}`, 800, async () => {
    const r = await info<{ levels: [{ px: string; sz: string; n: number }[], { px: string; sz: string; n: number }[]]; time: number }>(
      { type: 'l2Book', coin },
      testnet,
    )
    const map = (l: { px: string; sz: string; n: number }) => ({ px: +l.px, sz: +l.sz, n: l.n })
    return { bids: r.levels[0].map(map), asks: r.levels[1].map(map), time: r.time }
  })
}

export function getFundingHistory(coin: string, startTime: number) {
  return cached(`hl:funding:${coin}:${startTime}`, 300_000, async () => {
    const r = await info<{ time: number; fundingRate: string; premium: string }[]>({ type: 'fundingHistory', coin, startTime })
    return r.map((f) => ({ t: f.time, rate: +f.fundingRate, premium: +f.premium }))
  })
}

export { MAINNET as HL_MAINNET, TESTNET as HL_TESTNET, info as hlInfo }
