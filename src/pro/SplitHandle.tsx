import { useRef, useState } from 'react'

const MIN = 300
const MAX = 640
const KEY = 'bamsai-side-w'

export function readSideWidth() {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v >= MIN && v <= MAX ? v : 340
  } catch {
    return 340
  }
}

/**
 * Drag handle between the chart and the right column (like a brokerage PC panel grid):
 * invisible until hovered, then a 4px key-color bar fading out at both ends
 */
export function SplitHandle({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="차트와 오른쪽 패널 너비 조절"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width}
      tabIndex={0}
      className={`split ${dragging ? 'split--drag' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: width }
        setDragging(true)
        document.body.classList.add('is-resizing')
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        onChange(Math.round(Math.min(MAX, Math.max(MIN, start.current.w - (e.clientX - start.current.x)))))
      }}
      onPointerUp={() => {
        start.current = null
        setDragging(false)
        document.body.classList.remove('is-resizing')
        try {
          localStorage.setItem(KEY, String(width))
        } catch {
          /* private mode */
        }
      }}
      onDoubleClick={() => onChange(340)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(Math.min(MAX, width + 16))
        if (e.key === 'ArrowRight') onChange(Math.max(MIN, width - 16))
      }}
    >
      <div className="split__bar">
        <i />
      </div>
    </div>
  )
}
