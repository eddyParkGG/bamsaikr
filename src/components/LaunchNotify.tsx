import { useEffect, useRef, useState } from 'react'
import { track } from '../lib/ga'

/** Orders are not live yet: any order button opens this "coming soon" sheet with an email sign-up */
export function openLaunchNotify(what: string) {
  window.dispatchEvent(new CustomEvent('bamsai:launch', { detail: what }))
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Apps Script web app that appends sign-ups to the owner's Google Sheet (docs/launch-notify). Emails never go to GA */
const NOTIFY_URL = import.meta.env.VITE_NOTIFY_URL as string | undefined

function saveSignup(email: string, what: string) {
  if (!NOTIFY_URL) return
  // text/plain + no-cors: a "simple" request, so no CORS preflight that Apps Script cannot answer
  fetch(NOTIFY_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ email, what, page: location.pathname }) }).catch(() => {})
}

export function LaunchNotify() {
  const [what, setWhat] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [touched, setTouched] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const on = (e: Event) => {
      setWhat((e as CustomEvent<string>).detail)
      setDone(false)
      setTouched(false)
    }
    window.addEventListener('bamsai:launch', on)
    return () => window.removeEventListener('bamsai:launch', on)
  }, [])
  useEffect(() => {
    if (!what) return
    requestAnimationFrame(() => input.current?.focus())
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setWhat(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [what])

  if (!what) return null
  const valid = EMAIL.test(email.trim())
  const close = () => setWhat(null)
  return (
    <div className="overlay" onClick={close} role="dialog" aria-modal="true" aria-label="주문 출시 알림">
      <div className="sheet launch" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div className="launch__icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </div>
            <h3>알림 신청을 마쳤어요</h3>
            <p>주문이 열리면 {email.trim()}으로 가장 먼저 알려드릴게요.</p>
            <button className="btn btn--lg btn--key btn--block" onClick={close}>
              확인
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setTouched(true)
              if (!valid) return
              saveSignup(email.trim(), what)
              track('launch_notify_signup', { what })
              setDone(true)
            }}
          >
            <span className="badge badge--key">출시 예정</span>
            <h3>주문은 곧 열려요</h3>
            <p>
              {what} 주문을 준비하고 있어요.
              <br />
              열리면 바로 알려드릴까요?
            </p>
            <label className={`field launch__field ${touched && !valid ? 'field--error' : ''}`}>
              <input
                ref={input}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일 주소"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={touched && !valid}
              />
            </label>
            {touched && !valid && <p className="launch__error">이메일 주소를 다시 확인해 주세요</p>}
            <p className="launch__note">주문 출시 알림에만 쓰고, 알림을 보낸 뒤 지워요.</p>
            <div className="row" style={{ marginTop: 20, gap: 8 }}>
              <button type="button" className="btn btn--lg btn--fill" style={{ flex: 1 }} onClick={close}>
                닫기
              </button>
              <button type="submit" className="btn btn--lg btn--key" style={{ flex: 1.6 }}>
                알림 받기
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
