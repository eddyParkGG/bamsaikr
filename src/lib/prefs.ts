import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChartInterval } from '../../shared/api'
import { DEFAULT_SETTINGS, type ChartSettings } from '../pro/settings'

export type Mode = 'easy' | 'pro'
export type Theme = 'light' | 'dark'

interface Prefs {
  mode: Mode
  theme: Theme
  interval: ChartInterval
  chart: ChartSettings
  setMode: (m: Mode) => void
  setTheme: (t: Theme) => void
  setInterval: (i: ChartInterval) => void
  toggle: (k: keyof ChartSettings) => void
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      mode: 'easy',
      theme: 'dark',
      interval: '1d',
      chart: DEFAULT_SETTINGS,
      setMode: (mode) => set({ mode }),
      setTheme: (theme) => set({ theme }),
      setInterval: (interval) => set({ interval }),
      toggle: (k) => set((s) => ({ chart: { ...s.chart, [k]: !s.chart[k] } })),
    }),
    {
      name: 'bamsai-prefs',
      version: 2,
      // v2: 토스 PC 기준으로 다크 기본, 차트는 일봉 1년 기본
      migrate: (p) => ({ ...(p as object), theme: 'dark', interval: '1d' }) as Prefs,
      merge: (persisted, current) => {
        const p = persisted as Partial<Prefs>
        return { ...current, ...p, chart: { ...DEFAULT_SETTINGS, ...(p?.chart ?? {}) } }
      },
    },
  ),
)
