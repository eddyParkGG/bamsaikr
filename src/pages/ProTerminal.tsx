import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction, Status } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { StockLogo } from '../components/Brand'
import { NewsSheet } from '../components/NewsSheet'
import { SessionBadge } from '../components/SessionBadge'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, fmtUsd, fmtUsdCompact, kstDay, tone, untilText } from '../lib/format'
import { subscribeHl, subscribeUsdc, useLive } from '../lib/live'
import { usePrefs } from '../lib/prefs'
import { useQuery } from '../lib/query'
import { Orderbook } from '../pro/Orderbook'
import { OrderPanel } from '../pro/OrderPanel'
import { ConvergenceTable, FlowsPanel, PredictPanels } from '../pro/Panels'
import type { ChartSettings } from '../pro/settings'

const Chart = lazy(() => import('../pro/Chart').then((m) => ({ default: m.Chart })))

const INTERVALS: ChartInterval[] = ['1m', '5m', '15m', '1h', '1d']
const INTERVAL_LABEL: Record<ChartInterval, string> = { '1m': '1분', '5m': '5분', '15m': '15분', '1h': '1시간', '1d': '일' }

const MENU: { group: string; items: { k: keyof ChartSettings; label: string; swatch?: string[] }[] }[] = [
  {
    group: '표시',
    items: [
      { k: 'bands', label: '장 시간대 배경' },
      { k: 'news', label: '뉴스 말풍선' },
      { k: 'convergence', label: '개장 수렴 %' },
      { k: 'forecast', label: '예상 시가 · 80% 구간' },
    ],
  },
  {
    group: '가격 지표',
    items: [
      { k: 'ma', label: '이동평균선 5 · 20 · 60 · 120', swatch: ['#f5a623', '#f04251', '#00b37e', '#8b95a1'] },
      { k: 'ribbon', label: '이동평균 그물망', swatch: ['#3e9bff', '#7b8cff', '#a78bfa'] },
      { k: 'bb', label: '볼린저 밴드 (20, 2)' },
      { k: 'ichimoku', label: '일목균형표' },
      { k: 'vwap', label: 'VWAP' },
    ],
  },
  {
    group: '아래 패널',
    items: [
      { k: 'volume', label: '거래량 (시장별)' },
      { k: 'premium', label: '괴리율' },
      { k: 'funding', label: '펀딩비' },
      { k: 'rsi', label: 'RSI (14)' },
      { k: 'macd', label: 'MACD (12, 26, 9)' },
    ],
  },
]

