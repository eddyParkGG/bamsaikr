import { useRef, useState } from 'react'

const MIN = 260
const MAX = 640
const DEFAULT = 340

/** Saved width of a column (order book, order form), else 340px */
export function readWidth(key: string) {
  try {
    const v = Number(localStorage.getItem(key))
    if (v >= MIN && v <= MAX) return v
  } catch {
    /* private mode */
  }
  return DEFAULT
}

/**
 * Drag handle on the left edge of a column (like a brokerage PC panel grid): dragging left widens the column,
 * the chart gives up the space. Invisible until hovered, then a 4px key-color bar fading out at both ends
 */
export function SplitHandle({ width, onChange, storageKey, label }: { width: number; onChange: (w: number) => void; storageKey: string; label: string }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)
  const save = (w: number) => {
    try {
      localStorage.setItem(storageKey, String(w))
    } catch {
      /* private mode */
    }
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
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
        save(width)
      }}
      onDoubleClick={() => {
        onChange(DEFAULT)
        save(DEFAULT)
      }}
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
