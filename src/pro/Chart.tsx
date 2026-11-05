import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
  type LogicalRange,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { sessionAt } from '../../shared/session'
import { fmtKoreanUnit, fmtPct, fmtPrice } from '../lib/format'
import { useLive } from '../lib/live'
import { bollinger, ichimoku, macd, RIBBON, rsi, sma, vwap, type Bar, type Pt } from './indicators'
import { NewsPins, SessionBands, type Span } from './primitives'

import { type ChartSettings } from './settings'

const KST = 9 * 3600
/** 차트는 UTC 로 표시하므로 KST 시각이 그대로 보이게 9시간 밀어서 넣음 */
const ct = (ms: number) => (Math.floor(ms / 1000) + KST) as UTCTimestamp
const STEP_MS: Record<ChartInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3600_000, '1d': 86400_000 }

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const line = (pts: Pt[]) => pts.map((p) => ({ time: ct(p.t), value: p.v }))

interface Props {
  asset: Asset
  interval: ChartInterval
  data: ChartSeries
  news: NewsMarker[]
  events: OpenEvent[]
  prediction: Prediction | null
  arb: ArbSnapshot | null
  settings: ChartSettings
  theme: string
  onNews: (n: NewsMarker) => void
}

function ChartImpl({ asset, interval, data, news, events, prediction, arb, settings, theme, onNews }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const legend = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<{ perp?: ISeriesApi<'Candlestick' | 'Line'>; perpIsCandle?: boolean }>({})
  const rangeRef = useRef<LogicalRange | null>(null)
  const newsRef = useRef(news)
  newsRef.current = news
  const onNewsRef = useRef(onNews)
  onNewsRef.current = onNews
  const [ready, setReady] = useState(0)
  const [card, setCard] = useState<{ x: number; y: number; t: number } | null>(null)
  // 시각(차트 초) → 봉. 레전드·클릭 카드가 React 렌더 없이 바로 찾음
  const lookup = useRef<{ krx: Map<number, Bar>; perp: Map<number, Bar & { usd: number }>; prem: Map<number, { v: number; live: boolean }> }>({ krx: new Map(), perp: new Map(), prem: new Map() })

  const holidays = useMemo(() => new Set(data.holidays), [data.holidays])

  // 지표 기준 시리즈: KRX 가 켜져 있으면 KRX, 아니면 perp(원화 환산)
  const base: Bar[] = settings.showKrx && data.krx.length ? data.krx : data.perpKrw

  // 시간대 배경 구간 (perp 봉은 24시간 연속이라 이걸 기준으로)
  const spans = useMemo<Span[]>(() => {
    if (interval === '1d') return []
    const out: Span[] = []
    for (const k of data.perp) {
      const kind = sessionAt(k.t, holidays)
      const t = ct(k.t)
      const last = out[out.length - 1]
      if (last && last.kind === kind) last.to = t
      else out.push({ from: t, to: t, kind })
    }
    return out
  }, [data.perp, holidays, interval])

  const layoutKey = JSON.stringify({ asset: asset.id, interval, settings, theme })

  // 차트 생성 (레이아웃 바뀔 때만 다시 만듦)
  useEffect(() => {
    const el = box.current!
    const text2 = css('--text-3')
    const lineC = css('--line')
    const up = css('--up')
    const down = css('--down')
    const perpC = css('--perp')
    const krxC = css('--krx')

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: text2,
        fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: lineC, separatorHoverColor: css('--fill-strong'), enableResize: true },
      },
      grid: { vertLines: { color: lineC }, horzLines: { color: lineC } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: text2, width: 1, style: LineStyle.Dashed, labelBackgroundColor: css('--bg-float') },
        horzLine: { color: text2, width: 1, style: LineStyle.Dashed, labelBackgroundColor: css('--bg-float') },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.16, bottom: 0.12 }, textColor: css('--text-2') },
      timeScale: { borderVisible: false, timeVisible: interval !== '1d', secondsVisible: false, rightOffset: 6, minBarSpacing: 1 },
      localization: {
        locale: 'ko-KR',
        priceFormatter: (p: number) => (asset.kind === 'index' ? p.toFixed(2) : Math.round(p).toLocaleString('ko-KR')),
      },
    })
    chartRef.current = chart

    let pane = 0
    const kCandle = { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: true, priceLineStyle: LineStyle.Dotted, lastValueVisible: true }

    // ── 가격 ──
    const krx = settings.showKrx ? chart.addSeries(CandlestickSeries, { ...kCandle, title: 'KRX' }, 0) : null
    const perpIsCandle = !settings.showKrx
    const perp = settings.showPerp
      ? perpIsCandle
        ? chart.addSeries(CandlestickSeries, { ...kCandle, title: 'perp' }, 0)
        : chart.addSeries(LineSeries, { color: perpC, lineWidth: 2, title: 'perp', priceLineVisible: true, priceLineStyle: LineStyle.Dotted, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css('--bg') }, 0)
      : null
    seriesRef.current = { perp: perp as ISeriesApi<'Candlestick' | 'Line'>, perpIsCandle }
    const host = (krx ?? perp) as ISeriesApi<'Candlestick' | 'Line'> | null

    // 배경 · 뉴스 핀
    const bands = new SessionBands()
    const pins = new NewsPins()
    if (host) {
      host.attachPrimitive(bands)
      host.attachPrimitive(pins)
    }
    const markersApi = host ? createSeriesMarkers(host, []) : null
    let priceLines: IPriceLine[] = []

    const overlays: { s: ISeriesApi<'Line'>; key: string }[] = []
    const addLine = (key: string, color: string, width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid, p = 0) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, p)
      overlays.push({ s, key })
      return s
    }
    if (settings.ma) {
      ;[
        [5, '#f5a623'],
        [20, '#f04251'],
        [60, '#00b37e'],
        [120, '#8b95a1'],
      ].forEach(([n, c]) => addLine(`ma${n}`, c as string))
    }
    if (settings.ribbon) RIBBON.forEach((n, i) => addLine(`rb${n}`, `hsla(${200 + i * 9}, 70%, 50%, 0.55)`))
    if (settings.bb) {
      addLine('bbU', '#8b95a1', 1, LineStyle.Dashed)
      addLine('bbM', '#8b95a1')
      addLine('bbL', '#8b95a1', 1, LineStyle.Dashed)
    }
    if (settings.ichimoku) {
      addLine('tenkan', '#ff6a6a')
      addLine('kijun', '#3da8ff')
      addLine('spanA', 'rgba(0,168,107,0.8)')
      addLine('spanB', 'rgba(255,60,60,0.6)')
      addLine('chikou', 'rgba(139,149,161,0.7)', 1, LineStyle.Dotted)
    }
    if (settings.vwap && interval !== '1d') addLine('vwap', '#f5a623', 2, LineStyle.Dashed)

    // ── 거래량 ──
    let volKrx: ISeriesApi<'Histogram'> | null = null
    let volPerp: ISeriesApi<'Histogram'> | null = null
    if (settings.volume) {
      pane++
      if (settings.showKrx) volKrx = chart.addSeries(HistogramSeries, { priceScaleId: 'vk', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, title: 'KRX' }, pane)
      if (settings.showPerp) volPerp = chart.addSeries(HistogramSeries, { priceScaleId: 'vp', priceFormat: { type: 'volume' }, color: perpC + '99', priceLineVisible: false, lastValueVisible: false, title: 'perp' }, pane)
      if (volKrx) chart.priceScale('vk', pane).applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, visible: false })
      if (volPerp) chart.priceScale('vp', pane).applyOptions({ scaleMargins: { top: 0.1, bottom: 0 }, visible: false })
    }

    // ── 괴리율 ──
    let prem: ISeriesApi<'Histogram'> | null = null
    if (settings.premium) {
      pane++
      prem = chart.addSeries(HistogramSeries, { priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(2)}%` }, priceLineVisible: false, title: '괴리율' }, pane)
      prem.createPriceLine({ price: 0, color: lineC, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false })
    }

    let fund: ISeriesApi<'Line'> | null = null
    if (settings.funding) {
      pane++
      fund = chart.addSeries(LineSeries, { color: perpC, lineWidth: 1, priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(4)}%` }, priceLineVisible: false, title: '펀딩(1h)' }, pane)
    }
    let rsiS: ISeriesApi<'Line'> | null = null
    if (settings.rsi) {
      pane++
      rsiS = chart.addSeries(LineSeries, { color: '#7b61ff', lineWidth: 1, priceLineVisible: false, title: 'RSI 14' }, pane)
      rsiS.createPriceLine({ price: 70, color: up, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
      rsiS.createPriceLine({ price: 30, color: down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false })
    }
    let macdS: { line: ISeriesApi<'Line'>; sig: ISeriesApi<'Line'>; hist: ISeriesApi<'Histogram'> } | null = null
    if (settings.macd) {
      pane++
      macdS = {
        hist: chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane),
        line: chart.addSeries(LineSeries, { color: '#3da8ff', lineWidth: 1, priceLineVisible: false, title: 'MACD' }, pane),
        sig: chart.addSeries(LineSeries, { color: '#f5a623', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane),
      }
    }
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3.2)
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(0.8)

    // ── 데이터 넣는 함수 (폴링마다 호출) ──
    const apply = (d: ChartSeries, b: Bar[], sp: Span[], nw: NewsMarker[], ev: OpenEvent[], pr: Prediction | null) => {
      const candles = (bars: Bar[]) => bars.map((k) => ({ time: ct(k.t), open: k.o, high: k.h, low: k.l, close: k.c }))
      lookup.current = {
        krx: new Map(d.krx.map((k) => [ct(k.t) as number, k])),
        perp: new Map(d.perpKrw.map((k, i) => [ct(k.t) as number, { ...k, usd: d.perp[i]?.c ?? 0 }])),
        prem: new Map(d.premium.map((p) => [ct(p.t) as number, { v: p.v, live: p.live }])),
      }
      krx?.setData(candles(d.krx))
      if (perp) {
        if (perpIsCandle) (perp as ISeriesApi<'Candlestick'>).setData(candles(d.perpKrw))
        else (perp as ISeriesApi<'Line'>).setData(d.perpKrw.map((k) => ({ time: ct(k.t), value: k.c })))
      }

      const get = (k: string) => overlays.find((o) => o.key === k)?.s
      if (settings.ma) for (const n of [5, 20, 60, 120]) get(`ma${n}`)?.setData(line(sma(b, n)))
      if (settings.ribbon) for (const n of RIBBON) get(`rb${n}`)?.setData(line(sma(b, n)))
      if (settings.bb) {
        const x = bollinger(b)
        get('bbU')?.setData(line(x.upper))
        get('bbM')?.setData(line(x.mid))
        get('bbL')?.setData(line(x.lower))
      }
      if (settings.ichimoku) {
        const x = ichimoku(b, STEP_MS[interval])
        get('tenkan')?.setData(line(x.tenkan))
        get('kijun')?.setData(line(x.kijun))
        get('spanA')?.setData(line(x.spanA))
        get('spanB')?.setData(line(x.spanB))
        get('chikou')?.setData(line(x.chikou))
      }
      if (settings.vwap) get('vwap')?.setData(line(vwap(b)))

      volKrx?.setData(d.krx.map((k) => ({ time: ct(k.t), value: k.v, color: (k.c >= k.o ? up : down) + '80' })))
      volPerp?.setData(d.perp.map((k) => ({ time: ct(k.t), value: k.v })))
      prem?.setData(
        d.premium.map((p) => ({
          time: ct(p.t),
          value: p.v,
          // 국내 장이 열려 있을 때(실제 비교 가능)는 진하게, 휴장 중 갭은 연하게
          color: (p.v >= 0 ? up : down) + (p.live ? 'cc' : '44'),
        })),
      )
      fund?.setData(interval === '1d' || interval === '1h' ? d.funding.map((f) => ({ time: ct(f.t), value: f.v })) : [])
      if (rsiS) rsiS.setData(line(rsi(b)))
      if (macdS) {
        const m = macd(b)
        macdS.line.setData(line(m.macd))
        macdS.sig.setData(line(m.signal))
        macdS.hist.setData(m.hist.map((p) => ({ time: ct(p.t), value: p.v, color: (p.v >= 0 ? up : down) + '99' })))
      }

      bands.set(sp, { regular: css('--band-regular'), nxt: css('--band-nxt'), closed: css('--band-closed') }, settings.bands)

      // 뉴스: 해당 시각이 속한 봉에 꽂음 (일봉은 KST 날짜 기준)
      const step = STEP_MS[interval]
      const first = Math.min(d.perp[0]?.t ?? Infinity, d.krx[0]?.t ?? Infinity)
      const barOf = (ms: number) => (interval === '1d' ? Math.floor((ms + 9 * 3600_000) / step) * step : Math.floor(ms / step) * step)
      pins.set(
        settings.news ? nw.filter((n) => n.t >= first).map((n) => ({ time: ct(barOf(n.t)), id: n.date + n.title })) : [],
        { fill: '#FFEB00', ink: '#060B11', line: css('--line-strong') },
      )

      // 개장 수렴: 개장 봉 위에 '주식이 perp 갭을 몇 % 따라갔는지'
      if (markersApi && settings.convergence) {
        const cands: { m: SeriesMarker<Time>; g: number }[] = []
        const firstT = (krx ? d.krx : d.perpKrw)[0]?.t ?? 0
        for (const e of ev) {
          // 갭이 작은 날은 비율이 의미 없고 화면만 복잡해져서 뺌
          if (e.absorptionPct == null || Math.abs(e.gapPct) < 1) continue
          const openMs = Date.UTC(+e.date.slice(0, 4), +e.date.slice(4, 6) - 1, +e.date.slice(6, 8)) // 09:00 KST
          if (openMs < firstT) continue
          cands.push({
            g: Math.abs(e.gapPct),
            m: {
              time: ct(openMs),
              position: e.gapPct >= 0 ? 'aboveBar' : 'belowBar',
              shape: 'circle',
              color: css('--text-3'),
              text: `수렴 ${Math.round(e.absorptionPct)}%`,
              size: 0.4,
            },
          })
        }
        // 갭이 컸던 날 위주로 최대 8개만 (다 찍으면 읽을 수가 없음)
        const top = cands.sort((p, q) => q.g - p.g).slice(0, 8).map((x) => x.m)
        markersApi.setMarkers(top.sort((p, q) => (p.time as number) - (q.time as number)))
      }

      // 휴장 중이면 다음 시가 예상선과 80% 구간
      priceLines.forEach((l) => host?.removePriceLine(l))
      priceLines = []
      if (host && settings.forecast && pr && pr.status === 'pre-open') {
        priceLines = [
          host.createPriceLine({ price: pr.expectedOpen, color: css('--text'), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '예상 시가' }),
          host.createPriceLine({ price: pr.band80.high, color: css('--text-3'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '80%' }),
          host.createPriceLine({ price: pr.band80.low, color: css('--text-3'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '80%' }),
        ]
      }
    }
    ;(chart as unknown as { __apply: typeof apply }).__apply = apply

    // 레전드 · 뉴스 호버 (React 렌더 없이 DOM 직접 갱신)
    const isIdx = asset.kind === 'index'
    const f = (v: number) => fmtPrice(v, isIdx)
    const renderLegend = (time: number | null) => {
      const lg = legend.current
      if (!lg) return
      const L = lookup.current
      const lastT = (m: Map<number, unknown>) => [...m.keys()].at(-1) ?? 0
      const t = time ?? Math.max(lastT(L.krx), lastT(L.perp))
      const k = settings.showKrx ? (L.krx.get(t) ?? (time == null ? L.krx.get(lastT(L.krx)) : undefined)) : undefined
      const p = settings.showPerp ? L.perp.get(t) : undefined
      const pr = L.prem.get(t)
      const cls = (v: number, ref: number) => (v > ref ? 'up' : v < ref ? 'down' : '')
      const rows: string[] = []
      if (k)
        rows.push(
          `<div class="row"><i class="lg-dot" style="background:${krxC}"></i><span>KRX</span><span class="k">시작</span><b class="${cls(k.o, k.o)}">${f(k.o)}</b><span class="k">고가</span><b class="${cls(k.h, k.o)}">${f(k.h)}</b><span class="k">저가</span><b class="${cls(k.l, k.o)}">${f(k.l)}</b><span class="k">종가</span><b class="${cls(k.c, k.o)}">${f(k.c)}</b></div>`,
        )
      if (p)
        rows.push(
          `<div class="row"><i class="lg-dot" style="background:${perpC}"></i><span>perp 환산</span><b>${f(p.c)}</b>${asset.fx ? `<span class="k">$${p.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>` : ''}${pr ? `<span class="k">${pr.live ? '괴리' : '종가 대비'}</span><b class="${pr.v > 0 ? 'up' : pr.v < 0 ? 'down' : ''}">${fmtPct(pr.v)}</b>` : ''}</div>`,
        )
      if (settings.ma) rows.push(`<div class="row"><span class="k">이동평균선</span>${[['5', '#f5a623'], ['20', '#f04251'], ['60', '#00b37e'], ['120', '#8b95a1']].map(([n, c]) => `<span style="color:${c}">${n}</span>`).join('')}</div>`)
      lg.innerHTML = rows.join('')
    }
    ;(chart as unknown as { __legend: typeof renderLegend }).__legend = renderLegend

    chart.subscribeCrosshairMove((param) => {
      renderLegend(param.time == null ? null : (param.time as number))
      const t = tip.current
      if (!t) return
      const id = param.point ? pins.hit(param.point.x, param.point.y) : null
      pins.setHover(id)
      el.style.cursor = id ? 'pointer' : ''
      const n = id ? newsRef.current.find((x) => x.date + x.title === id) : null
      if (n && param.point) {
        t.hidden = false
        t.textContent = n.title
        t.style.transform = `translate(${Math.min(param.point.x + 14, el.clientWidth - 260)}px, 30px)`
      } else t.hidden = true
    })
    chart.subscribeClick((param) => {
      if (!param.point) return
      const id = pins.hit(param.point.x, param.point.y)
      const n = id ? newsRef.current.find((x) => x.date + x.title === id) : null
      if (n) return onNewsRef.current(n)
      if (param.time == null) return setCard(null)
      setCard({ x: param.point.x, y: param.point.y, t: param.time as number })
    })

    if (rangeRef.current) chart.timeScale().setVisibleLogicalRange(rangeRef.current)
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => (rangeRef.current = r))
    setReady((x) => x + 1)

    return () => {
      chartRef.current = null
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  // 레이아웃이 그대로면 데이터만 교체
  const firstApply = useRef(true)
  useEffect(() => {
    const chart = chartRef.current as unknown as { __apply?: (...a: unknown[]) => void; timeScale: IChartApi['timeScale'] } | null
    if (!chart?.__apply) return
    chart.__apply(data, base, spans, news, events, prediction)
    ;(chart as unknown as { __legend?: (t: null) => void }).__legend?.(null)
    if (firstApply.current || !rangeRef.current) {
      firstApply.current = false
      const lastT = Math.max(data.perp.at(-1)?.t ?? 0, data.krx.at(-1)?.t ?? 0)
      // 일봉은 최근 1년 전체, 분봉은 하루~이틀
      const spanMs = interval === '1d' ? 365 * 86400_000 : interval === '1h' ? 10 * 86400_000 : interval === '15m' ? 3 * 86400_000 : interval === '5m' ? 86400_000 : 8 * 3600_000
      const ts = (chart as unknown as IChartApi).timeScale()
      ts.setVisibleRange({ from: ct(lastT - spanMs), to: ct(lastT) })
      ts.scrollToRealTime()
    }
  }, [data, base, spans, news, events, prediction, ready, interval])

  useEffect(() => {
    rangeRef.current = null
    firstApply.current = true
    setCard(null)
  }, [asset.id, interval])

  useEffect(() => {
    if (!card) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCard(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card])

  // 실시간: perp 최신 봉을 WS 로 갱신 (원화 환산은 업비트 실시간 환율)
  useEffect(() => {
    return useLive.subscribe((s, prev) => {
      const k = s.candle[`${asset.perp}:${interval === '1d' ? '1d' : interval}`]
      if (!k || k === prev.candle[`${asset.perp}:${interval}`]) return
      const { perp, perpIsCandle } = seriesRef.current
      if (!perp) return
      const rate = asset.fx ? (s.usdc?.rate ?? arb?.fx?.rate ?? 0) : 1
      if (!rate) return
      const last = data.perp[data.perp.length - 1]
      if (last && k.t < last.t) return
      try {
        if (perpIsCandle) (perp as ISeriesApi<'Candlestick'>).update({ time: ct(k.t), open: k.o * rate, high: k.h * rate, low: k.l * rate, close: k.c * rate })
        else (perp as ISeriesApi<'Line'>).update({ time: ct(k.t), value: k.c * rate })
      } catch {
        // 데이터 교체 직후 시간 역전은 무시
      }
    })
  }, [asset, interval, data.perp, arb?.fx?.rate])

  return (
    <div className="chart">
      <div ref={box} className="chart__canvas" />
      <div ref={legend} className="chart__legend num" />
      <div ref={tip} className="chart__tip" hidden />
      {card && <BarCard card={card} asset={asset} interval={interval} lookup={lookup.current} news={news} onClose={() => setCard(null)} boxW={box.current?.clientWidth ?? 800} />}
      {!data.krx.length && settings.showKrx && <div className="chart__empty">이 구간에는 국내 시세가 없어요. 휴장 중이거나 분봉 보관 기간이 지났어요.</div>}
    </div>
  )
}

export const Chart = memo(ChartImpl)

export function volumeText(v: number) {
  return fmtKoreanUnit(v)
}

const KST_S = 9 * 3600
function cardTitle(t: number, interval: ChartInterval) {
  const d = new Date(t * 1000) // 차트 시간은 이미 KST 로 밀려 있음
  const day = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
  return interval === '1d' ? day : `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function BarCard({
  card,
  asset,
  interval,
  lookup,
  news,
  onClose,
  boxW,
}: {
  card: { x: number; y: number; t: number }
  asset: Asset
  interval: ChartInterval
  lookup: { krx: Map<number, Bar>; perp: Map<number, Bar & { usd: number }>; prem: Map<number, { v: number; live: boolean }> }
  news: NewsMarker[]
  onClose: () => void
  boxW: number
}) {
  const isIdx = asset.kind === 'index'
  const k = lookup.krx.get(card.t)
  const p = lookup.perp.get(card.t)
  const pr = lookup.prem.get(card.t)
  const dayKey = cardTitle(card.t, '1d').replace(/\./g, '')
  const n = news.find((x) => x.date === dayKey)
  const realMs = (card.t - KST_S) * 1000
  const left = card.x + 16 + 248 > boxW ? card.x - 264 : card.x + 16
  return (
    <div className="chart__card num" style={{ left: Math.max(8, left), top: Math.max(8, card.y - 60) }} role="dialog" aria-label="봉 정보">
      <h4>
        {cardTitle(card.t, interval)}
        <button className="faint" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </h4>
      {k && (
        <>
          <div className="kv">
            <dt>KRX 시작 · 종가</dt>
            <dd>
              {fmtPrice(k.o, isIdx)} → {fmtPrice(k.c, isIdx)}
            </dd>
          </div>
          <div className="kv">
            <dt>KRX 고가 · 저가</dt>
            <dd>
              {fmtPrice(k.h, isIdx)} / {fmtPrice(k.l, isIdx)}
            </dd>
          </div>
          <div className="kv">
            <dt>KRX 거래량</dt>
            <dd>{fmtKoreanUnit(k.v)}주</dd>
          </div>
        </>
      )}
      {p && (
        <>
          <div className="kv">
            <dt>perp 환산 종가</dt>
            <dd>{fmtPrice(p.c, isIdx)}</dd>
          </div>
          <div className="kv">
            <dt>perp 거래량</dt>
            <dd>{fmtKoreanUnit(p.v)}계약</dd>
          </div>
        </>
      )}
      {pr && (
        <div className="kv">
          <dt>{pr.live ? '괴리율' : '직전 종가 대비'}</dt>
          <dd className={pr.v > 0 ? 'up' : pr.v < 0 ? 'down' : ''}>{fmtPct(pr.v)}</dd>
        </div>
      )}
      {interval !== '1d' && (
        <div className="kv">
          <dt>시간대</dt>
          <dd>{(() => {
            const h = new Date(card.t * 1000).getUTCHours() * 60 + new Date(card.t * 1000).getUTCMinutes()
            const wd = new Date(realMs + KST_S * 1000).getUTCDay()
            if (wd === 0 || wd === 6) return '주말 · perp만 거래'
            return h >= 540 && h < 930 ? '정규장' : (h >= 480 && h < 540) || (h >= 930 && h < 1200) ? '넥스트레이드' : '휴장 · perp만 거래'
          })()}</dd>
        </div>
      )}
      {n && <p className="chart__card-news">{n.title}</p>}
    </div>
  )
}
