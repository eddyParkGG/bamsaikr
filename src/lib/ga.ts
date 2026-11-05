// GA4. 측정 ID 가 없으면 아무것도 안 함 (로컬 개발)
// 이벤트 이름은 README 의 가설·검증지표 표와 1:1 로 맞춰둠
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
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
}

export type GaEvent =
  | 'mode_switch' // mode: easy|pro
  | 'prediction_view' // asset, session, hours_to_open
  | 'prediction_detail_open'
  | 'model_explain_open' // 적중 이력·계산 방법 펼침 (신뢰 가설)
  | 'arb_view'
  | 'arb_calc_change'
  | 'chart_market_toggle' // market, on
  | 'chart_indicator_toggle'
  | 'chart_interval_change'
  | 'news_open' // asset, date, kind
  | 'convergence_view'
  | 'order_preview' // market, side, asset
  | 'order_submit'
  | 'wallet_connect'
  | 'api_docs_view'
  | 'mcp_copy'
  | 'share_click'

export function track(name: GaEvent, params: Record<string, string | number | boolean | undefined> = {}) {
  window.gtag?.('event', name, params)
  if (import.meta.env.DEV) console.debug('[ga]', name, params)
}

export function trackPage(path: string) {
  window.gtag?.('event', 'page_view', { page_path: path, page_location: location.href })
}
