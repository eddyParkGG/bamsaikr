import { track } from '../lib/ga'
import { usePrefs } from '../lib/prefs'
import { Link, usePath } from '../lib/router'
import { BrandMark } from './Brand'

export function Header() {
  const { mode, setMode, theme, setTheme } = usePrefs()
  const path = usePath()
  const onMarket = path === '/' || path.startsWith('/s/')
  return (
    <header className="header">
      <div className="header__inner">
        <Link href="/" className="logo" aria-label="밤사이 홈">
          <BrandMark />
          밤사이
        </Link>
        <nav className="nav">
          <Link href="/" aria-current={onMarket ? 'page' : undefined}>
            시세
          </Link>
          <Link href="/developers" aria-current={path === '/developers' ? 'page' : undefined} onClick={() => track('api_docs_view')}>
            API
          </Link>
        </nav>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="화면 모드" style={{ width: 168 }}>
          <button
            aria-pressed={mode === 'easy'}
            onClick={() => {
              setMode('easy')
              track('mode_switch', { mode: 'easy' })
            }}
          >
            쉬운 모드
          </button>
          <button
            aria-pressed={mode === 'pro'}
            onClick={() => {
              setMode('pro')
              track('mode_switch', { mode: 'pro' })
            }}
          >
            프로 모드
          </button>
        </div>
        <button className="icon-btn" aria-label={theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 1 3h-2zm0 20-1-3h2zM2 12l3-1v2zm20 0-3 1v-2zM4.9 4.9l2.8 1.4-1.4 1.4zm14.2 14.2-2.8-1.4 1.4-1.4zM4.9 19.1l1.4-2.8 1.4 1.4zM19.1 4.9l-1.4 2.8-1.4-1.4z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
