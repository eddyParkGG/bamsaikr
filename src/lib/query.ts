// Tiny polling cache. One request per key across components; pauses while the tab is hidden
import { useEffect, useSyncExternalStore } from 'react'

type State<T> = { data?: T; error?: Error; updatedAt: number }
type Entry = {
  state: State<unknown>
  listeners: Set<() => void>
  timer?: ReturnType<typeof setTimeout>
  inflight?: Promise<void>
  interval: number
  subscribers: number
}

const entries = new Map<string, Entry>()

function entry(key: string): Entry {
  let e = entries.get(key)
  if (!e) {
    e = { state: { updatedAt: 0 }, listeners: new Set(), interval: 0, subscribers: 0 }
    entries.set(key, e)
  }
  return e
}

async function load(key: string) {
  const e = entry(key)
  if (e.inflight) return e.inflight
  e.inflight = (async () => {
    try {
      const res = await fetch(key)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `요청 실패 (${res.status})`)
      e.state = { data: body, updatedAt: Date.now() }
    } catch (err) {
      e.state = { ...e.state, error: err as Error }
    } finally {
      e.inflight = undefined
      e.listeners.forEach((l) => l())
    }
  })()
  return e.inflight
}

function schedule(key: string) {
  const e = entry(key)
  clearTimeout(e.timer)
  if (!e.interval || !e.subscribers) return
  e.timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await load(key)
    schedule(key)
  }, e.interval)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  for (const [key, e] of entries) if (e.subscribers && e.interval && Date.now() - e.state.updatedAt > e.interval) load(key)
})

export function useQuery<T>(key: string | null, intervalMs = 0): State<T> & { loading: boolean } {
  const state = useSyncExternalStore(
    (cb) => {
      if (!key) return () => {}
      const e = entry(key)
      e.listeners.add(cb)
      return () => e.listeners.delete(cb)
    },
    () => (key ? (entry(key).state as State<T>) : EMPTY),
  ) as State<T>

  useEffect(() => {
    if (!key) return
    const e = entry(key)
    e.subscribers++
    e.interval = intervalMs ? Math.min(e.interval || Infinity, intervalMs) : e.interval
    const stale = Date.now() - e.state.updatedAt > (intervalMs || 30_000)
    if (stale) load(key).then(() => schedule(key))
    else schedule(key)
    return () => {
      e.subscribers--
      if (!e.subscribers) clearTimeout(e.timer)
    }
  }, [key, intervalMs])

  return { ...state, loading: !state.data && !state.error }
}

const EMPTY: State<never> = { updatedAt: 0 }

/** Reload everything on screen now (e.g. the moment a market opens or closes) */
export function refetchAll() {
  for (const [key, e] of entries) if (e.subscribers) load(key)
}

export async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `요청 실패 (${res.status})`)
  return json as T
}
