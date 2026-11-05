import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { sessionAt } from '../../shared/session'
import { fmtKoreanUnit, fmtPct, fmtPrice } from '../lib/format'
import { useLive } from '../lib/live'
import { ChartController, css, ct, MA_COLORS, STEP_MS, type Lookup } from './chartController'
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
}

function ChartImpl({ asset, interval, data, news, events, prediction, arb, settings, params, theme, onNews }: Props) {
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
  // Session background spans (perp bars are continuous, so use them as the time grid)
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
          `<div class="row"><i class="lg-dot" style="background:${krxC}"></i><span>정규장</span><span class="k">시작</span><b class="${cls(k.o, k.o)}">${f(k.o)}</b><span class="k">고가</span><b class="${cls(k.h, k.o)}">${f(k.h)}</b><span class="k">저가</span><b class="${cls(k.l, k.o)}">${f(k.l)}</b><span class="k">종가</span><b class="${cls(k.c, k.o)}">${f(k.c)}</b></div>`,
        )
      if (p)
        rows.push(
          `<div class="row"><i class="lg-dot" style="background:${perpC}"></i><span>하이퍼리퀴드</span><b>${f(p.c)}${asset.kind === 'index' ? '' : '원'}</b>${pr ? `<span class="k">${pr.live ? '괴리' : '종가 대비'}</span><b class="${pr.v > 0 ? 'up' : pr.v < 0 ? 'down' : ''}">${fmtPct(pr.v)}</b>` : ''}</div>`,
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
          .map((n) => `<div class="tip-row"><span class="tip-date">${+n.date.slice(4, 6)}/${+n.date.slice(6, 8)}</span><span>${n.title.replace(/</g, '&lt;')}</span></div>`)
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

  // Data: replace series data, then set the default range once per chart
  const placed = useRef(false)
  useEffect(() => {
    placed.current = false
    setCard(null)
  }, [asset.id, interval])
  useEffect(() => {
    const c = ctl.current
    if (!c) return
    c.setInput({ data, spans, news, events, prediction })
    ;(c as unknown as { renderLegend?: (t: null) => void }).renderLegend?.(null)
    if (!placed.current) {
      placed.current = true
      const lastT = Math.max(data.perp.at(-1)?.t ?? 0, data.krx.at(-1)?.t ?? 0)
      // Daily: the last year; intraday: about a session or two
      const spanMs = interval === '1d' ? 365 * 86400_000 : interval === '1h' ? 10 * 86400_000 : interval === '15m' ? 3 * 86400_000 : interval === '5m' ? 86400_000 : 8 * 3600_000
      c.chart.timeScale().setVisibleRange({ from: ct(lastT - spanMs), to: ct(lastT) })
    }
  }, [data, spans, news, events, prediction, ready, interval])

  useEffect(() => {
    if (!card) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCard(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card])

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
      try {
        candle?.update({ time: ct(k.t), open: k.o * rate, high: k.h * rate, low: k.l * rate, close: k.c * rate })
        line?.update({ time: ct(k.t), value: k.c * rate })
      } catch {
        // ignore out-of-order ticks right after a data swap
      }
    })
  }, [asset, interval, data.perp, arb?.fx?.rate])

  // Live: last KRX bar from Toss Securities trades
  const krxLast = useRef<Bar | null>(null)
  useEffect(() => {
    krxLast.current = data.krx.at(-1) ? { ...data.krx.at(-1)! } : null
  }, [data.krx])
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
      try {
        series.update({ time: ct(bar.t) as UTCTimestamp, open: bar.o, high: bar.h, low: bar.l, close: bar.c })
      } catch {
        // ignore out-of-order ticks right after a data swap
      }
    })
  }, [asset.krxCode, interval])

  return (
    <div className="chart">
      <div ref={box} className="chart__canvas" />
      <div ref={legend} className="chart__legend num" />
      <div ref={tip} className="chart__tip" hidden />
      {card && ctl.current && <BarCard card={card} interval={interval} lookup={ctl.current.lookup} news={news} onClose={() => setCard(null)} boxW={box.current?.clientWidth ?? 800} />}
      {!data.krx.length && settings.showKrx && <div className="chart__empty">이 구간에는 국내 시세가 없어요.</div>}
    </div>
  )
}

export const Chart = memo(ChartImpl)

function cardTitle(t: number, interval: ChartInterval) {
  const d = new Date(t * 1000) // chart time is already shifted to KST
  const day = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
  return interval === '1d' ? day : `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function sessionLabel(t: number) {
  const d = new Date(t * 1000)
  const wd = d.getUTCDay()
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (wd === 0 || wd === 6) return '주말 · 하이퍼리퀴드만 거래'
  if (m >= 540 && m < 930) return '정규장'
  if ((m >= 480 && m < 540) || (m >= 930 && m < 1200)) return '넥스트레이드'
  return '휴장 · 하이퍼리퀴드만 거래'
}

/** Info card pinned where the user clicked */
function BarCard({ card, interval, lookup, news, onClose, boxW }: { card: { x: number; y: number; t: number }; interval: ChartInterval; lookup: Lookup; news: NewsMarker[]; onClose: () => void; boxW: number }) {
  const k = lookup.krx.get(card.t)
  const p = lookup.perp.get(card.t)
  const pr = lookup.prem.get(card.t)
  const dayKey = cardTitle(card.t, '1d').replace(/\./g, '')
  const n = news.find((x) => x.date === dayKey)
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
            <dt>정규장 시작 · 종가</dt>
            <dd>
              {fmtPrice(k.o)} → {fmtPrice(k.c)}
            </dd>
          </div>
          <div className="kv">
            <dt>정규장 고가 · 저가</dt>
            <dd>
              {fmtPrice(k.h)} / {fmtPrice(k.l)}
            </dd>
          </div>
          <div className="kv">
            <dt>정규장 거래량</dt>
            <dd>{fmtKoreanUnit(k.v)}주</dd>
          </div>
        </>
      )}
      {p && (
        <>
          <div className="kv">
            <dt>하이퍼리퀴드 종가</dt>
            <dd>{fmtPrice(p.c)}</dd>
          </div>
          <div className="kv">
            <dt>하이퍼리퀴드 거래량</dt>
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
          <dd>{sessionLabel(card.t)}</dd>
        </div>
      )}
      {n && <p className="chart__card-news">{n.title}</p>}
    </div>
  )
}
