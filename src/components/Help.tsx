// '?' with a hover/focus tooltip (brokerage PC style); used next to labels that need a plain explanation
export function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} aria-label={text} onClick={(e) => e.stopPropagation()}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6" fill="none" stroke="var(--bg-float)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.2" fill="var(--bg-float)" />
      </svg>
      <span className="help__tip" role="tooltip">
        {text}
      </span>
    </span>
  )
}
