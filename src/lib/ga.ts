// GA4. 측정 ID 가 없으면 아무것도 안 함 (로컬 개발)
// 이벤트 이름은 README 의 가설·검증지표 표와 1:1 로 맞춰둠
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** 지금이 어떤 시간대인지 (KST). 리텐션 분석의 핵심 축: '개장 전 재방문' */
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

// 첫 유입 채널: 커뮤니티 실험(종토방·주갤)에서 링크마다 utm_source 를 다르게 붙임
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
  // 사용자 속성: 어느 커뮤니티 글로 처음 왔는지 → 채널별 리텐션 비교
  window.gtag('set', 'user_properties', firstTouch())
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
  const p = { ...params, kst_window: kstWindow() }
  window.gtag?.('event', name, p)
  if (import.meta.env.DEV) console.debug('[ga]', name, p)
}

export function trackPage(path: string) {
  window.gtag?.('event', 'page_view', { page_path: path, page_location: location.href, kst_window: kstWindow() })
}
