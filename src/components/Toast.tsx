import { useEffect, useState } from 'react'

/** Tiny global toast: toast('message') from anywhere, <Toaster /> renders it once */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('bamsai:toast', { detail: message }))
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null)
  useEffect(() => {
    const on = (e: Event) => setMsg({ text: (e as CustomEvent<string>).detail, id: Date.now() })
    window.addEventListener('bamsai:toast', on)
    return () => window.removeEventListener('bamsai:toast', on)
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2400)
    return () => clearTimeout(t)
  }, [msg])
  return msg ? (
    <div className="toast" role="status" key={msg.id}>
      {msg.text}
    </div>
  ) : null
}