function IndicatorMenu() {
  const { chart: settings, toggle } = usePrefs()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const on = MENU.flatMap((g) => g.items).filter((i) => settings[i.k]).length
  return (
    <div className="menu" ref={ref}>
      <button className="chip" aria-pressed={open} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M3 17l6-6 4 4 8-8" />
        </svg>
        지표 <span className="faint">{on}</span>
      </button>
      {open && (
        <div className="menu__pop" role="menu">
          {MENU.map((g) => (
            <div key={g.group}>
              <div className="menu__group">{g.group}</div>
              {g.items.map((i) => (
                <button
                  key={i.k}
                  role="menuitemcheckbox"
                  aria-checked={settings[i.k]}
                  className="menu__item"
                  onClick={() => {
                    toggle(i.k)
                    track('chart_indicator_toggle', { indicator: i.k, on: !settings[i.k] })
                  }}
                >
                  <span className={`check ${settings[i.k] ? 'check--on' : ''}`}>
                    {settings[i.k] && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  {i.label}
                  {i.swatch && (
                    <span className="menu__swatch">
                      {i.swatch.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Range({ low, high, value, isIdx }: { low: number; high: number; value: number; isIdx: boolean }) {
  const pos = high > low ? ((value - low) / (high - low)) * 100 : 50
  return (
    <span className="range num">
      {fmtPrice(low, isIdx)}
      <span className="range__bar">
        <i style={{ left: `${Math.min(100, Math.max(0, pos))}%` }} />
      </span>
      {fmtPrice(high, isIdx)}
    </span>
  )
}

function StockHead({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  useEffect(() => subscribeHl({ type: 'activeAssetCtx', coin: asset.perp }), [asset.perp])
  const ctx = useLive((s) => s.ctx[asset.perp])
  const usdc = useLive((s) => s.usdc)
  if (!arb) return <div className="skeleton" style={{ height: 60, margin: '12px 0 14px' }} />
  const isIdx = asset.kind === 'index'
  const mid = ctx?.mid ?? arb.perp.mid
  const rate = asset.fx ? (usdc?.rate ?? arb.fx?.rate ?? 0) : 1
  const perpKrw = mid * rate
  const premium = (perpKrw / arb.krx.price - 1) * 100
  const funding = (ctx?.funding ?? arb.perp.fundingHourly) * 100
  const diff = arb.krx.price - arb.krx.prevClose
  return (
    <div className="stock-head">
      <div className="stock-head__id">
        <div className="stock-head__name">
          <StockLogo id={asset.id} size={20} />
          {asset.name}
          <span className="stock-head__code">{isIdx ? '지수' : asset.krxCode}</span>
          <SessionBadge session={arb.session} />
        </div>
        <div className="stock-head__price num">
          <b>
            {fmtPrice(arb.krx.price, isIdx)}
            {isIdx ? '' : '원'}
          </b>
          <span>어제보다</span>
          <span className={tone(diff)}>
            {diff > 0 ? '+' : ''}
            {fmtPrice(diff, isIdx)}
            {isIdx ? '' : '원'} ({fmtPct(Math.abs(arb.krx.changePct), 2, false)})
          </span>
        </div>
      </div>
      <dl className="stats">
        <div className="stats__group">
          <dt>1일 범위</dt>
          <dd>{arb.krx.high ? <Range low={arb.krx.low} high={arb.krx.high} value={arb.krx.price} isIdx={isIdx} /> : '-'}</dd>
          <dt>perp 범위</dt>
          <dd>
            <Range low={Math.min(arb.perp.mid, ctx?.prevDay ?? arb.perp.mid) * rate} high={Math.max(arb.perp.mid, ctx?.prevDay ?? arb.perp.mid) * rate} value={perpKrw} isIdx={isIdx} />
          </dd>
        </div>
        <div className="stats__group">
          <dt>perp 환산</dt>
          <dd>
            {fmtPrice(perpKrw, isIdx)}
            {asset.fx && <span className="faint"> ${fmtUsd(mid)}</span>}
          </dd>
          <dt>{arb.mode === 'live' ? '괴리율' : '종가 대비'}</dt>
          <dd className={tone(premium)}>{fmtPct(premium)}</dd>
        </div>
        <div className="stats__group">
          <dt>순차익</dt>
          <dd className={arb.net.netPct > 0 && arb.net.executable ? 'up' : ''}>{fmtPct(arb.net.netPct)}</dd>
          <dt>원/USDC</dt>
          <dd>{asset.fx ? rate.toLocaleString('ko-KR') : '환산 없음'}</dd>
        </div>
        <div className="stats__group">
          <dt>펀딩 (1시간)</dt>
          <dd className={tone(funding)}>{funding.toFixed(4)}%</dd>
          <dt>미결제약정</dt>
          <dd>{fmtUsdCompact(arb.perp.openInterest * mid)}</dd>
        </div>
        <div className="stats__group">
          <dt>perp 거래대금</dt>
          <dd>{fmtUsdCompact(arb.perp.volume24hUsd)}</dd>
          <dt>최대 레버리지</dt>
          <dd>{arb.perp.maxLeverage}배</dd>
        </div>
      </dl>
    </div>
  )
}

function NextOpenMini({ p, asset }: { p: Prediction | null; asset: Asset }) {
  if (!p) return <div className="panel skeleton" style={{ height: 150 }} />
  const isIdx = asset.kind === 'index'
  const up = p.probUp >= 0.5
  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">다음 시가</span>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 12 }}>
          {kstDay(p.targetOpenAt)} 09:00 · {untilText(p.targetOpenAt)}
        </span>
      </div>
      <div className="panel__body">
        <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <span className={`num ${up ? 'up' : 'down'}`} style={{ fontSize: 24, fontWeight: 800 }}>
            {Math.round((up ? p.probUp : 1 - p.probUp) * 100)}%
          </span>
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            {up ? '오를 확률' : '내릴 확률'}
          </span>
          <span className="spacer" />
          <span className="num strong" style={{ fontWeight: 700 }}>
            {fmtPrice(p.expectedOpen, isIdx)} <span className={tone(p.expectedGapPct)}>{fmtPct(p.expectedGapPct, 1)}</span>
          </span>
        </div>
        <div className="prob__bar" style={{ height: 6 }}>
          <i className="prob__up" style={{ width: `${p.probUp * 100}%` }} />
        </div>
        <p className="faint num" style={{ fontSize: 12, marginTop: 8 }}>
          80% 구간 {fmtPrice(p.band80.low, isIdx)} ~ {fmtPrice(p.band80.high, isIdx)} · 과거 적중 {p.backtest.hitRatePct}%
        </p>
      </div>
    </section>
  )
}

type Tab = 'chart' | 'predict' | 'conv' | 'flows'

export default function ProTerminal({ asset }: { asset: Asset }) {
  const { interval, setInterval, chart: settings, toggle, theme } = usePrefs()
  const [tab, setTab] = useState<Tab>('chart')
  const [openNews, setOpenNews] = useState<NewsMarker | null>(null)

  const arbAll = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const arb = arbAll.data?.items.find((x) => x.asset === asset.id) ?? null
  const series = useQuery<ChartSeries>(`/api/v1/series?asset=${asset.id}&interval=${interval}`, interval === '1d' ? 60_000 : 15_000)
  const news = useQuery<{ items: NewsMarker[] }>(`/api/v1/news?asset=${asset.id}`, 300_000)
  const conv = useQuery<{ events: OpenEvent[] }>(`/api/v1/convergence?asset=${asset.id}&limit=500`, 300_000)
  const pred = useQuery<Prediction>(`/api/v1/predict?asset=${asset.id}`, 15_000)
  const status = useQuery<Status>('/api/v1/status', 60_000)

  useEffect(() => subscribeUsdc(), [])
  useEffect(() => subscribeHl({ type: 'candle', coin: asset.perp, interval }), [asset.perp, interval])

  const onNews = useCallback(
    (n: NewsMarker) => {
      track('news_open', { asset: asset.id, date: n.date, kind: n.kind })
      setOpenNews(n)
    },
    [asset.id],
  )

  const tabs: [Tab, string][] = [
    ['chart', '차트 · 호가'],
    ['predict', '개장 예측'],
    ['conv', '개장 수렴 이력'],
    ['flows', '투자자 동향'],
  ]

  return (
    <>
      <StockHead asset={asset} arb={arb} />
      <div className="ptabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k)
              if (k === 'conv') track('convergence_view', { asset: asset.id })
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'chart' && (
        <div className="pro-grid">
          <section className="panel pro-chart">
            <div className="panel__head">
              <span className="panel__title">차트</span>
              <div className="chart-tools">
                <span className="chart-tools__sep" style={{ marginLeft: 4 }} />
                {INTERVALS.map((i) => (
                  <button
                    key={i}
                    className="chip"
                    aria-pressed={interval === i}
                    onClick={() => {
                      setInterval(i)
                      track('chart_interval_change', { interval: i })
                    }}
                  >
                    {INTERVAL_LABEL[i]}
                  </button>
                ))}
                <span className="chart-tools__sep" />
                <button
                  className="chip"
                  aria-pressed={settings.showKrx}
                  onClick={() => {
                    toggle('showKrx')
                    track('chart_market_toggle', { market: 'krx', on: !settings.showKrx })
                  }}
                >
                  <span className="chip__dot" style={{ background: settings.showKrx ? 'var(--krx)' : 'var(--text-3)' }} />
                  KRX
                </button>
                <button
                  className="chip"
                  aria-pressed={settings.showPerp}
                  onClick={() => {
                    toggle('showPerp')
                    track('chart_market_toggle', { market: 'perp', on: !settings.showPerp })
                  }}
                >
                  <span className="chip__dot" style={{ background: settings.showPerp ? 'var(--perp)' : 'var(--text-3)' }} />
                  perp
                </button>
                <span className="spacer" />
                <IndicatorMenu />
              </div>
            </div>
            <div className="chartbox">
              {series.data && series.data.asset === asset.id && series.data.interval === interval ? (
                <Suspense fallback={<div className="skeleton" style={{ position: 'absolute', inset: 12 }} />}>
                  <Chart
                    asset={asset}
                    interval={interval}
                    data={series.data}
                    news={news.data?.items ?? []}
                    events={conv.data?.events ?? []}
                    prediction={pred.data ?? null}
                    arb={arb}
                    settings={settings}
                    theme={theme}
                    onNews={onNews}
                  />
                </Suspense>
              ) : series.error ? (
                <p className="notice" style={{ margin: 16 }}>
                  {series.error.message}
                </p>
              ) : (
                <div className="skeleton" style={{ position: 'absolute', inset: 12 }} />
              )}
            </div>
            <div className="chart-foot">
              <span>
                <i style={{ background: 'var(--band-regular)' }} />
                정규장
              </span>
              <span>
                <i style={{ background: 'var(--band-nxt)' }} />
                넥스트레이드만
              </span>
              <span>
                <i style={{ background: 'var(--band-closed)' }} />
                휴장 · perp만 거래
              </span>
              <span className="spacer" />
              <span>perp는 업비트 원/USDC로 환산 · 국내 {series.data?.krxSource === 'kis' ? '한국투자증권' : '공개 시세(임시)'}</span>
            </div>
          </section>

          <div className="pro-col">
            <NextOpenMini p={pred.data ?? null} asset={asset} />
            <Orderbook asset={asset} krxAvailable={!!status.data?.kis} />
            <OrderPanel asset={asset} arb={arb} />
          </div>
        </div>
      )}

      {tab === 'predict' && <PredictPanels p={pred.data ?? null} asset={asset} />}
      {tab === 'conv' && (
        <section className="panel" style={{ marginTop: 8 }}>
          <div className="panel__head">
            <span className="panel__title">개장 수렴 이력</span>
            <span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>
              perp가 예고한 갭을 다음 날 시가가 얼마나 따라갔는지
            </span>
          </div>
          <ConvergenceTable asset={asset} />
        </section>
      )}
      {tab === 'flows' && (
        <section className="panel" style={{ marginTop: 8 }}>
          <div className="panel__head">
            <span className="panel__title">개인 · 외국인 · 기관</span>
          </div>
          <FlowsPanel asset={asset} />
        </section>
      )}

      {openNews && <NewsSheet news={openNews} onClose={() => setOpenNews(null)} />}
    </>
  )
}
