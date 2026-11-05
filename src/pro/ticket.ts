// Order-book → order-form hand-off: clicking a price fills the order form (limit, that price, focus quantity)
import { create } from 'zustand'

export type TicketMarket = 'perp' | 'krx'

interface Ticket {
  pick: { market: TicketMarket; price: number; n: number; t: number } | null
  pickPrice: (market: TicketMarket, price: number) => void
}

export const useTicket = create<Ticket>((set, get) => ({
  pick: null,
  pickPrice: (market, price) => set({ pick: { market, price, n: (get().pick?.n ?? 0) + 1, t: Date.now() } }),
}))

/** KRX tick size by price band (rules since 2023) */
export function krxTick(px: number) {
  if (px < 2000) return 1
  if (px < 5000) return 5
  if (px < 20000) return 10
  if (px < 50000) return 50
  if (px < 200000) return 100
  if (px < 500000) return 500
  return 1000
}

/** Hyperliquid prices carry 5 significant figures */
export function perpTick(px: number) {
  if (!(px > 0)) return 0.01
  return 10 ** (Math.floor(Math.log10(px)) - 4)
}

/** Round to the tick and drop float noise */
export function snap(v: number, tick: number) {
  const d = Math.max(0, -Math.floor(Math.log10(tick)))
  return +(Math.round(v / tick) * tick).toFixed(d)
}
