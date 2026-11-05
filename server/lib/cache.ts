// 인스턴스 메모리 캐시. 같은 키로 동시에 들어온 요청은 하나의 fetch 를 공유
type Entry<T> = { value?: T; expires: number; pending?: Promise<T> }

const store = new Map<string, Entry<unknown>>()

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit?.value !== undefined && hit.expires > now) return hit.value
  if (hit?.pending) return hit.pending

  const pending = load()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs })
      return value
    })
    .catch((err) => {
      // 실패하면 직전 값이라도 돌려줌 (stale-if-error)
      store.delete(key)
      if (hit?.value !== undefined) {
        store.set(key, { value: hit.value, expires: Date.now() + 5_000 })
        return hit.value
      }
      throw err
    })
  store.set(key, { ...hit, expires: hit?.expires ?? 0, pending })
  return pending
}

export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`)
  return (await res.json()) as T
}
