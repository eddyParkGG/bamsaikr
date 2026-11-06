// Imperative wrapper around a lightweight-charts instance.
// The chart is created once per (asset, interval, theme). Toggling markets or indicators only
// adds/removes/hides series, so the user's scroll/zoom position never resets and nothing flickers.
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'

/** Empty space right of the last bar so the price tags ('하이퍼리퀴드', '국내 시장') don't cover it: 12% of the width, 80–160px */
export const rightGapPx = (width: number) => Math.round(Math.min(160, Math.max(80, width * 0.12)))
import type { ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import { bollinger, ichimoku, macd, RIBBON, rsi, sma, vwap, type Bar, type Pt } from './indicators'
import { NewsPins, SessionBands, VLine, type Span } from './primitives'
import type { ChartSettings, IndicatorParams } from './settings'

const KST = 9 * 3600
/** The chart renders UTC, so shift by +9h to display KST wall-clock time */
export const ct = (ms: number) => (Math.floor(ms / 1000) + KST) as UTCTimestamp
export const STEP_MS: Record<ChartInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3600_000, '1d': 86400_000 }

export function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const toLine = (pts: Pt[]) => pts.map((p) => ({ time: ct(p.t), value: p.v }))

/**
 * Line data with breaks across closed hours: KRX intraday bars stop overnight, and connecting the
 * last evening value to the next morning draws a fake flat segment. A whitespace point ends the line.
 */
const toGappedLine = (pts: Pt[], step: number) => {
  if (step >= 86400_000) return toLine(pts)
  const out: { time: UTCTimestamp; value?: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    out.push({ time: ct(pts[i].t), value: pts[i].v })
    if (i + 1 < pts.length && pts[i + 1].t - pts[i].t > step * 1.5) out.push({ time: ct(pts[i].t + step) })
  }
  return out
}
const toCandles = (bars: Bar[]) => bars.map((k) => ({ time: ct(k.t), open: k.o, high: k.h, low: k.l, close: k.c }))

/** Colours for the 1st..4th moving average (periods are user-configurable) */
export const MA_COLORS = ['#f5a623', '#f04251', '#a78bfa', '#8b95a1']

/** Bars Ichimoku projects into the future (standard 26) */
const ICHIMOKU_SHIFT = 26

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
  pane: 'main' | 'volume' | 'premium' | 'follow' | 'funding' | 'rsi' | 'macd'
  create: (chart: IChartApi, pane: number) => AnySeries
  feed: (d: ChartSeries, base: Bar[]) => unknown[]
}

const SUB_PANES = ['volume', 'premium', 'follow', 'funding', 'rsi', 'macd'] as const
export type SubPane = (typeof SUB_PANES)[number]

export class ChartController {
  readonly chart: IChartApi
  readonly bands = new SessionBands()
  readonly pins = new NewsPins()
  /** Day the asset listed on Hyperliquid, drawn on the premium pane (the gap only exists from then on) */
  readonly listing = new VLine()
  lookup: Lookup = { krx: new Map(), perp: new Map(), prem: new Map() }
  private series = new Map<string, AnySeries>()
  private settings: ChartSettings
  private params: IndicatorParams
  private input: Input | null = null
  private host: AnySeries | null = null
  private priceLines: IPriceLine[] = []
  private c: Record<string, string>

