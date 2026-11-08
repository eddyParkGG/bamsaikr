import { Component, type ReactNode } from 'react'

// A page left open across a deploy asks for chunk files the new build no longer has: reload to get the new ones
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|module script|Unable to preload/i
const RELOAD_KEY = 'bamsai-reload-at'

/** Reload the page, at most once every 30 seconds (so a real outage cannot loop). False when it did not reload */
export function reloadForNewBuild() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < 30_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // storage blocked: still reload once
  }
  location.reload()
  return true
}

/**
 * Keeps one failing widget from blanking the whole page. Instead of an error message it keeps a skeleton and
 * tries again (1, 2, 4… up to 10 seconds), the same way data requests wait out a deploy or restart
 */
export class Boundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 }
  private timer: ReturnType<typeof setTimeout> | undefined
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error(err)
    if (STALE_CHUNK.test(String((err as Error)?.message ?? err)) && reloadForNewBuild()) return
    const wait = Math.min(1000 * 2 ** this.state.tries, 10_000)
    this.timer = setTimeout(() => this.setState((s) => ({ failed: false, tries: s.tries + 1 })), wait)
  }
  componentWillUnmount() {
    clearTimeout(this.timer)
  }
  render() {
    if (this.state.failed) return this.props.fallback ?? <div className="skeleton" style={{ height: 360, marginTop: 8 }} aria-busy="true" />
    return this.props.children
  }
}
