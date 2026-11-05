// Logo: a plump crescent moon above a cloud (gray, 3D). On hover a light sweep passes once and a yellow zigzag arrow draws in
export function BrandMark({ size = 30, loop = false }: { size?: number; loop?: boolean }) {
  return (
    <svg className={loop ? 'brand brand--loop' : 'brand'} width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <radialGradient id="bm-moon" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fbfbfc" />
          <stop offset="0.5" stopColor="#d3d6db" />
          <stop offset="1" stopColor="#a6abb3" />
        </radialGradient>
        <radialGradient id="bm-cloud" cx="0.4" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d6d9de" />
          <stop offset="1" stopColor="#b1b5bc" />
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
      {/* Cloud */}
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

/** Full-screen loading state: the logo's hover motion on repeat, centred. Same markup as the splash in index.html */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="불러오는 중">
      <BrandMark size={44} loop />
    </div>
  )
}

// Stock icons: the same images the brokerage app uses for listed products (US-listed ones get a flag badge).
// KOSPI 200 has no listed product image, so it keeps a drawn badge.
const CDN = 'https://static.toss.im'
const IMAGES: Record<string, { src: string; us?: boolean }> = {
  SMSN: { src: `${CDN}/png-icons/securities/icn-sec-fill-005930.png` },
  SKHX: { src: `${CDN}/png-icons/securities/icn-sec-fill-000660.png` },
  HYUNDAI: { src: `${CDN}/png-icons/securities/icn-sec-fill-005380.png` },
  SKHY: { src: `${CDN}/logos/securities/icn-sec-fill-SKHYV.png`, us: true },
  EWY: { src: `${CDN}/png-icons/securities/icn-sec-fill-EWY.png`, us: true },
  KORU: { src: `${CDN}/png-icons/securities/icn-sec-fill-KORU.png`, us: true },
}
const US_FLAG = `${CDN}/icons/png/3x/icon-flag-usd.png`

/** Asset icon: listed-product image, or a drawn badge for Hyperliquid-only products */
export function StockLogo({ id, size = 30 }: { id: string; size?: number }) {
  const img = IMAGES[id]
  if (img)
    return (
      <span className="logo-mark logo-img" style={{ width: size, height: size }} aria-hidden>
        <img src={img.src} alt="" width={size} height={size} loading="lazy" decoding="async" />
        {img.us && <img className="logo-img__flag" src={US_FLAG} alt="" width={Math.round(size * 0.42)} height={Math.round(size * 0.42)} />}
      </span>
    )
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <circle cx="15" cy="15" r="15" fill="#3c3c47" />
      <text
        x="15"
        y="15.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={9.5}
        fontWeight={700}
        fontFamily="Pretendard Variable, Pretendard, sans-serif"
        letterSpacing={-0.3}
      >
        200
      </text>
    </svg>
  )
}
