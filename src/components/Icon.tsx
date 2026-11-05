// Shared line icons, so the same arrow looks the same everywhere
const CHEVRON = { down: 'M6 9l6 6 6-6', right: 'M10 7l5 5-5 5', left: 'M15 5l-7 7 7 7', up: 'M6 15l6-6 6 6' } as const

export function Chevron({ dir = 'down', size = 16, className }: { dir?: keyof typeof CHEVRON; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={CHEVRON[dir]} />
    </svg>
  )
}
