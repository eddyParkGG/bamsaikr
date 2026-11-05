// Per-IP request cap (fixed one-minute window, in memory: the API runs on exactly one machine)
//
// Requests arrive either through Vercel (/api rewrite) or straight at bamsai-api.fly.dev.
// - Vercel overwrites X-Forwarded-For with the visitor's IP and Fly appends its peer, so the first entry is the visitor.
// - A direct caller can forge that first entry, so the peer (Fly-Client-IP) gets its own, higher cap:
//   behind Vercel the peer is a shared edge IP carrying many visitors' cache misses.

export const PER_CLIENT = 300 // one page polls ~55 times a minute; this leaves room for several tabs
export const PER_PEER = 6000

export interface Limiter {
  /** True when this request is over either cap */
  hit(client: string, peer: string, now?: number): boolean
}

export function createLimiter(perClient = PER_CLIENT, perPeer = PER_PEER): Limiter {
  let window = 0
  const counts = new Map<string, number>()
  const bump = (k: string) => {
    const n = (counts.get(k) ?? 0) + 1
    counts.set(k, n)
    return n
  }
  return {
    hit(client, peer, now = Date.now()) {
      const w = Math.floor(now / 60_000)
      if (w !== window) {
        window = w
        counts.clear()
      }
      const overClient = bump(`c:${client}`) > perClient
      const overPeer = bump(`p:${peer}`) > perPeer
      return overClient || overPeer
    },
  }
}

/** Visitor IP: first X-Forwarded-For entry, else the peer */
export function clientIp(xff: string | undefined, peer: string) {
  return xff?.split(',')[0]?.trim() || peer
}
