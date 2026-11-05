// Imperative wrapper around a lightweight-charts instance.
// The chart is created once per (asset, interval, theme). Toggling markets or indicators only
// adds/removes/hides series, so the user's scroll/zoom position never resets and nothing flickers.
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import { bollinger, ichimoku, macd, RIBBON, rsi, sma, vwap, type Bar, type Pt } from './indicators'
import { NewsPins, SessionBands, type Span } from './primitives'
import type { ChartSettings } from './settings'

const KST = 9 * 3600
/** The chart renders UTC, so shift by +9h to display KST wall-clock time */
export const ct = (ms: number) => (Math.floor(ms / 1000) + KST) as UTCTimestamp
export const STEP_MS: Record<ChartInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3600_000, '1d': 86400_000 }

export function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const toLine = (pts: Pt[]) => pts.map((p) => ({ time: ct(p.t), value: p.v }))
const toCandles = (bars: Bar[]) => bars.map((k) => ({ time: ct(k.t), open: k.o, high: k.h, low: k.l, close: k.c }))

export const MA_COLORS: [number, string][] = [
  [5, '#f5a623'],
  [20, '#f04251'],
  [60, '#00b37e'],
  [120, '#8b95a1'],
]

export interface Lookup {
  krx: Map<number, Bar>
  perp: Map<number, Bar & { usd: number }>
  prem: Map<number, { v: number; live: boolean }>
}

interface Input {
  data: ChartSeries
  spans: Span[]
  news: NewsMarker[]
  events: OpenEvent[]
  prediction: Prediction | null
}

type AnySeries = ISeriesApi<SeriesType>

interface Spec {
  key: string
  pane: 'main' | 'volume' | 'premium' | 'funding' | 'rsi' | 'macd'
  create: (chart: IChartApi, pane: number) => AnySeries
  feed: (d: ChartSeries, base: Bar[]) => unknown[]
}

const SUB_PANES = ['volume', 'premium', 'funding', 'rsi', 'macd'] as const

export class ChartController {
  readonly chart: IChartApi
  readonly bands = new SessionBands()
  readonly pins = new NewsPins()
  lookup: Lookup = { krx: new Map(), perp: new Map(), prem: new Map() }
  private series = new Map<string, AnySeries>()
  private settings: ChartSettings
  private input: Input | null = null
  private host: AnySeries | null = null
  private markers: ISeriesMarkersPluginApi<Time> | null = null
  private priceLines: IPriceLine[] = []
  private c: Record<string, string>

