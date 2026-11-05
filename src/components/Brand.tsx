// 로고: 구름 위 통통한 초승달(회색 입체). 호버하면 빛이 한 번 훑고 지나가고, 노란 지그재그 화살표가 그려짐
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
        {/* 빛은 달(초승달 모양 그대로)과 구름 안에서만 */}
        <mask id="bm-shape">
          <circle cx="24" cy="14" r="12" fill="#fff" mask="url(#bm-cut)" />
          <path d="M6 35a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29 28a3.5 3.5 0 0 1-.8 7z" fill="#fff" />
        </mask>
      </defs>
      {/* 초승달 */}
      <circle cx="24" cy="14" r="12" fill="url(#bm-moon)" mask="url(#bm-cut)" />
      {/* 구름 (아래 그림자 + 본체) */}
      <path d="M6.6 36.2a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29.6 29.2a3.5 3.5 0 0 1-.8 7z" fill="#000" opacity="0.22" />
      <path d="M6 35a5.5 5.5 0 0 1 .5-11 7.5 7.5 0 0 1 14.2-2A6 6 0 0 1 29 28a3.5 3.5 0 0 1-.8 7z" fill="url(#bm-cloud)" />
      {/* 호버: 빛 */}
      <g mask="url(#bm-shape)">
        <rect className="brand__shine" x="-30" y="0" width="18" height="40" fill="url(#bm-shine)" transform="skewX(-20)" />
      </g>
      {/* 호버: 노란 화살표. 왼쪽 아래에서 시작해 오른쪽 위로 그려지고, 끝에 화살촉 */}
      <path className="brand__bolt" pathLength={100} d="M4 31 L14.5 22.5 L20 27.5 L34.5 11" fill="none" stroke="#FFEB00" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path className="brand__head" d="M27 9.5 L36.5 8.5 L35.5 18 Z" fill="#FFEB00" stroke="#FFEB00" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

const LOGOS: Record<string, { bg: string; fg: string; label: string; size: number; weight?: number; italic?: boolean }> = {
  SMSN: { bg: '#1428a0', fg: '#fff', label: 'SAMSUNG', size: 5.2, weight: 800 },
  SKHX: { bg: '#ea002c', fg: '#fff', label: 'SK', size: 11, weight: 800 },
  HYUNDAI: { bg: '#002c5f', fg: '#fff', label: 'H', size: 15, weight: 800, italic: true },
  KR200: { bg: '#3c3c47', fg: '#fff', label: '200', size: 9.5, weight: 700 },
}

/** 종목 아이콘: 브랜드 색 원 + 짧은 워드마크 (토스증권 목록 아이콘 형태) */
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
