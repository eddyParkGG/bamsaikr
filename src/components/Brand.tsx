// Logo: a plump crescent moon above a cloud (gray, 3D). On hover a light sweep passes once and a yellow zigzag arrow draws in
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <radialGradient id="bm-moon" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fbfbfc" />
          <stop offset="0.5" stopColor="#d3d6db" />
          <stop offset="1" stopColor="#868c96" />
        </radialGradient>
        <radialGradient id="bm-cloud" cx="0.4" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d6d9de" />
          <stop offset="1" stopColor="#8f949d" />
        </radialGradient>
        <mask id="bm-cut">
          <rect width="40" height="40" fill="#fff" />
          <circle cx="31.5" cy="8.5" r="9" fill="#000" />
        </mask>
        <linearGradient id="bm-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF06A" />
          <stop offset="0.5" stopColor="#FFD60A" />
          <stop offset="1" stopColor="#F2A900" />
        </linearGradient>
        <linearGradient id="bm-shine" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Light only within the moon (crescent shape) and the cloud */}
        <mask id="bm-shape">
          <circle cx="24" cy="14" r="12" fill="#fff" mask="url(#bm-cut)" />
          <path d="M6 35a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29 28a3.5 3.5 0 0 1-.8 7z" fill="#fff" />
        </mask>
      </defs>
      {/* Crescent moon */}
      <circle cx="24" cy="14" r="12" fill="url(#bm-moon)" mask="url(#bm-cut)" />
      {/* Cloud (shadow below + body) */}
      <path d="M6.6 36.2a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29.6 29.2a3.5 3.5 0 0 1-.8 7z" fill="#000" opacity="0.22" />
      <path d="M6 35a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29 28a3.5 3.5 0 0 1-.8 7z" fill="url(#bm-cloud)" />
      {/* Hover: light sweep */}
      <g mask="url(#bm-shape)">
        <rect className="brand__shine" x="-30" y="0" width="18" height="40" fill="url(#bm-shine)" transform="skewX(-20)" />
      </g>
      {/* Hover: a classic thick lightning bolt whose top is an arrowhead (rising to the upper right).
          Revealed with a diagonal wipe from the bottom-left */}
      <g className="brand__bolt">
        <path
          d="M6.48 31.14 L23.74 22.92 L20.75 20.58 L29.76 16.77 L33.5 19.7 L32.61 6.95 L19.6 11.25 L23.35 14.17 L15.09 18.57 L18.08 20.91 Z"
          fill="url(#bm-bolt)"
        />
      </g>
    </svg>
  )
}

const LOGOS: Record<string, { bg: string; fg: string; label: string; size: number; weight?: number; italic?: boolean }> = {
  SMSN: { bg: '#1428a0', fg: '#fff', label: 'SAMSUNG', size: 5.2, weight: 800 },
  SKHX: { bg: '#ea002c', fg: '#fff', label: 'SK', size: 11, weight: 800 },
  HYUNDAI: { bg: '#002c5f', fg: '#fff', label: 'H', size: 15, weight: 800, italic: true },
  SKHY: { bg: '#ea002c', fg: '#fff', label: 'ADR', size: 8.5, weight: 800 },
  KR200: { bg: '#3c3c47', fg: '#fff', label: '200', size: 9.5, weight: 700 },
  EWY: { bg: '#0f7b5f', fg: '#fff', label: 'EWY', size: 8.5, weight: 800 },
  KORU: { bg: '#f08c00', fg: '#fff', label: '3x', size: 12, weight: 800 },
}

/** Asset icon: brand-color circle + short wordmark (brokerage list icon style) */
export function StockLogo({ id, size = 30 }: { id: string; size?: number }) {
  const l = LOGOS[id] ?? LOGOS.KR200
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <circle cx="15" cy="15" r="15" fill={l.bg} />
      <text
        x="15"
        y="15.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={l.fg}
        fontSize={l.size}
        fontWeight={l.weight ?? 700}
        fontStyle={l.italic ? 'italic' : 'normal'}
        fontFamily="Pretendard Variable, Pretendard, sans-serif"
        letterSpacing={l.label.length > 4 ? 0.2 : -0.3}
      >
        {l.label}
      </text>
    </svg>
  )
}
