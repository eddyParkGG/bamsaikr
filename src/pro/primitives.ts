// lightweight-charts 시리즈 프리미티브: 장 시간대 배경, 뉴스 말풍선 핀
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface Span {
  from: number // 차트 시간(초)
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
  time: number // 차트 시간(초), 실제 봉 시각에 맞춰 둔 값
  price: number // 그 봉의 고가 → 말풍선이 봉 바로 위에 붙음 (차트를 위아래로 움직이면 같이 움직임)
  id: string
}

export class NewsPins extends Base {
  private pins: Pin[] = []
  private hover: string | null = null
  private fill = '#FFEB00'
  private ink = '#060B11'
  /** 화면 좌표 (클릭/호버 판정용) */
  hitboxes: { id: string; x: number; y: number }[] = []

  set(pins: Pin[], colors: { fill: string; ink: string }) {
    this.pins = pins
    this.fill = colors.fill
    this.ink = colors.ink
    this.request?.()
  }

  setHover(id: string | null) {
    if (id === this.hover) return
    this.hover = id
    this.request?.()
  }

  /** Bubble under the pointer, with its top-centre position (for placing the tooltip) */
  hitBox(x: number, y: number): { id: string; x: number; y: number } | null {
    for (const h of this.hitboxes) if (Math.abs(h.x - x) <= 12 && y >= h.y - 2 && y <= h.y + 22) return h
    return null
  }

  paneViews() {
    const self = this
    const renderer: IPrimitivePaneRenderer = {
      draw(target: CanvasRenderingTarget2D) {
        const chart = self.chart
        self.hitboxes = []
        if (!chart || !self.pins.length) return
        const ts = chart.timeScale()
        const series = self.series
        if (!series) return
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          for (const p of self.pins) {
            const x = ts.timeToCoordinate(p.time as UTCTimestamp)
            const barY = series.priceToCoordinate(p.price)
            if (x == null || barY == null || x < 0 || x > mediaSize.width) continue
            const active = self.hover === p.id
            const w = active ? 24 : 20
            const h = active ? 18 : 16
            // 봉 고가 위 8px 에 말풍선, 꼬리는 봉을 가리킴
            const bottom = Math.max(h + 6, barY - 8)
            const top = bottom - h - 4
            self.hitboxes.push({ id: p.id, x, y: top })
            ctx.fillStyle = self.fill
            ctx.beginPath()
            ctx.roundRect(x - w / 2, top, w, h, 5)
            ctx.moveTo(x - 3, top + h - 0.5)
            ctx.lineTo(x, top + h + 4)
            ctx.lineTo(x + 3, top + h - 0.5)
            ctx.fill()
            ctx.fillStyle = self.ink
            const gx = x - 5
            const cy = top + h / 2
            ctx.fillRect(gx, cy - 4, 10, 1.6)
            ctx.fillRect(gx, cy - 0.8, 10, 1.6)
            ctx.fillRect(gx, cy + 2.4, 6, 1.6)
          }
        })
      },
    }
    return [{ zOrder: () => 'top' as const, renderer: () => renderer }]
  }
}
