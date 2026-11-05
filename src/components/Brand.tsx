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
      {/* Hover: a chunky, angular bolt that doubles as a rising arrow. Revealed from the bottom-left */}
      <g className="brand__bolt">
        <path
          d="M2.6 33.2 L13.6 19.6 L18.4 24.6 L26.2 14.9 L22.4 12.1 L37.4 5.6 L34.6 21.6 L30.9 18.5 L19.6 32.6 L14.4 27.4 L6.4 37.2 Z"
          fill="#FFEB00"
          stroke="#060B11"
          strokeWidth="1.1"
          strokeLinejoin="miter"
        />
        {/* Inner bevel: darker lower faces give the bolt some depth */}
        <path d="M14.4 27.4 L19.6 32.6 L30.9 18.5 L34.6 21.6 L33.6 27.4 L30.4 24.4 L19.8 35.9 Z" fill="#D9B800" opacity="0.55" />
      </g>
    </svg>
  )
}

const LOGOS: Record<string, { bg: string; fg: string; label: string; size: number; weight?: number; italic?: boolean }> = {
  SMSN: { bg: '#1428a0', fg: '#fff', label: 'SAMSUNG', size: 5.2, weight: 800 },
  SKHX: { bg: '#ea002c', fg: '#fff', label: 'SK', size: 11, weight: 800 },
  HYUNDAI: { bg: '#002c5f', fg: '#fff', label: 'H', size: 15, weight: 800, italic: true },
  KR200: { bg: '#3c3c47', fg: '#fff', label: '200', size: 9.5, weight: 700 },
}

/** Asset icon: brand-color circle + short wordmark (Toss Securities list icon style) */
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
