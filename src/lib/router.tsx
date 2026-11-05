import { useSyncExternalStore } from 'react'
import { trackPage } from './ga'

const listeners = new Set<() => void>()
window.addEventListener('popstate', () => listeners.forEach((l) => l()))

export function navigate(to: string) {
  if (to === location.pathname + location.search) return
  history.pushState(null, '', to)
  window.scrollTo(0, 0)
  listeners.forEach((l) => l())
  trackPage(to)
}

export function usePath() {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => location.pathname,
  )
}

export function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { href, onClick, ...rest } = props
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        navigate(href)
      }}
      {...rest}
    />
  )
}
