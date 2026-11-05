import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { sessionAt } from '../../shared/session'
import { SESSION_LABEL, venueAt } from '../lib/market'
import { dateKeyParts, fmtKoreanUnit, fmtPct, fmtPrice, fmtUsdCompact, fmtWon, fmtWonUnit } from '../lib/format'
import { useLive } from '../lib/live'
import { arbKind, arbText } from '../lib/arb'
import { NextOpenWhen, predictionReady } from '../components/NextOpenState'
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

  // Data: replace series data, then set the default range once per chart
  const placed = useRef(false)
  useEffect(() => {
    placed.current = false
    setCard(null)
  }, [asset.id, interval, theme]) // the chart is rebuilt on a theme change, so place the range again
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
      {card && ctl.current && <BarCard card={card} interval={interval} lookup={ctl.current.lookup} news={news} onClose={() => setCard(null)} boxW={box.current?.clientWidth ?? 800} isIdx={asset.kind === 'index'} />}
      {!data.krx.length && settings.showKrx && <div className="chart__empty">이 구간에는 국내 시세가 없어요.</div>}
      {asset.kind === 'stock' && <ChartNotes ctl={ctl} ready={ready} arb={arb} prediction={settings.forecast ? prediction : null} onPredict={onPredict} onArb={onArb} />}
    </div>
  )
}

/**
 * Notes on the chart, pinned to a price like order lines in a brokerage chart:
 * the spread opportunity sits on the Hyperliquid price, tomorrow's forecast on its expected price.
 * While the domestic market trades there is no forecast yet, so a small note sits at the top instead
 */
function ChartNotes({ ctl, ready, arb, prediction, onPredict, onArb }: { ctl: React.RefObject<ChartController | null>; ready: number; arb: ArbSnapshot | null; prediction: Prediction | null; onPredict: () => void; onArb: () => void }) {
  const arbEl = useRef<HTMLDivElement>(null)
  const fcEl = useRef<HTMLDivElement>(null)
  const arbPrice = arb && arb.mode === 'live' ? arb.perpKrw : null
  const fc = prediction && predictionReady(prediction) ? prediction : null

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
      el.style.top = `${Math.round(y)}px`
      el.style.right = `${c.axisWidth + 6}px`
    }
    const tick = () => {
      place(arbEl.current, arbPrice)
      place(fcEl.current, fc?.expectedOpen ?? null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ctl, arbPrice, fc?.expectedOpen])

  const t = arb ? arbText(arb) : null
  return (
    <>
      {arb && t && arbPrice != null && (
        <div ref={arbEl} className="cnote cnote--arb" hidden>
          <span className="cnote__label">시세차익</span>
          {arbKind(arb) === 'go' ? (
            <>
              <span>
                평소보다 {fmtPct(Math.abs(arb.deviationPct), 2, false)} 더 벌어졌어요 · 1천만원이면 약 <b>{fmtWon(Math.round(arb.net.netKrwPer10m))}원</b> 남아요
              </span>
              <button className="cnote__btn cnote__btn--key" onClick={onArb}>
                시세차익 내기
              </button>
            </>
          ) : (
            <span className="faint">{t.text}</span>
          )}
        </div>
      )}
      {fc && (
        <div ref={fcEl} className="cnote" hidden>
          <span className="cnote__label">내일 아침 예상</span>
          <span>
            {fmtPrice(fc.expectedOpen)}원 · 오를 확률 <b>{Math.round(fc.probUp * 100)}%</b>
          </span>
          <button className="cnote__btn" onClick={onPredict}>
            자세히
          </button>
        </div>
      )}
      {prediction && !predictionReady(prediction) && (
        <div className="cnote cnote--top">
          <span className="cnote__label">내일 예측</span>
          <span className="faint">
            장 마감 후 예측해요 · <NextOpenWhen at={prediction.targetOpenAt} />
          </span>
        </div>
      )}
    </>
  )
}

/** News tooltip date: 'M/D (요일)', weekend day name in red */
function tipDate(key: string) {
  const p = dateKeyParts(key)
  return `${p.md} (${p.weekend ? `<span class="dow--weekend">${p.dow}</span>` : p.dow})`
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
