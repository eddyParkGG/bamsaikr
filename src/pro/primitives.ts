// lightweight-charts series primitives: session background bands, news bubble pins
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface Span {
  from: number // chart time (seconds)
  to: number
  kind: 'regular' | 'nxt' | 'closed'
}

abstract class Base implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null
  protected request: (() => void) | null = null
  protected series: ISeriesApi<SeriesType> | null = null
  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi
    this.series = p.series as ISeriesApi<SeriesType>
    this.request = p.requestUpdate
  }
  detached() {
    this.chart = null
    this.series = null
    this.request = null
  }
  abstract paneViews(): readonly IPrimitivePaneView[]
}

export class SessionBands extends Base {
  private spans: Span[] = []
  private colors: Record<Span['kind'], string> = { regular: '', nxt: '', closed: '' }
  private visible = true

  set(spans: Span[], colors: Record<Span['kind'], string>, visible: boolean) {
    this.spans = spans
    this.colors = colors
    this.visible = visible
    this.request?.()
  }

  paneViews() {
    const self = this
    const renderer: IPrimitivePaneRenderer = {
      draw() {},
      drawBackground(target: CanvasRenderingTarget2D) {
        const chart = self.chart
        if (!chart || !self.visible || !self.spans.length) return
        const ts = chart.timeScale()
        const half = ts.options().barSpacing / 2
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          for (const s of self.spans) {
            const color = self.colors[s.kind]
            if (!color) continue
            const x1 = ts.timeToCoordinate(s.from as UTCTimestamp)
            const x2 = ts.timeToCoordinate(s.to as UTCTimestamp)
            if (x1 == null || x2 == null) continue
            const left = x1 - half
            const right = x2 + half
            if (right < 0 || left > mediaSize.width) continue
            ctx.fillStyle = color
            ctx.fillRect(left, 0, right - left, mediaSize.height)
          }
        })
      },
    }
    return [{ zOrder: () => 'bottom' as const, renderer: () => renderer }]
  }
}

export interface Pin {
  time: number // chart time (seconds), snapped to an actual bar time
  price: number // that bar's high → bubble sits right above the bar (moves with the chart vertically)
  id: string
}

/** A drawn bubble: one news item, or several that would overlap at the current zoom */
export interface PinCluster {
  ids: string[]
  times: number[]
  x: number // bubble centre
  y: number // bubble top
}

const CLUSTER_PX = 24

export class NewsPins extends Base {
  private pins: Pin[] = []
  private hover: string | null = null
  private fill = '#FFEB00'
  private ink = '#060B11'
  /** Clusters as drawn in the last frame (screen coordinates), for hover and click */
  clusters: PinCluster[] = []

  set(pins: Pin[], colors: { fill: string; ink: string }) {
    this.pins = pins
    this.fill = colors.fill
    this.ink = colors.ink
    this.request?.()
  }

  setHover(key: string | null) {
    if (key === this.hover) return
    this.hover = key
    this.request?.()
  }

  /** Cluster under the pointer */
  hitBox(x: number, y: number): PinCluster | null {
    for (const c of this.clusters) if (Math.abs(c.x - x) <= 13 && y >= c.y - 2 && y <= c.y + 24) return c
    return null
  }

  paneViews() {
    const self = this
    const renderer: IPrimitivePaneRenderer = {
      draw(target: CanvasRenderingTarget2D) {
        const chart = self.chart
        const series = self.series
        self.clusters = []
        if (!chart || !series || !self.pins.length) return
        const ts = chart.timeScale()
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          // Project, then group bubbles that would overlap at this zoom level (zooming in splits them)
          const pts: { p: Pin; x: number; y: number }[] = []
          for (const p of self.pins) {
            const x = ts.timeToCoordinate(p.time as UTCTimestamp)
            const y = series.priceToCoordinate(p.price)
            if (x != null && y != null && x >= -20 && x <= mediaSize.width + 20) pts.push({ p, x, y })
          }
          pts.sort((a, b) => a.x - b.x)
          const groups: (typeof pts)[] = []
          for (const q of pts) {
            const g = groups[groups.length - 1]
            if (g && q.x - g[0].x < CLUSTER_PX) g.push(q)
            else groups.push([q])
          }
          for (const g of groups) {
            const x = g.reduce((s, q) => s + q.x, 0) / g.length
            const barY = Math.min(...g.map((q) => q.y))
            const ids = g.map((q) => q.p.id)
            const key = ids.join('|')
            const active = self.hover === key
            const w = active ? 24 : 20
            const h = active ? 18 : 16
            const bottom = Math.max(h + 6, barY - 8)
            const top = bottom - h - 4
            self.clusters.push({ ids, times: g.map((q) => q.p.time), x, y: top })
            ctx.fillStyle = self.fill
            ctx.beginPath()
            if (g.length === 1) {
              // Single item: speech bubble with a newspaper glyph, tail pointing at the bar
              // Body and tail are filled separately: in one path their opposite windings cancel
              // where they overlap and leave a hairline gap
              ctx.roundRect(x - w / 2, top, w, h, 5)
              ctx.fill()
              ctx.beginPath()
              ctx.moveTo(x - 3.5, top + h - 3)
              ctx.lineTo(x, top + h + 4)
              ctx.lineTo(x + 3.5, top + h - 3)
              ctx.closePath()
              ctx.fill()
              ctx.fillStyle = self.ink
              const gx = x - 5
              const cy = top + h / 2
              ctx.fillRect(gx, cy - 4, 10, 1.6)
              ctx.fillRect(gx, cy - 0.8, 10, 1.6)
              ctx.fillRect(gx, cy + 2.4, 6, 1.6)
            } else {
              // Several items: round badge with the count
              const r = active ? 11 : 10
              const cy = top + h / 2
              ctx.arc(x, cy, r, 0, Math.PI * 2)
              ctx.fill()
              ctx.beginPath()
              ctx.moveTo(x - 3.5, cy + r - 3)
              ctx.lineTo(x, cy + r + 4)
              ctx.lineTo(x + 3.5, cy + r - 3)
              ctx.closePath()
              ctx.fill()
              ctx.fillStyle = self.ink
              ctx.font = `700 ${g.length > 9 ? 10 : 11}px Pretendard Variable, Pretendard, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(String(g.length), x, cy + 0.5)
            }
          }
        })
      },
    }
    return [{ zOrder: () => 'top' as const, renderer: () => renderer }]
  }
}
