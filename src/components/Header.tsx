import { track } from '../lib/ga'
import { usePrefs } from '../lib/prefs'
import { Link, usePath } from '../lib/router'

export function Header() {
  const { mode, setMode, theme, setTheme } = usePrefs()
  const path = usePath()
  return (
    <header className="header">
      <div className="header__inner">
        <Link href="/" className="logo" aria-label="밤사이 홈">
          <span className="logo__mark">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M10.5 1.5a7 7 0 1 0 4 11.3A5.6 5.6 0 0 1 10.5 1.5z" fill="#060B11" />
            </svg>
          </span>
          밤사이
        </Link>
        <nav className="nav">
          <Link href="/" aria-current={path === '/' || path.startsWith('/s/') ? 'page' : undefined}>
            시세
          </Link>
          <Link href="/developers" aria-current={path === '/developers' ? 'page' : undefined} onClick={() => track('api_docs_view')}>
            API
          </Link>
        </nav>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="화면 모드">
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
        <button className="icon-btn" aria-label={theme === 'dark' ? '밝은 화면' : '어두운 화면'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
