import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { sessionAt } from '../../shared/session'
import { SESSION_LABEL, useNow, venueAt } from '../lib/market'
import { followText, nightStage } from '../lib/night'
import { dateKeyParts, fmtKoreanUnit, fmtPct, fmtPrice, fmtUsdCompact, fmtWon, fmtWonUnit, tone } from '../lib/format'
import { useLive } from '../lib/live'
import { arbKind, depthNote } from '../lib/arb'
import { OracleTag, predictionReady } from '../components/NextOpenState'
import { Help } from '../components/Help'
import { ChartController, css, ct, MA_COLORS, rightGapPx, STEP_MS, type Lookup, type SubPane } from './chartController'
import type { Bar } from './indicators'
import type { Span } from './primitives'
import type { ChartSettings, IndicatorParams } from './settings'

interface Props {
  asset: Asset
  interval: ChartInterval
  data: ChartSeries
  news: NewsMarker[]
  events: OpenEvent[]
  prediction: Prediction | null
  arb: ArbSnapshot | null
  settings: ChartSettings
  params: IndicatorParams
  theme: string
  onNews: (n: NewsMarker) => void
  /** Open the forecast tab / the spread order, from the notes on the chart */
  onPredict: () => void
  onArb: () => void
}

function ChartImpl({ asset, interval, data, news, events, prediction, arb, settings, params, theme, onNews, onPredict, onArb }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const legend = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const ctl = useRef<ChartController | null>(null)
  const [card, setCard] = useState<{ x: number; y: number; t: number } | null>(null)
  const [ready, setReady] = useState(0)
  // Latest values for handlers registered once per chart
  const live = useRef({ settings, params, news, onNews })
  live.current = { settings, params, news, onNews }

  const holidays = useMemo(() => new Set(data.holidays), [data.holidays])
  // Background: domestic market open (KRX or NXT) vs closed. Perp bars are continuous, so they are the time grid.
  // Daily bars are keyed 09:00 KST; read them at 10:00 so a trading day counts as open and weekends/holidays as closed
  const spans = useMemo<Span[]>(() => {
    const out: Span[] = []
    for (const k of data.perp) {
      const kind: Span['kind'] = sessionAt(interval === '1d' ? k.t + 3600_000 : k.t, holidays) === 'closed' ? 'closed' : 'open'
      const t = ct(k.t)
      const last = out[out.length - 1]
      if (last && last.kind === kind) last.to = t
      else out.push({ from: t, to: t, kind })
    }
    return out
  }, [data.perp, holidays, interval])

  // Create the chart only when asset, interval or theme change
  useEffect(() => {
    const el = box.current!
    const c = new ChartController(el, interval, live.current.settings, live.current.params)
    ctl.current = c
    const chart = c.chart
    const krxC = css('--krx')
    const perpC = css('--perp')
    const f = (v: number) => fmtPrice(v)

    const renderLegend = (time: number | null) => {
      const lg = legend.current
      if (!lg) return
      const s = live.current.settings
      const L = c.lookup
      const lastKey = (m: Map<number, unknown>) => [...m.keys()].at(-1) ?? 0
      const t = time ?? Math.max(lastKey(L.krx), lastKey(L.perp))
      const k = s.showKrx ? (L.krx.get(t) ?? (time == null ? L.krx.get(lastKey(L.krx)) : undefined)) : undefined
      const p = s.showPerp ? L.perp.get(t) : undefined
      const pr = L.prem.get(t)
      const cls = (v: number, ref: number) => (v > ref ? 'up' : v < ref ? 'down' : '')
      const rows: string[] = []
      if (k)
        rows.push(
          `<div class="row"><i class="lg-dot" style="background:${krxC}"></i><span>국내 시장</span><span class="k">시작</span><b class="${cls(k.o, k.o)}">${f(k.o)}</b><span class="k">고가</span><b class="${cls(k.h, k.o)}">${f(k.h)}</b><span class="k">저가</span><b class="${cls(k.l, k.o)}">${f(k.l)}</b><span class="k">종가</span><b class="${cls(k.c, k.o)}">${f(k.c)}</b></div>`,
        )
      if (p)
        rows.push(
          `<div class="row"><i class="lg-dot" style="background:${perpC}"></i><span>하이퍼리퀴드</span><b>${f(p.c)}${asset.kind === 'index' ? '' : '원'}</b>${pr ? `<span class="k">${pr.live ? '가격 차이' : '종가 대비'}</span><b class="${pr.v > 0 ? 'up' : pr.v < 0 ? 'down' : ''}">${fmtPct(pr.v)}</b>` : ''}</div>`,
        )
      if (s.ma) rows.push(`<div class="row"><span class="k">이동평균선</span>${live.current.params.ma.map((n, i) => `<span style="color:${MA_COLORS[i % MA_COLORS.length]}">${n}</span>`).join('')}</div>`)
      lg.innerHTML = rows.join('')
    }
    ;(c as unknown as { renderLegend: typeof renderLegend }).renderLegend = renderLegend

    // Legend and news hover update the DOM directly (no React re-render per mouse move)
    const byId = (id: string) => live.current.news.find((x) => x.date + x.title === id)
    chart.subscribeCrosshairMove((param) => {
      renderLegend(param.time == null ? null : (param.time as number))
      const t = tip.current
      if (!t) return
      const hit = param.point ? c.pins.hitBox(param.point.x, param.point.y) : null
      c.pins.setHover(hit ? hit.ids.join('|') : null)
      el.style.cursor = hit ? 'pointer' : ''
      const items = hit ? hit.ids.map(byId).filter((n): n is NewsMarker => !!n) : []
      if (hit && items.length) {
        t.hidden = false
        // One line per issue: date + headline (several when bubbles are grouped)
        t.innerHTML = items
          .map((n) => `<div class="tip-row"><span class="tip-date">${tipDate(n.date)}</span><span>${n.title.replace(/</g, '&lt;')}</span></div>`)
          .join('') + (items.length > 1 ? '<div class="tip-hint">눌러서 확대</div>' : '')
        // Centre over the bubble, just above it, kept inside the chart
        const w = t.offsetWidth
        const h = t.offsetHeight
        const x = Math.min(Math.max(4, hit.x - w / 2), el.clientWidth - w - 4)
        const y = hit.y - h - 8 < 4 ? hit.y + 30 : hit.y - h - 8
        t.style.transform = `translate(${x}px, ${y}px)`
      } else t.hidden = true
    })
    chart.subscribeClick((param) => {
      if (!param.point) return
      const hit = c.pins.hitBox(param.point.x, param.point.y)
      if (hit && hit.ids.length === 1) {
        const n = byId(hit.ids[0])
        if (n) return live.current.onNews(n)
      }
      if (hit && hit.ids.length > 1) {
        // Zoom into the grouped dates so they split into individual bubbles
        const ts = chart.timeScale()
        const idx = hit.times.map((tm) => ts.timeToIndex(tm as UTCTimestamp, true) ?? 0)
        const lo = Math.min(...idx)
        const hi = Math.max(...idx)
        const pad = Math.max(6, (hi - lo) * 1.5)
        ts.setVisibleLogicalRange({ from: lo - pad, to: hi + pad })
        return
      }
      if (param.time == null) return setCard(null)
      setCard({ x: param.point.x, y: param.point.y, t: param.time as number })
    })

    setReady((x) => x + 1)
    return () => {
      ctl.current = null
      c.destroy()
    }
  }, [asset.id, interval, theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Settings: add/remove series in place
  useEffect(() => {
    const c = ctl.current
    if (!c) return
    c.sync(settings, params)
    ;(c as unknown as { renderLegend?: (t: null) => void }).renderLegend?.(null)
  }, [settings, params, ready])

  // Bars built from live ticks, kept until the REST series catches up: it lags a minute or two, and swapping it in
  // used to wipe the newest bars until the next refresh, so they blinked in and out
  const liveKrx = useRef(new Map<number, Bar>())
  const livePerp = useRef(new Map<number, ChartSeries['perp'][number]>())
  const livePerpKrw = useRef(new Map<number, Bar>())
  const krxLast = useRef<Bar | null>(null)

  // Data: replace series data, then set the default range once per chart
  const placed = useRef(false)
  useEffect(() => {
    placed.current = false
    setCard(null)
    liveKrx.current.clear()
    livePerp.current.clear()
    livePerpKrw.current.clear()
  }, [asset.id, interval, theme]) // the chart is rebuilt on a theme change, so place the range again
  useEffect(() => {
    const c = ctl.current
    if (!c) return
    const krx = mergeLive(data.krx, liveKrx.current)
    const perp = mergeLive(data.perp, livePerp.current)
    const perpKrw = mergeLive(data.perpKrw, livePerpKrw.current)
    krxLast.current = krx.at(-1) ? { ...krx.at(-1)! } : null
    const merged = krx === data.krx && perp === data.perp && perpKrw === data.perpKrw ? data : { ...data, krx, perp, perpKrw }
    c.setInput({ data: merged, spans, news, events, prediction })
    ;(c as unknown as { renderLegend?: (t: null) => void }).renderLegend?.(null)
    if (!placed.current) {
      placed.current = true
      const lastT = Math.max(data.perp.at(-1)?.t ?? 0, data.krx.at(-1)?.t ?? 0)
      // Daily: the last year; intraday: about a session or two
      const spanMs = interval === '1d' ? 365 * 86400_000 : interval === '1h' ? 10 * 86400_000 : interval === '15m' ? 3 * 86400_000 : interval === '5m' ? 86400_000 : 8 * 3600_000
      const ts = c.chart.timeScale()
      ts.setVisibleRange({ from: ct(lastT - spanMs), to: ct(lastT) })
      // setVisibleRange pins the last bar to the edge; push it left by the same gap the price tags need.
      // Next frame: a chart created a moment ago has no width yet, and the gap would come out as 0
      requestAnimationFrame(() => {
        if (ctl.current !== c) return
        const r = ts.getVisibleLogicalRange()
        const w = ts.width()
        const gap = rightGapPx(w)
        if (r && w > gap) ts.setVisibleLogicalRange({ from: r.from, to: r.to + ((r.to - r.from) * gap) / (w - gap) })
      })
    }
  }, [data, spans, news, events, prediction, ready, interval])

  useEffect(() => {
    if (!card) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCard(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card])

  // Session kind of a live bar, read the same way as the background spans above
  const liveKind = (t: number): Span['kind'] => (sessionAt(interval === '1d' ? t + 3600_000 : t, holidays) === 'closed' ? 'closed' : 'open')

  // Live: last perp bar from the Hyperliquid WS (converted with the live Upbit rate)
  useEffect(() => {
    return useLive.subscribe((s, prev) => {
      const key = `${asset.perp}:${interval}`
      const k = s.candle[key]
      if (!k || k === prev.candle[key]) return
      const c = ctl.current
      if (!c) return
      const rate = asset.fx ? (s.usdc?.rate ?? arb?.fx?.rate ?? 0) : 1
      const last = data.perp.at(-1)
      if (!rate || (last && k.t < last.t)) return
      const { line, candle } = c.perpSeries
      livePerp.current.set(k.t, { t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v, krw: k.c * rate })
      livePerpKrw.current.set(k.t, { t: k.t, o: k.o * rate, h: k.h * rate, l: k.l * rate, c: k.c * rate, v: k.v })
      c.followLive(k.t, liveKind(k.t))
      try {
        candle?.update({ time: ct(k.t), open: k.o * rate, high: k.h * rate, low: k.l * rate, close: k.c * rate })
        line?.update({ time: ct(k.t), value: k.c * rate })
      } catch {
        // ignore out-of-order ticks right after a data swap
      }
    })
  }, [asset, interval, data.perp, arb?.fx?.rate])

  // Live: last KRX bar from Toss Securities trades
  useEffect(() => {
    const step = STEP_MS[interval]
    return useLive.subscribe((s, prev) => {
      const tr = s.krxTrade[asset.krxCode]
      if (!tr || tr === prev.krxTrade[asset.krxCode]) return
      const series = ctl.current?.krxSeries as ISeriesApi<'Candlestick'> | null
      if (!series) return
      const t = interval === '1d' ? Math.floor((tr.t + 9 * 3600_000) / 86400_000) * 86400_000 : Math.floor(tr.t / step) * step
      const last = krxLast.current
      if (last && t < last.t) return
      const bar: Bar = last && last.t === t ? { ...last, h: Math.max(last.h, tr.price), l: Math.min(last.l, tr.price), c: tr.price, v: last.v + tr.volume } : { t, o: tr.price, h: tr.price, l: tr.price, c: tr.price, v: tr.volume }
      krxLast.current = bar
      liveKrx.current.set(bar.t, bar)
      ctl.current?.followLive(bar.t, liveKind(bar.t))
      try {
        series.update({ time: ct(bar.t) as UTCTimestamp, open: bar.o, high: bar.h, low: bar.l, close: bar.c })
      } catch {
        // ignore out-of-order ticks right after a data swap
      }
    })
  }, [asset.krxCode, interval])

  // A grey title with a '?' over each sub-pane (canvas pane titles cannot carry a tooltip); new indicators get one too
  const [paneTops, setPaneTops] = useState<{ pane: SubPane; top: number }[]>([])
  useEffect(() => {
    const c = ctl.current
    if (!c || !box.current) return
    const update = () => setPaneTops(c.subPaneTops())
    const raf = requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(box.current)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [ready, settings, params])

  return (
    <div className="chart">
      <div ref={box} className="chart__canvas" />
      {paneTops.map(({ pane, top }) => (
        <div key={pane} className="pane-label" style={{ top: top + 4 }}>
          {PANE_INFO[pane].title(params)}
          <Help text={PANE_INFO[pane].help} />
        </div>
      ))}
      <div ref={legend} className="chart__legend num" />
      <div ref={tip} className="chart__tip" hidden />
      {card && ctl.current && <BarCard card={card} interval={interval} lookup={ctl.current.lookup} news={news} onClose={() => setCard(null)} boxW={box.current?.clientWidth ?? 800} isIdx={asset.kind === 'index'} />}
      {!data.krx.length && settings.showKrx && <div className="chart__empty">이 구간에는 국내 시세가 없어요.</div>}
      {asset.kind === 'stock' && <ChartNotes ctl={ctl} legend={legend} ready={ready} arb={arb} prediction={settings.forecast ? prediction : null} onPredict={onPredict} onArb={onArb} />}
    </div>
  )
}

/**
 * REST bars plus any newer bars built from live ticks. Live bars the REST data already covers are dropped;
 * for the bar both have, keep the REST open and take the live close and the wider high/low
 */
function mergeLive<T extends Bar>(rest: T[], live: Map<number, T>): T[] {
  const restLast = rest.at(-1)?.t ?? -Infinity
  for (const t of [...live.keys()]) if (t < restLast) live.delete(t)
  if (!live.size) return rest
  const out = rest.slice()
  for (const b of [...live.values()].sort((x, y) => x.t - y.t)) {
    const r = out[out.length - 1]
    if (r && r.t === b.t) out[out.length - 1] = { ...r, ...b, o: r.o, h: Math.max(r.h, b.h), l: Math.min(r.l, b.l), v: Math.max(r.v, b.v) }
    else out.push(b)
  }
  return out
}

/** Title and plain explanation for each sub-pane */
const PANE_INFO: Record<SubPane, { title: (p: IndicatorParams) => string; help: string }> = {
  volume: {
    title: () => '거래량',
    help: '막대 하나가 그 시간 동안 거래된 양이에요. 국내 시장(주식 수)과 하이퍼리퀴드(계약 수)는 단위가 달라서 각자 높이에 맞춰 겹쳐 그려요. 양을 서로 비교하기보다 언제 거래가 몰렸는지 보는 용도예요.',
  },
  premium: {
    title: () => '가격 차이 %',
    help: '하이퍼리퀴드 가격(원화)이 국내 가격보다 몇 % 비싼지(+, 빨강) 싼지(−, 파랑)예요. 국내 시장이 닫힌 동안에는 국내 마지막 가격과 비교해요.',
  },
  follow: {
    title: () => '따라간 정도 %',
    help: '국내 장이 시작할 때마다 막대 하나예요. 밤사이 하이퍼리퀴드가 움직인 만큼을 100으로 볼 때, 국내가 얼마나 움직여 시작했는지예요. 100이면 같은 만큼, 146이면 1.46배 더, 50이면 절반만, 0 아래면 반대로 시작했어요. 1% 넘게 움직인 밤만 그려요.',
  },
  funding: {
    title: () => '펀딩비 (1시간)',
    help: '하이퍼리퀴드에서 1시간마다 롱과 숏이 서로 주고받는 비용이에요. +면 롱(매수)이 숏에게 내요. 하이퍼리퀴드 가격이 기초 가격보다 비쌀수록 커져요.',
  },
  rsi: {
    title: (p) => `RSI ${p.rsi.period}`,
    help: '최근 오른 폭과 내린 폭으로 0~100 사이 값을 만든 지표예요. 위 점선(과열)보다 높으면 많이 올랐다는 뜻, 아래 점선보다 낮으면 많이 내렸다는 뜻으로 많이 봐요.',
  },
  macd: {
    title: (p) => `MACD ${p.macd.fast}·${p.macd.slow}·${p.macd.signal}`,
    help: '짧은 평균선과 긴 평균선의 차이(파란 선)와 그 평균(주황 선)이에요. 막대는 둘의 차이로, 0 위로 커지면 오르는 힘이, 아래로 커지면 내리는 힘이 세진다는 뜻으로 봐요.',
  },
}

/**
 * Notes on the chart, pinned to a price like order lines in a brokerage chart:
 * the spread opportunity sits on the Hyperliquid price, tomorrow's forecast on its expected price.
 * While the domestic market trades there is no forecast yet, so a small note sits at the top instead
 */
function ChartNotes({ ctl, legend, ready, arb, prediction, onPredict, onArb }: { ctl: React.RefObject<ChartController | null>; legend: React.RefObject<HTMLDivElement | null>; ready: number; arb: ArbSnapshot | null; prediction: Prediction | null; onPredict: () => void; onArb: () => void }) {
  const arbEl = useRef<HTMLDivElement>(null)
  // The 'before close' note reads as one more legend row: right under the legend, whatever its height
  const [legendBottom, setLegendBottom] = useState(48)
  useEffect(() => {
    const el = legend.current
    if (!el) return
    const ro = new ResizeObserver(() => setLegendBottom(el.offsetTop + el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [legend])
  const fcEl = useRef<HTMLDivElement>(null)
  // Only a tradable spread gets a note (and its line); the usual gap is not news
  const arbPrice = arb && arbKind(arb) === 'go' ? arb.perpKrw : null
  const fc = prediction && predictionReady(prediction) ? prediction : null
  const now = useNow(60_000)
  const night = nightStage(prediction?.targetOpenAt ?? now, now)

  useEffect(() => {
    ctl.current?.setArbLine(arbPrice)
  }, [ctl, ready, arbPrice])

  // Follow zoom, scroll and rescale: place the notes every frame (two reads, no re-render)
  useEffect(() => {
    let raf = 0
    const place = (el: HTMLDivElement | null, price: number | null) => {
      const c = ctl.current
      if (!el) return
      const y = c && price != null ? c.yOf(price) : null
      if (!c || y == null || y < 24 || y > c.mainPaneHeight - 8) {
        el.hidden = true
        return
      }
      el.hidden = false
      el.style.right = `${c.axisWidth + 6}px`
      // Sit just above or just below the price, on the side where the latest bars under the note are not:
      // centred on the price it covered the newest part of the line (a quiet weekend vanished behind it)
      // The grey line under the note is wider than the note: both count, so neither covers the newest bars
      const sub = el.querySelector<HTMLElement>('.cnote__sub')
      const h = el.offsetHeight + (sub ? sub.offsetHeight + 4 : 0)
      const w = Math.max(el.offsetWidth, sub?.offsetWidth ?? 0)
      // Clear the price and the axis chips right next to it (each chip about 22px tall)
      const near = c.lastChipYs().filter((cy) => Math.abs(cy - y) < 40)
      const top = Math.min(y, ...near.map((cy) => cy - 11))
      const bottom = Math.max(y, ...near.map((cy) => cy + 11))
      const above: [number, number] = [top - 6 - h, top - 6]
      const below: [number, number] = [bottom + 6, bottom + 6 + h]
      const span = c.perpYSpan(c.plotWidth - 6 - w)
      const cover = ([a, b]: [number, number]) => (span ? Math.max(0, Math.min(b, span.bottom) - Math.max(a, span.top)) : 0)
      const fits = ([a, b]: [number, number]) => a >= 0 && b <= c.mainPaneHeight
      const useBelow = fits(below) && (!fits(above) || cover(below) < cover(above))
      const box = useBelow ? below : above
      el.style.top = `${Math.round(box[0] + el.offsetHeight / 2)}px`
    }
    const tick = () => {
      place(arbEl.current, arbPrice)
      place(fcEl.current, fc?.perpKrw ?? null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ctl, arbPrice, fc?.perpKrw])

  return (
    <>
      {arb && arbPrice != null && (
        <div ref={arbEl} className="cnote cnote--arb" hidden>
          <span className="cnote__label">시세차익</span>
          <span>
            1천만원이면 약 <b className="up">{fmtWon(Math.round(arb.net.netKrw ?? arb.net.netKrwPer10m))}원</b> 남아요
          </span>
          <button className="cnote__btn cnote__btn--key" onClick={onArb}>
            시세차익 내기
          </button>
          {depthNote(arb) && <span className="cnote__sub">{depthNote(arb)}</span>}
        </div>
      )}
      {fc && (
        <div ref={fcEl} className="cnote" hidden>
          <span className="cnote__label">하이퍼리퀴드 지금</span>
          <OracleTag p={fc} />
          <span>
            {fmtPrice(fc.perpKrw)}원 <b className={tone(fc.perpGapPct)}>{fmtPct(fc.perpGapPct)}</b>
          </span>
          <button className="cnote__btn" onClick={onPredict}>
            자세히
          </button>
          {/* How much this number can still move before the open (US session) */}
          <span className="cnote__sub">{[night.text, followText(fc)].filter(Boolean).join(' · ')}</span>
        </div>
      )}
      {prediction && !predictionReady(prediction) && (
        <div className="cnote--top" style={{ top: legendBottom + 4 }}>
          <span className="cnote__label">밤사이 해외 가격</span>
          <span className="faint">저녁 8시 국내 시장이 닫히면 보여드려요</span>
        </div>
      )}
    </>
  )
}

/** News tooltip date: 'M/D (요일)', one colour for every day (red read like 'buy' or 'important') */
function tipDate(key: string) {
  const p = dateKeyParts(key)
  return `${p.md} (${p.dow})`
}

export const Chart = memo(ChartImpl)

function cardTitle(t: number, interval: ChartInterval) {
  const d = new Date(t * 1000) // chart time is already shifted to KST
  const day = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
  return interval === '1d' ? day : `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Venue of a bar (clock-based; holidays read as 휴장 by the chart's background already) */
function sessionLabel(t: number) {
  const v = venueAt(t * 1000)
  if (v === 'weekend') return '주말 · 하이퍼리퀴드만 거래'
  if (v === 'closed') return `${SESSION_LABEL.closed} · 하이퍼리퀴드만 거래`
  return SESSION_LABEL[v]
}

/** Info card pinned where the user clicked */
function BarCard({ card, interval, lookup, news, onClose, boxW, isIdx }: { card: { x: number; y: number; t: number }; interval: ChartInterval; lookup: Lookup; news: NewsMarker[]; onClose: () => void; boxW: number; isIdx: boolean }) {
  const k = lookup.krx.get(card.t)
  const p = lookup.perp.get(card.t)
  const pr = lookup.prem.get(card.t)
  const dayKey = cardTitle(card.t, '1d').replace(/\./g, '')
  const n = news.find((x) => x.date === dayKey)
  const left = card.x + 16 + 300 > boxW ? card.x - 316 : card.x + 16
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
            <dt>국내 시작 · 종가</dt>
            <dd>
              {fmtPrice(k.o)} → {fmtPrice(k.c)}원
            </dd>
          </div>
          <div className="kv">
            <dt>국내 고가 · 저가</dt>
            <dd>
              {fmtPrice(k.h)} / {fmtPrice(k.l)}원
            </dd>
          </div>
          <div className="kv">
            <dt>국내 거래량</dt>
            <dd>{fmtKoreanUnit(k.v)}주</dd>
          </div>
        </>
      )}
      {p && (
        <>
          <div className="kv">
            <dt>하이퍼리퀴드 종가</dt>
            <dd>{isIdx ? fmtPrice(p.c, true) : `${fmtPrice(p.c)}원`}</dd>
          </div>
          <div className="kv">
            <dt>하이퍼리퀴드 거래대금</dt>
            {/* Volume × typical price, both already in KRW at that bar's USDC rate */}
            <dd>{isIdx ? `약 ${fmtUsdCompact(p.v * p.usd)}` : `약 ${fmtWonUnit((p.v * (p.h + p.l + p.c)) / 3)}원`}</dd>
          </div>
        </>
      )}
      {pr && (
        <div className="kv">
          <dt>{pr.live ? '가격 차이' : '직전 종가 대비'}</dt>
          <dd className={pr.v > 0 ? 'up' : pr.v < 0 ? 'down' : ''}>{fmtPct(pr.v)}</dd>
        </div>
      )}
      {interval !== '1d' && (
        <div className="kv">
          <dt>시간대</dt>
          <dd>{sessionLabel(card.t)}</dd>
        </div>
      )}
      {n && <p className="chart__card-news">{n.title}</p>}
    </div>
  )
}
