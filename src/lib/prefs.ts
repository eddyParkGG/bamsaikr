import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChartInterval } from '../../shared/api'
import { DEFAULT_PARAMS, DEFAULT_SETTINGS, type ChartSettings, type IndicatorParams } from '../pro/settings'

export type Theme = 'light' | 'dark'

interface Prefs {
  theme: Theme
  interval: ChartInterval
  chart: ChartSettings
  params: IndicatorParams
  setParams: (p: Partial<IndicatorParams>) => void
  setTheme: (t: Theme) => void
  setInterval: (i: ChartInterval) => void
  toggle: (k: keyof ChartSettings) => void
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'dark',
      interval: '1d',
      chart: DEFAULT_SETTINGS,
      params: DEFAULT_PARAMS,
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      // Stamp the attribute before React re-renders, so anything that reads CSS variables
      // on that render (the chart reads them when it is rebuilt) sees the new theme
      setTheme: (theme) => {
        document.documentElement.dataset.theme = theme
        set({ theme })
      },
      setInterval: (interval) => set({ interval }),
      toggle: (k) => set((s) => ({ chart: { ...s.chart, [k]: !s.chart[k] } })),
    }),
    {
      name: 'bamsai-prefs',
      version: 3,
      // v2: dark by default to match Toss PC; chart defaults to 1 year of daily candles
      // v3: 따라간 정도 markers off by default (they crowd the chart)
      migrate: (p, v) => {
        const prev = p as Prefs
        const next = v < 2 ? { ...prev, theme: 'dark', interval: '1d' } : prev
        return { ...next, chart: { ...next.chart, convergence: false } } as Prefs
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Prefs>
        return { ...current, ...p, chart: { ...DEFAULT_SETTINGS, ...(p?.chart ?? {}) }, params: { ...DEFAULT_PARAMS, ...(p?.params ?? {}) } }
      },
    },
  ),
)
