// GA4. No-op without a measurement ID (local dev)
// Event names map 1:1 to the hypothesis/metric tables in docs/experiments (see ga-events.md)
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** Current market period (KST). Key axis for retention analysis: 'return visit before open' */
export function kstWindow(now = Date.now()) {
  const d = new Date(now + 9 * 3600_000)
  const dow = d.getUTCDay()
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (dow === 0 || dow === 6) return 'weekend'
  if (m >= 480 && m < 540) return 'preopen' // 08:00~09:00
  if (m >= 540 && m < 930) return 'regular'
  if (m >= 930 && m < 1200) return 'after'
  return 'night'
}

// First acquisition channel: community experiments use a distinct utm_source per link
function firstTouch() {
  try {
    const q = new URLSearchParams(location.search)
    const src = q.get('utm_source')
    const content = q.get('utm_content')
    if (src && !localStorage.getItem('bamsai-first-src')) {
      localStorage.setItem('bamsai-first-src', src)
      localStorage.setItem('bamsai-first-content', content ?? '')
      localStorage.setItem('bamsai-first-at', String(Date.now()))
    }
    return {
      first_source: localStorage.getItem('bamsai-first-src') ?? '(direct)',
      first_content: localStorage.getItem('bamsai-first-content') ?? '',
    }
  } catch {
    return { first_source: '(unknown)', first_content: '' }
  }
}

export function initGa() {
  if (!GA_ID || window.gtag) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, { send_page_view: false })
  // User property: which community post they first came from → compare retention by channel
  window.gtag('set', 'user_properties', firstTouch())
}

export type GaEvent =
  | 'asset_switch' // asset, query
  | 'prediction_view' // asset, session, hours_to_open
  | 'prediction_detail_open'
  | 'model_explain_open' // opened the forecast detail or the prediction record (trust hypothesis)
  | 'arb_view'
  | 'chart_market_toggle' // market, on
  | 'chart_indicator_toggle'
  | 'chart_interval_change'
  | 'news_open' // asset, date, kind
  | 'convergence_view'
  | 'order_submit' // order intent: orders are not live yet, a launch sign-up sheet opens
  | 'launch_notify_signup' // email left for the order launch (not stored)
  | 'api_docs_view'
  | 'mcp_copy'

export function track(name: GaEvent, params: Record<string, string | number | boolean | undefined> = {}) {
  const p = { ...params, kst_window: kstWindow() }
  window.gtag?.('event', name, p)
  if (import.meta.env.DEV) console.debug('[ga]', name, p)
}

export function trackPage(path: string) {
  window.gtag?.('event', 'page_view', { page_path: path, page_location: location.href, kst_window: kstWindow() })
}