  constructor(
    el: HTMLElement,
    private interval: ChartInterval,
    settings: ChartSettings,
    params: IndicatorParams,
  ) {
    this.settings = settings
    this.params = params
    this.c = { text3: css('--text-3'), text2: css('--text-2'), text: css('--text'), line: css('--line'), up: css('--up'), down: css('--down'), perp: css('--perp'), float: css('--bg-float'), bg: css('--bg'), fill: css('--fill-strong'), key: css('--key') }
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
      // Fixed axis width: price tags stay flush right even when the number of digits changes
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.12 }, textColor: c.text2, minimumWidth: 92 },
      timeScale: { borderVisible: false, timeVisible: interval !== '1d', secondsVisible: false, rightOffsetPixels: rightGapPx(el.clientWidth), minBarSpacing: 1 },
      localization: {
        locale: 'ko-KR',
        priceFormatter: (p: number) => Math.round(p).toLocaleString('ko-KR'),
        // Crosshair time label in Korean order: '2026.10.18 (일) 04:00' (chart times are already shifted to KST)
        timeFormatter: (t: Time) => {
          const d = new Date((t as number) * 1000)
          const p2 = (n: number) => String(n).padStart(2, '0')
          const day = `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())} (${'일월화수목금토'[d.getUTCDay()]})`
          return interval === '1d' ? day : `${day} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
        },
      },
    })
    // Invisible whitespace series holding every timestamp the chart can ever show (both markets
    // plus Ichimoku's forward projection). Because the set of time points never changes, toggling
    // anything keeps the user's zoom and scroll exactly as they left it.
    this.axis = this.chart.addSeries(LineSeries, { visible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }, 0)
    this.sync(settings, params)
    // Next frame: changing the chart inside the observer callback would trigger another resize in the same frame
    this.resize = new ResizeObserver(() => requestAnimationFrame(() => this.resize && this.chart.applyOptions({ timeScale: { rightOffsetPixels: rightGapPx(el.clientWidth) } })))
    this.resize.observe(el)
  }

  private axis: ISeriesApi<'Line'>
  private resize: ResizeObserver | null
  /** Logical index of the latest real bar on the axis (-1 before the first data) */
  private lastIdx = -1
  private axisTimes: number[] = []

  /**
   * A live tick opened a new bar (between data refreshes). Do what setInput does for a refresh: move the view along
   * when the latest bar is on screen, and stretch the session background over the new bar. Without this, live bars
   * filled the empty space on the right (the axis already holds future time points) and ran past the background
   */
  followLive(t: number, kind: Span['kind']) {
    if (!this.input || this.lastIdx < 0) return
    const time = ct(t) as number
    if (time <= this.axisTimes[this.lastIdx]) return
    const idx = this.axisTimes.indexOf(time)
    if (idx > this.lastIdx) {
      const ts = this.chart.timeScale()
      const view = ts.getVisibleLogicalRange()
      if (view && view.to >= this.lastIdx) ts.setVisibleLogicalRange({ from: view.from + idx - this.lastIdx, to: view.to + idx - this.lastIdx })
      this.lastIdx = idx
    }
    const spans = this.input.spans
    const last = spans[spans.length - 1]
    if (last && last.kind === kind) last.to = time
    else spans.push({ from: time, to: time, kind })
    this.decorate()
  }

  /** Every sub-pane on screen and its top (px from the chart's top), for HTML titles laid over them */
  subPaneTops(): { pane: SubPane; top: number }[] {
    const root = this.chart.chartElement().getBoundingClientRect().top
    const seen = new Set<string>()
    const out: { pane: SubPane; top: number }[] = []
    for (const spec of this.specs(this.settings)) {
      if (spec.pane === 'main' || seen.has(spec.pane)) continue
      const el = this.series.get(spec.key)?.getPane().getHTMLElement()
      if (!el) continue
      seen.add(spec.pane)
      out.push({ pane: spec.pane, top: el.getBoundingClientRect().top - root })
    }
    return out
  }

  destroy() {
    this.resize?.disconnect()
    this.resize = null
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
      // Overlays never rescale the price axis: only the price series decide the vertical range
      create: (ch, p) => ch.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null }, p),
      feed,
    })
    const out: Spec[] = []

    // Main price series always exist; toggling a market only makes it transparent (see styleMain),
    // so both the time axis and the price axis stay exactly where they were
    out.push({ key: 'krx', pane: 'main', create: (ch) => ch.addSeries(CandlestickSeries, { ...candle, title: '국내 시장' }, 0), feed: (d) => toCandles(d.krx) })
    out.push({
        key: 'perpLine',
        pane: 'main',
        create: (ch) => ch.addSeries(LineSeries, { color: c.perp, lineWidth: 2, title: '하이퍼리퀴드', priceLineVisible: true, priceLineStyle: LineStyle.Dotted, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: c.bg }, 0),
        feed: (d) => d.perpKrw.map((k) => ({ time: ct(k.t), value: k.c })),
      })
    out.push({ key: 'perpCandle', pane: 'main', create: (ch) => ch.addSeries(CandlestickSeries, { ...candle, title: '하이퍼리퀴드' }, 0), feed: (d) => toCandles(d.perpKrw) })

    const P = this.params
    if (s.ma) P.ma.forEach((n, i) => out.push(overlay(`ma${i}:${n}`, MA_COLORS[i % MA_COLORS.length], (_, b) => toGappedLine(sma(b, n), STEP_MS[interval]))))
    if (s.ribbon) RIBBON.forEach((n, i) => out.push(overlay(`rb${n}`, `hsla(${200 + i * 9}, 70%, 50%, 0.55)`, (_, b) => toGappedLine(sma(b, n), STEP_MS[interval]))))
    if (s.bb) {
      const bb = (b: Bar[]) => bollinger(b, P.bb.period, P.bb.mult)
      out.push(overlay('bbU', '#8b95a1', (_, b) => toGappedLine(bb(b).upper, STEP_MS[interval]), 1, LineStyle.Dashed))
      out.push(overlay('bbM', '#8b95a1', (_, b) => toGappedLine(bb(b).mid, STEP_MS[interval])))
      out.push(overlay('bbL', '#8b95a1', (_, b) => toGappedLine(bb(b).lower, STEP_MS[interval]), 1, LineStyle.Dashed))
    }
    if (s.ichimoku) {
      const ich = (b: Bar[]) => ichimoku(b, STEP_MS[interval])
      out.push(overlay('tenkan', '#ff6a6a', (_, b) => toGappedLine(ich(b).tenkan, STEP_MS[interval])))
      out.push(overlay('kijun', '#3da8ff', (_, b) => toGappedLine(ich(b).kijun, STEP_MS[interval])))
      out.push(overlay('spanA', 'rgba(0,168,107,0.8)', (_, b) => toLine(ich(b).spanA)))
      out.push(overlay('spanB', 'rgba(255,60,60,0.6)', (_, b) => toLine(ich(b).spanB)))
      out.push(overlay('chikou', 'rgba(139,149,161,0.7)', (_, b) => toLine(ich(b).chikou), 1, LineStyle.Dotted))
    }
    if (s.vwap && interval !== '1d') out.push(overlay('vwap', '#f5a623', (_, b) => toGappedLine(vwap(b), STEP_MS[interval]), 2, LineStyle.Dashed))

    if (s.volume) {
      out.push({
          key: 'volKrx',
          pane: 'volume',
          create: (ch, p) => {
            const se = ch.addSeries(HistogramSeries, { priceScaleId: 'vk', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, title: '국내 시장' }, p)
            se.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, visible: false })
            return se
          },
          feed: (d) => d.krx.map((k) => ({ time: ct(k.t), value: k.v, color: (k.c >= k.o ? c.up : c.down) + (this.settings.showKrx ? '80' : '00') })),
        })
      out.push({
          key: 'volPerp',
          pane: 'volume',
          create: (ch, p) => {
            const se = ch.addSeries(HistogramSeries, { priceScaleId: 'vp', priceFormat: { type: 'volume' }, color: c.perp + '99', priceLineVisible: false, lastValueVisible: false, title: '하이퍼리퀴드' }, p)
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
          const se = ch.addSeries(HistogramSeries, { priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(2)}%` }, priceLineVisible: false, title: '가격 차이' }, p)
          se.createPriceLine({ price: 0, color: c.line, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false })
          se.attachPrimitive(this.listing)
          return se
        },
        // Strong colour while KRX is open (actionable), faded for closed-hours gaps
        feed: (d) => d.premium.map((p) => ({ time: ct(p.t), value: p.v, color: (p.v >= 0 ? c.up : c.down) + (p.live ? 'cc' : '44') })),
      })
    // How much of the closed-hours Hyperliquid move the 08:00 re-open followed, as bars on its own pane
    // (on the price chart as labels it buried the candles). Only re-opens after a 1%+ move: smaller ones make the ratio noise
    if (s.convergence)
      out.push({
        key: 'follow',
        pane: 'follow',
        create: (ch, p) => {
          const se = ch.addSeries(
            HistogramSeries,
            {
              priceFormat: { type: 'custom', formatter: (v: number) => `${Math.round(v)}%` },
              priceLineVisible: false,
              lastValueVisible: false,
              title: '따라간 정도',
              // Fixed range so a single 300% day does not flatten the rest; 100% (followed exactly) sits mid-pane
              autoscaleInfoProvider: () => ({ priceRange: { minValue: -100, maxValue: 200 } }),
            },
            p,
          )
          se.createPriceLine({ price: 100, color: c.text3, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '같은 만큼' })
          se.createPriceLine({ price: 0, color: c.line, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false })
          return se
        },
        feed: (d) => {
          const step = STEP_MS[interval]
          const firstT = d.krx[0]?.t ?? d.perpKrw[0]?.t ?? 0
          const out: { time: UTCTimestamp; value: number; color: string }[] = []
          for (const e of this.input?.events ?? []) {
            if (e.absorptionPct == null || Math.abs(e.gapPct) < 1) continue
            const reopen = Date.UTC(+e.date.slice(0, 4), +e.date.slice(4, 6) - 1, +e.date.slice(6, 8)) - 3600_000 // 08:00 KST
            // Daily bars are keyed by date; intraday bars by their start time
            const t = interval === '1d' ? reopen + 3600_000 : Math.floor(reopen / step) * step
            if (t < firstT) continue
            out.push({ time: ct(t), value: e.absorptionPct, color: e.follow === 'yes' ? c.key : c.text3 + '88' })
          }
          return out.sort((a, b) => a.time - b.time)
        },
      })
    if (s.funding)
      out.push({
        key: 'fund',
        pane: 'funding',
        create: (ch, p) => ch.addSeries(LineSeries, { color: c.perp, lineWidth: 1, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(4)}%` }, priceLineVisible: false, title: '펀딩(1h)' }, p),
        // Funding is hourly; snap it onto the chart's own bars so it never adds time points
        feed: (d) => {
          const out: { time: UTCTimestamp; value: number }[] = []
          let j = 0
          let last: number | null = null
          const step = STEP_MS[interval]
          for (const k of d.perp) {
            while (j < d.funding.length && d.funding[j].t < k.t + step) last = d.funding[j++].v
            if (last != null) out.push({ time: ct(k.t), value: last })
          }
          return out
        },
      })
    if (s.rsi)
      out.push({
        key: `rsi:${P.rsi.period}:${P.rsi.upper}:${P.rsi.lower}`,
        pane: 'rsi',
        create: (ch, p) => {
          const se = ch.addSeries(LineSeries, { color: '#7b61ff', lineWidth: 1, priceLineVisible: false, title: `RSI ${P.rsi.period}` }, p)
          se.createPriceLine({ price: P.rsi.upper, color: c.up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
          se.createPriceLine({ price: P.rsi.lower, color: c.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
          return se
        },
        feed: (_, b) => toLine(rsi(b, P.rsi.period)),
      })
    if (s.macd) {
      const m = (b: Bar[]) => macd(b, P.macd.fast, P.macd.slow, P.macd.signal)
      const mk = `${P.macd.fast}:${P.macd.slow}:${P.macd.signal}`
      out.push({
        key: `macdHist:${mk}`,
        pane: 'macd',
        create: (ch, p) => ch.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, p),
        feed: (_, b) => m(b).hist.map((p) => ({ time: ct(p.t), value: p.v, color: (p.v >= 0 ? c.up : c.down) + '99' })),
      })
      out.push({ key: `macdLine:${mk}`, pane: 'macd', create: (ch, p) => ch.addSeries(LineSeries, { color: '#3da8ff', lineWidth: 1, priceLineVisible: false, title: `MACD ${mk.replace(/:/g, ',')}` }, p), feed: (_, b) => toLine(m(b).macd) })
      out.push({ key: `macdSig:${mk}`, pane: 'macd', create: (ch, p) => ch.addSeries(LineSeries, { color: '#f5a623', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, p), feed: (_, b) => toLine(m(b).signal) })
    }
    return out
  }

  private base(d: ChartSeries) {
    // Indicators follow the visible candles: KRX when it is shown, otherwise perp.
    // Overlays are excluded from autoscale, so switching the base never moves the price axis.
    return this.settings.showKrx && d.krx.length ? d.krx : d.perpKrw
  }

  /** Bring the set of series in line with the settings without recreating the chart */
  sync(settings: ChartSettings, params: IndicatorParams = this.params) {
    this.settings = settings
    this.params = params
    // The axis series fixes the set of time points, so the logical range (zoom + scroll) can be
    // restored exactly after series are added or removed
    const view = this.input ? this.chart.timeScale().getVisibleLogicalRange() : null
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

    // Primitives (session bands, news pins) live on whichever main series is visible
    // KRX series is permanent, so it hosts the primitives
    const host = this.series.get('krx') ?? null
    if (host !== this.host) {
      if (this.host) {
        try {
          this.host.detachPrimitive(this.bands)
          this.host.detachPrimitive(this.pins)
        } catch {
          // host already removed with its primitives
        }
      }
      this.priceLines = []
      this.arbLine = null
      this.host = host
      if (host) {
        host.attachPrimitive(this.bands)
        host.attachPrimitive(this.pins)
      }
    }
    if (this.input) {
      // Overlays depend on which market is the base, so refeed them when markets toggle
      this.feedAll()
      this.decorate()
    }
    this.styleMain()
    if (view) this.chart.timeScale().setVisibleLogicalRange(view)
  }

  /** Show/hide markets by colour only: hidden series keep their data so the axes do not move */
  private styleMain() {
    const s = this.settings
    const c = this.c
    const clear = 'rgba(0,0,0,0)'
    const krxOn = s.showKrx
    const lineOn = s.showPerp && s.showKrx
    const candleOn = s.showPerp && !s.showKrx
    const candle = (on: boolean) =>
      on
        ? { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, priceLineVisible: true, lastValueVisible: true }
        : { upColor: clear, downColor: clear, wickUpColor: clear, wickDownColor: clear, priceLineVisible: false, lastValueVisible: false }
    this.series.get('krx')?.applyOptions({ ...candle(krxOn), title: krxOn ? '국내 시장' : '' })
    this.series.get('perpCandle')?.applyOptions({ ...candle(candleOn), title: candleOn ? '하이퍼리퀴드' : '' })
    this.series.get('perpLine')?.applyOptions({ color: lineOn ? c.perp : clear, priceLineVisible: lineOn, lastValueVisible: lineOn, crosshairMarkerVisible: lineOn, title: lineOn ? '하이퍼리퀴드' : '' })
    this.series.get('volPerp')?.applyOptions({ color: c.perp + (s.showPerp ? '99' : '00'), title: s.showPerp ? '하이퍼리퀴드' : '' })
    this.series.get('volKrx')?.applyOptions({ title: s.showKrx ? '국내 시장' : '' })
  }

  setInput(input: Input) {
    this.input = input
    const d = input.data
    this.lookup = {
      krx: new Map(d.krx.map((k) => [ct(k.t) as number, k])),
      perp: new Map(d.perpKrw.map((k, i) => [ct(k.t) as number, { ...k, usd: d.perp[i]?.c ?? 0 }])),
      prem: new Map(d.premium.map((p) => [ct(p.t) as number, { v: p.v, live: p.live }])),
    }
    // Keep the view where the user left it as bars come and go (the window drops old bars as new ones arrive,
    // so logical indices shift). Latest bar on screen: keep its distance from the right edge, so new bars push the
    // chart left. Scrolled back into history: keep the same times on screen
    const ts = this.chart.timeScale()
    const view = this.axisTimes.length ? ts.getVisibleLogicalRange() : null
    const prevLast = this.lastIdx
    const prevTimes = this.axisTimes
    this.feedAxis()
    this.feedAll()
    this.decorate()
    if (view && prevLast >= 0) {
      const width = view.to - view.from
      if (view.to >= prevLast) {
        const gap = view.to - prevLast
        ts.setVisibleLogicalRange({ from: this.lastIdx + gap - width, to: this.lastIdx + gap })
      } else {
        const anchor = Math.max(0, Math.min(prevTimes.length - 1, Math.round(view.from)))
        const at = this.axisTimes.indexOf(prevTimes[anchor])
        if (at >= 0) ts.setVisibleLogicalRange({ from: at + (view.from - anchor), to: at + (view.from - anchor) + width })
      }
    }
  }

  private feedAxis() {
    const d = this.input!.data
    const step = STEP_MS[this.interval]
    const times = new Set<number>()
    for (const k of d.perp) times.add(ct(k.t))
    for (const k of d.krx) times.add(ct(k.t))
    const last = Math.max(d.perp.at(-1)?.t ?? 0, d.krx.at(-1)?.t ?? 0)
    for (let i = 1; i <= ICHIMOKU_SHIFT; i++) times.add(ct(last + i * step))
    this.axisTimes = [...times].sort((a, b) => a - b)
    this.lastIdx = this.axisTimes.indexOf(ct(last) as number)
    this.axis.setData(this.axisTimes.map((t) => ({ time: t as UTCTimestamp })))
  }

  private feedAll() {
    if (!this.input) return
    const d = this.input.data
    const base = this.base(d)
    for (const spec of this.specs(this.settings)) this.series.get(spec.key)?.setData(spec.feed(d, base) as never)
  }

  /** Session bands, news pins and the next-open forecast lines */
  private decorate() {
    if (!this.input) return
    const { data: d, spans, news, prediction } = this.input
    const s = this.settings
    const c = this.c
    const interval = this.interval

    this.bands.set(spans, { open: css('--band-open'), closed: css('--band-closed') }, s.bands)

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

    // Hyperliquid listing day on the premium pane, snapped to the bar it falls in
    const listedAt = d.listedAt
    if (listedAt != null) {
      const day = new Date(barOf(listedAt) + (interval === '1d' ? 0 : 9 * 3600_000))
      this.listing.set(ct(barOf(listedAt)), `하이퍼리퀴드 상장 ${day.getUTCMonth() + 1}/${day.getUTCDate()}`, c.text2)
    } else this.listing.set(null, '', c.text2)

    const host = this.host
    if (host) {
      this.priceLines.forEach((l) => host.removePriceLine(l))
      this.priceLines = []
      if (s.forecast && prediction && prediction.status === 'pre-open') {
        // Where the open usually lands; the Hyperliquid line itself carries tonight's price
        this.priceLines = [
          host.createPriceLine({ price: prediction.band80.high, color: c.text3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '범위' }),
          host.createPriceLine({ price: prediction.band80.low, color: c.text3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '범위' }),
        ]
      }
    }
  }

  // ───────── on-chart notes (HTML overlays placed by price) ─────────

  /** Y of a price on the main pane, or null while the chart has no scale yet */
  yOf(price: number) {
    return this.host?.priceToCoordinate(price) ?? null
  }
  get mainPaneHeight() {
    return this.chart.panes()[0]?.getHeight() ?? 0
  }
  get axisWidth() {
    return this.chart.priceScale('right').width()
  }

  private arbLine: IPriceLine | null = null
  /** Dashed Hyperliquid price line for the spread note; skipped when the Hyperliquid series already shows its own */
  setArbLine(price: number | null) {
    const host = this.host
    if (this.arbLine && host) host.removePriceLine(this.arbLine)
    this.arbLine = null
    if (!host || price == null || this.settings.showPerp) return
    this.arbLine = host.createPriceLine({ price, color: this.c.perp, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' })
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
