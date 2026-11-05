// lightweight-charts 시리즈 프리미티브: 장 시간대 배경, 뉴스 말풍선 핀
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time, UTCTimestamp } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface Span {
  from: number // 차트 시간(초)
  to: number
  kind: 'regular' | 'nxt' | 'closed'
}

abstract class Base implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null
  protected request: (() => void) | null = null
  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi
    this.request = p.requestUpdate
  }
  detached() {
    this.chart = null
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
  id: string
}

export class NewsPins extends Base {
  private pins: Pin[] = []
  private hover: string | null = null
  private fill = '#FFEB00'
  private ink = '#060B11'
  private line = 'rgba(6,11,17,0.25)'
  /** 화면 좌표 (클릭/호버 판정용) */
  hitboxes: { id: string; x: number; y: number }[] = []

  set(pins: Pin[], colors: { fill: string; ink: string; line: string }) {
    this.pins = pins
    this.fill = colors.fill
    this.ink = colors.ink
    this.line = colors.line
    this.request?.()
  }

  setHover(id: string | null) {
    if (id === this.hover) return
    this.hover = id
    this.request?.()
  }

  hit(x: number, y: number): string | null {
    for (const h of this.hitboxes) if (Math.abs(h.x - x) <= 12 && y >= h.y - 2 && y <= h.y + 24) return h.id
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
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          for (const p of self.pins) {
            const x = ts.timeToCoordinate(p.time as UTCTimestamp)
            if (x == null || x < 0 || x > mediaSize.width) continue
            const y = mediaSize.height - 26
            self.hitboxes.push({ id: p.id, x, y })
            const active = self.hover === p.id
            // 점선 가이드
            ctx.save()
            ctx.strokeStyle = self.line
            ctx.setLineDash([2, 4])
            ctx.beginPath()
            ctx.moveTo(Math.round(x) + 0.5, 0)
            ctx.lineTo(Math.round(x) + 0.5, y)
            ctx.stroke()
            ctx.restore()
            // 말풍선 (꼬리가 아래를 향함)
            const w = active ? 24 : 20
            const h = active ? 18 : 16
            const left = x - w / 2
            ctx.fillStyle = self.fill
            ctx.beginPath()
            // 꼬리가 위(해당 봉)를 가리킴
            ctx.roundRect(left, y + 4, w, h, 5)
            ctx.moveTo(x - 3, y + 4.5)
            ctx.lineTo(x, y)
            ctx.lineTo(x + 3, y + 4.5)
            ctx.fill()
            // 신문 아이콘: 가로줄 세 개
            ctx.fillStyle = self.ink
            const gx = x - 5
            const cy = y + 4 + h / 2
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