  constructor(
    el: HTMLElement,
    private interval: ChartInterval,
    settings: ChartSettings,
  ) {
    this.settings = settings
    this.c = { text3: css('--text-3'), text2: css('--text-2'), text: css('--text'), line: css('--line'), up: css('--up'), down: css('--down'), perp: css('--perp'), float: css('--bg-float'), bg: css('--bg'), fill: css('--fill-strong') }
    const c = this.c
    this.chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: c.text3,
        fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: c.line, separatorHoverColor: c.fill, enableResize: true },
      },
      grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.text3, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.float },
        horzLine: { color: c.text3, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.float },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.12 }, textColor: c.text2 },
      timeScale: { borderVisible: false, timeVisible: interval !== '1d', secondsVisible: false, rightOffset: 6, minBarSpacing: 1 },
      localization: { locale: 'ko-KR', priceFormatter: (p: number) => Math.round(p).toLocaleString('ko-KR') },
    })
    this.sync(settings)
  }

  destroy() {
    this.chart.remove()
  }

  // ───────── series specs ─────────

  private specs(s: ChartSettings): Spec[] {
    const c = this.c
    const interval = this.interval
    const candle = { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false, priceLineVisible: true, priceLineStyle: LineStyle.Dotted, lastValueVisible: true }
    const overlay = (key: string, color: string, feed: Spec['feed'], width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid): Spec => ({
      key,
      pane: 'main',
      create: (ch, p) => ch.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, p),
      feed,
    })
    const out: Spec[] = []

    // Main price: KRX candles; perp is a line on top, or candles when KRX is hidden
    if (s.showKrx) out.push({ key: 'krx', pane: 'main', create: (ch) => ch.addSeries(CandlestickSeries, { ...candle, title: 'KRX' }, 0), feed: (d) => toCandles(d.krx) })
    if (s.showPerp && s.showKrx)
      out.push({
        key: 'perpLine',
        pane: 'main',
        create: (ch) => ch.addSeries(LineSeries, { color: c.perp, lineWidth: 2, title: 'perp', priceLineVisible: true, priceLineStyle: LineStyle.Dotted, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: c.bg }, 0),
        feed: (d) => d.perpKrw.map((k) => ({ time: ct(k.t), value: k.c })),
      })
    if (s.showPerp && !s.showKrx) out.push({ key: 'perpCandle', pane: 'main', create: (ch) => ch.addSeries(CandlestickSeries, { ...candle, title: 'perp' }, 0), feed: (d) => toCandles(d.perpKrw) })

    if (s.ma) for (const [n, color] of MA_COLORS) out.push(overlay(`ma${n}`, color, (_, b) => toLine(sma(b, n))))
    if (s.ribbon) RIBBON.forEach((n, i) => out.push(overlay(`rb${n}`, `hsla(${200 + i * 9}, 70%, 50%, 0.55)`, (_, b) => toLine(sma(b, n)))))
    if (s.bb) {
      out.push(overlay('bbU', '#8b95a1', (_, b) => toLine(bollinger(b).upper), 1, LineStyle.Dashed))
      out.push(overlay('bbM', '#8b95a1', (_, b) => toLine(bollinger(b).mid)))
      out.push(overlay('bbL', '#8b95a1', (_, b) => toLine(bollinger(b).lower), 1, LineStyle.Dashed))
    }
    if (s.ichimoku) {
      const ich = (b: Bar[]) => ichimoku(b, STEP_MS[interval])
      out.push(overlay('tenkan', '#ff6a6a', (_, b) => toLine(ich(b).tenkan)))
      out.push(overlay('kijun', '#3da8ff', (_, b) => toLine(ich(b).kijun)))
      out.push(overlay('spanA', 'rgba(0,168,107,0.8)', (_, b) => toLine(ich(b).spanA)))
      out.push(overlay('spanB', 'rgba(255,60,60,0.6)', (_, b) => toLine(ich(b).spanB)))
      out.push(overlay('chikou', 'rgba(139,149,161,0.7)', (_, b) => toLine(ich(b).chikou), 1, LineStyle.Dotted))
    }
    if (s.vwap && interval !== '1d') out.push(overlay('vwap', '#f5a623', (_, b) => toLine(vwap(b)), 2, LineStyle.Dashed))

    if (s.volume) {
      if (s.showKrx)
        out.push({
          key: 'volKrx',
          pane: 'volume',
          create: (ch, p) => {
            const se = ch.addSeries(HistogramSeries, { priceScaleId: 'vk', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, title: 'KRX' }, p)
            se.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, visible: false })
            return se
          },
          feed: (d) => d.krx.map((k) => ({ time: ct(k.t), value: k.v, color: (k.c >= k.o ? c.up : c.down) + '80' })),
        })
      if (s.showPerp)
        out.push({
          key: 'volPerp',
          pane: 'volume',
          create: (ch, p) => {
            const se = ch.addSeries(HistogramSeries, { priceScaleId: 'vp', priceFormat: { type: 'volume' }, color: c.perp + '99', priceLineVisible: false, lastValueVisible: false, title: 'perp' }, p)
            se.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, visible: false })
            return se
          },
          feed: (d) => d.perp.map((k) => ({ time: ct(k.t), value: k.v })),
        })
    }
    if (s.premium)
      out.push({
        key: 'prem',
        pane: 'premium',
        create: (ch, p) => {
          const se = ch.addSeries(HistogramSeries, { priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(2)}%` }, priceLineVisible: false, title: '괴리율' }, p)
          se.createPriceLine({ price: 0, color: c.line, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false })
          return se
        },
        // Strong colour while KRX is open (actionable), faded for closed-hours gaps
        feed: (d) => d.premium.map((p) => ({ time: ct(p.t), value: p.v, color: (p.v >= 0 ? c.up : c.down) + (p.live ? 'cc' : '44') })),
      })
    if (s.funding)
      out.push({
        key: 'fund',
        pane: 'funding',
        create: (ch, p) => ch.addSeries(LineSeries, { color: c.perp, lineWidth: 1, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(4)}%` }, priceLineVisible: false, title: '펀딩(1h)' }, p),
        feed: (d) => (interval === '1d' || interval === '1h' ? d.funding.map((f) => ({ time: ct(f.t), value: f.v })) : []),
      })
    if (s.rsi)
      out.push({
        key: 'rsi',
        pane: 'rsi',
        create: (ch, p) => {
          const se = ch.addSeries(LineSeries, { color: '#7b61ff', lineWidth: 1, priceLineVisible: false, title: 'RSI 14' }, p)
          se.createPriceLine({ price: 70, color: c.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
          se.createPriceLine({ price: 30, color: c.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
          return se
        },
        feed: (_, b) => toLine(rsi(b)),
      })
    if (s.macd) {
      out.push({
        key: 'macdHist',
        pane: 'macd',
        create: (ch, p) => ch.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, p),
        feed: (_, b) => macd(b).hist.map((p) => ({ time: ct(p.t), value: p.v, color: (p.v >= 0 ? c.up : c.down) + '99' })),
      })
      out.push({ key: 'macdLine', pane: 'macd', create: (ch, p) => ch.addSeries(LineSeries, { color: '#3da8ff', lineWidth: 1, priceLineVisible: false, title: 'MACD' }, p), feed: (_, b) => toLine(macd(b).macd) })
      out.push({ key: 'macdSig', pane: 'macd', create: (ch, p) => ch.addSeries(LineSeries, { color: '#f5a623', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, p), feed: (_, b) => toLine(macd(b).signal) })
    }
    return out
  }

  private base(d: ChartSeries) {
    // Indicators follow KRX when it is shown, otherwise the KRW-converted perp
    return this.settings.showKrx && d.krx.length ? d.krx : d.perpKrw
  }

  /** Bring the set of series in line with the settings without recreating the chart */
  sync(settings: ChartSettings) {
    this.settings = settings
    // Adding/removing series can change the set of timestamps on the time axis (e.g. KRX history
    // is longer than perp, Ichimoku projects into the future). Keep the visible *time* range fixed.
    const view = this.input ? this.chart.timeScale().getVisibleRange() : null
    const specs = this.specs(settings)
    const wanted = new Set(specs.map((s) => s.key))

    for (const [key, se] of this.series) {
      if (!wanted.has(key)) {
        this.chart.removeSeries(se)
        this.series.delete(key)
      }
    }

    const activePanes = SUB_PANES.filter((p) => specs.some((s) => s.pane === p))
    const paneIndex = (p: Spec['pane']) => (p === 'main' ? 0 : 1 + activePanes.indexOf(p))

    for (const spec of specs) {
      const idx = paneIndex(spec.pane)
      let se = this.series.get(spec.key)
      if (!se) {
        se = spec.create(this.chart, idx)
        this.series.set(spec.key, se)
        if (this.input) se.setData(spec.feed(this.input.data, this.base(this.input.data)) as never)
      } else if (se.getPane().paneIndex() !== idx) se.moveToPane(idx)
    }

    // Drop panes left empty by removed sub-indicators (from the bottom up)
    const panes = this.chart.panes()
    for (let i = panes.length - 1; i > 0; i--) if (!panes[i].getSeries().length) this.chart.removePane(i)
    const after = this.chart.panes()
    after[0]?.setStretchFactor(3.2)
    for (let i = 1; i < after.length; i++) after[i].setStretchFactor(0.8)

    // Primitives (session bands, news pins) and markers live on whichever main series is visible
    const host = this.series.get('krx') ?? this.series.get('perpCandle') ?? this.series.get('perpLine') ?? null
    if (host !== this.host) {
      if (this.host) {
        try {
          this.host.detachPrimitive(this.bands)
          this.host.detachPrimitive(this.pins)
        } catch {
          // host already removed with its primitives
        }
      }
      this.markers?.detach()
      this.markers = null
      this.priceLines = []
      this.host = host
      if (host) {
        host.attachPrimitive(this.bands)
        host.attachPrimitive(this.pins)
        this.markers = createSeriesMarkers(host, [])
      }
    }
    if (this.input) {
      // Overlays depend on which market is the base, so refeed them when markets toggle
      this.feedAll()
      this.decorate()
    }
    if (view) this.chart.timeScale().setVisibleRange(view)
  }

  setInput(input: Input) {
    this.input = input
    const d = input.data
    this.lookup = {
      krx: new Map(d.krx.map((k) => [ct(k.t) as number, k])),
      perp: new Map(d.perpKrw.map((k, i) => [ct(k.t) as number, { ...k, usd: d.perp[i]?.c ?? 0 }])),
      prem: new Map(d.premium.map((p) => [ct(p.t) as number, { v: p.v, live: p.live }])),
    }
    this.feedAll()
    this.decorate()
  }

  private feedAll() {
    if (!this.input) return
    const d = this.input.data
    const base = this.base(d)
    for (const spec of this.specs(this.settings)) this.series.get(spec.key)?.setData(spec.feed(d, base) as never)
  }

  /** Session bands, news pins, open-convergence markers and the next-open forecast lines */
  private decorate() {
    if (!this.input) return
    const { data: d, spans, news, events, prediction } = this.input
    const s = this.settings
    const c = this.c
    const interval = this.interval

    this.bands.set(spans, { regular: css('--band-regular'), nxt: css('--band-nxt'), closed: css('--band-closed') }, s.bands)

    // News: pin onto the bar the headline falls in (daily bars use the KST date)
    const step = STEP_MS[interval]
    const first = Math.min(d.perp[0]?.t ?? Infinity, d.krx[0]?.t ?? Infinity)
    const barOf = (ms: number) => (interval === '1d' ? Math.floor((ms + 9 * 3600_000) / step) * step : Math.floor(ms / step) * step)
    const L = this.lookup
    this.pins.set(
      s.news
        ? news
            .filter((n) => n.t >= first)
            .flatMap((n) => {
              const time = ct(barOf(n.t)) as number
              const bar = (s.showKrx ? L.krx.get(time) : undefined) ?? L.perp.get(time)
              return bar ? [{ time, price: bar.h, id: n.date + n.title }] : []
            })
        : [],
      { fill: '#FFEB00', ink: '#060B11' },
    )

    // Open convergence: how much of the perp-implied gap the stock actually opened at
    if (this.markers) {
      const marks: SeriesMarker<Time>[] = []
      if (s.convergence) {
        const firstT = (s.showKrx ? d.krx : d.perpKrw)[0]?.t ?? 0
        const cands: { m: SeriesMarker<Time>; g: number }[] = []
        for (const e of events) {
          // Ratios on tiny gaps are noise
          if (e.absorptionPct == null || Math.abs(e.gapPct) < 1) continue
          const openMs = Date.UTC(+e.date.slice(0, 4), +e.date.slice(4, 6) - 1, +e.date.slice(6, 8)) // 09:00 KST
          if (openMs < firstT) continue
          cands.push({ g: Math.abs(e.gapPct), m: { time: ct(openMs), position: e.gapPct >= 0 ? 'aboveBar' : 'belowBar', shape: 'circle', color: c.text3, text: `수렴 ${Math.round(e.absorptionPct)}%`, size: 0.4 } })
        }
        // Keep the 8 biggest gaps so the chart stays readable
        marks.push(...cands.sort((p, q) => q.g - p.g).slice(0, 8).map((x) => x.m))
      }
      this.markers.setMarkers(marks.sort((p, q) => (p.time as number) - (q.time as number)))
    }

    const host = this.host
    if (host) {
      this.priceLines.forEach((l) => host.removePriceLine(l))
      this.priceLines = []
      if (s.forecast && prediction && prediction.status === 'pre-open') {
        this.priceLines = [
          host.createPriceLine({ price: prediction.expectedOpen, color: c.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '예상 시가' }),
          host.createPriceLine({ price: prediction.band80.high, color: c.text3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '80%' }),
          host.createPriceLine({ price: prediction.band80.low, color: c.text3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '80%' }),
        ]
      }
    }
  }

  get krxSeries() {
    return (this.series.get('krx') as ISeriesApi<'Candlestick'> | undefined) ?? null
  }
  get perpSeries() {
    const line = this.series.get('perpLine') as ISeriesApi<'Line'> | undefined
    const candle = this.series.get('perpCandle') as ISeriesApi<'Candlestick'> | undefined
    return { line: line ?? null, candle: candle ?? null }
  }
}
