import { useSyncExternalStore } from 'react'

/** Same breakpoint as the `max-width: 720px` blocks in the CSS */
export const PHONE_QUERY = '(max-width: 720px)'

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True on phone-sized screens; re-renders when the window crosses the breakpoint */
export function usePhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}
