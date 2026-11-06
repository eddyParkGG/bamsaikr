// Last successful upstream fetch per source, for GET /api/health. Counts real responses only: a value served from
// cache (or stale-if-error) does not refresh it, and Toss quotes count when the call succeeds even if the market is
// closed and the price has not moved
export type Source = 'hyperliquid' | 'upbit' | 'toss'

const lastOk: Partial<Record<Source, number>> = {}

export const markOk = (s: Source) => {
  lastOk[s] = Date.now()
}

export const lastOkAt = (s: Source) => lastOk[s] ?? null
