import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { NewsSheet } from '../components/NewsSheet'
import { SessionBadge } from '../components/SessionBadge'
import { AssetStrip } from '../components/AssetStrip'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, fmtUsd, fmtUsdCompact, tone } from '../lib/format'
import { subscribeHl, subscribeUsdc, useLive } from '../lib/live'
import { usePrefs } from '../lib/prefs'
import { useQuery } from '../lib/query'
import { Orderbook } from '../pro/Orderbook'
import { OrderPanel } from '../pro/OrderPanel'
import { ConvergenceTable, FlowsPanel, PredictPanel } from '../pro/Panels'
import type { ChartSettings } from '../pro/settings'

const Chart = lazy(() => import('../pro/Chart').then((m) => ({ default: m.Chart })))

const INTERVALS: ChartInterval[] = ['1m', '5m', '15m', '1h', '1d']
const INTERVAL_LABEL: Record<ChartInterval, string> = { '1m': '1분', '5m': '5분', '15m': '15분', '1h': '1시간', '1d': '일' }

const TOGGLES: { k: keyof ChartSettings; label: string; group: 'main' | 'ind' | 'pane' }[] = [
  { k: 'bands', label: '장 시간대', group: 'main' },
  { k: 'news', label: '뉴스', group: 'main' },
  { k: 'convergence', label: '개장 수렴', group: 'main' },
  { k: 'forecast', label: '예상 시가', group: 'main' },
  { k: 'ma', label: '이동평균', group: 'ind' },
  { k: 'ribbon', label: '그물망', group: 'ind' },
  { k: 'bb', label: '볼린저', group: 'ind' },
  { k: 'ichimoku', label: '일목균형', group: 'ind' },
  { k: 'vwap', label: 'VWAP', group: 'ind' },
  { k: 'volume', label: '거래량', group: 'pane' },
  { k: 'premium', label: '괴리율', group: 'pane' },
  { k: 'funding', label: '펀딩비', group: 'pane' },
  { k: 'rsi', label: 'RSI', group: 'pane' },
  { k: 'macd', label: 'MACD', group: 'pane' },
]

function LiveHeader({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  useEffect(() => subscribeHl({ type: 'activeAssetCtx', coin: asset.perp }), [asset.perp])
  const ctx = useLive((s) => s.ctx[asset.perp])
  const usdc = useLive((s) => s.usdc)
  if (!arb) return <div className="skeleton" style={{ height: 72 }} />
  const isIdx = asset.kind === 'index'
  const mid = ctx?.mid ?? arb.perp.mid
  const rate = asset.fx ? (usdc?.rate ?? arb.fx?.rate ?? 0) : 1
  const perpKrw = mid * rate
  const premium = (perpKrw / arb.krx.price - 1) * 100
  const funding = (ctx?.funding ?? arb.perp.fundingHourly) * 100
  return (
    <div className="quote-head">
      <div>
        <div className="row" style={{ gap: 8 }}>
          <h1 className="quote-head__name">{asset.name}</h1>
          <span className="faint num">{asset.kind === 'index' ? '지수' : asset.krxCode}</span>
          <SessionBadge session={arb.session} />
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <span className="quote-head__price num">{fmtPrice(arb.krx.price, isIdx)}</span>
          <span className={`num ${tone(arb.krx.changePct)}`} style={{ fontWeight: 500 }}>
            {fmtPct(arb.krx.changePct)}
          </span>
          <span className="faint" style={{ fontSize: 12 }}>
            KRX {arb.session === 'closed' ? '종가' : ''}
          </span>
        </div>
      </div>
      <dl className="quote-head__stats num">
        <div>
          <dt>perp 환산</dt>
          <dd>
            {fmtPrice(perpKrw, isIdx)}
            {asset.fx && <small> ${fmtUsd(mid)}</small>}
          </dd>
        </div>
        <div>
          <dt>{arb.mode === 'live' ? '괴리율' : '종가 대비'}</dt>
          <dd className={tone(premium)}>{fmtPct(premium)}</dd>
        </div>
        <div>
          <dt>순차익</dt>
          <dd className={arb.net.netPct > 0 ? 'up' : 'muted'}>{fmtPct(arb.net.netPct)}</dd>
        </div>
        {asset.fx && (
          <div>
            <dt>원/USDC</dt>
            <dd>{rate.toLocaleString('ko-KR')}</dd>
          </div>
        )}
        <div>
          <dt>펀딩 (1시간)</dt>
          <dd className={tone(funding)}>{funding.toFixed(4)}%</dd>
        </div>
        <div>
          <dt>미결제약정</dt>
          <dd>{fmtUsdCompact(arb.perp.openInterest * mid)}</dd>
        </div>
        <div>
          <dt>24h 거래대금</dt>
          <dd>{fmtUsdCompact(arb.perp.volume24hUsd)}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function ProTerminal({ asset }: { asset: Asset }) {
  const { interval, setInterval, chart: settings, toggle, theme } = usePrefs()
  const [bottom, setBottom] = useState<'predict' | 'conv' | 'flows'>('predict')
  const [openNews, setOpenNews] = useState<NewsMarker | null>(null)

  const arbAll = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const arb = arbAll.data?.items.find((x) => x.asset === asset.id) ?? null
  const series = useQuery<ChartSeries>(`/api/v1/series?asset=${asset.id}&interval=${interval}`, interval === '1d' ? 60_000 : 15_000)
  const news = useQuery<{ items: NewsMarker[] }>(`/api/v1/news?asset=${asset.id}`, 300_000)
  const conv = useQuery<{ events: OpenEvent[] }>(`/api/v1/convergence?asset=${asset.id}&limit=500`, 300_000)
  const pred = useQuery<Prediction>(`/api/v1/predict?asset=${asset.id}`, 15_000)
  const status = useQuery<{ kis: boolean }>('/api/v1/status', 60_000)

  useEffect(() => subscribeUsdc(), [])
  useEffect(() => subscribeHl({ type: 'candle', coin: asset.perp, interval }), [asset.perp, interval])

  const onNews = useCallback(
    (n: NewsMarker) => {
      track('news_open', { asset: asset.id, date: n.date, kind: n.kind })
      setOpenNews(n)
    },
    [asset.id],
  )

  return (
    <div className="page page--wide pro">
      <AssetStrip items={arbAll.data?.items} active={asset.id} />
      <LiveHeader asset={asset} arb={arb} />

      <div className="pro__main">
        <section className="card card--tight pro__chart">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="봉 간격">
              {INTERVALS.map((i) => (
                <button
                  key={i}
                  aria-pressed={interval === i}
                  onClick={() => {
                    setInterval(i)
                    track('chart_interval_change', { interval: i })
                  }}
                >
                  {INTERVAL_LABEL[i]}
                </button>
              ))}
            </div>
            <div className="toolbar__group">
              <button
                className="chip chip--sm"
                aria-pressed={settings.showKrx}
                onClick={() => {
                  toggle('showKrx')
                  track('chart_market_toggle', { market: 'krx', on: !settings.showKrx })
                }}
              >
                <span className="chip__dot" style={{ background: 'var(--krx)', outline: '1px solid var(--line-strong)' }} />
                KRX
              </button>
              <button
                className="chip chip--sm"
                aria-pressed={settings.showPerp}
                onClick={() => {
                  toggle('showPerp')
                  track('chart_market_toggle', { market: 'perp', on: !settings.showPerp })
                }}
              >
                <span className="chip__dot" style={{ background: 'var(--perp)' }} />
                perp
              </button>
            </div>
          </div>
          <div className="toolbar toolbar--sub">
            {(['main', 'ind', 'pane'] as const).map((g) => (
              <div className="toolbar__group" key={g}>
                {TOGGLES.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.k}
                    className="chip chip--sm"
                    aria-pressed={settings[t.k]}
                    onClick={() => {
                      toggle(t.k)
                      track('chart_indicator_toggle', { indicator: t.k, on: !settings[t.k] })
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="pro__chartbox">
            {series.data && series.data.asset === asset.id ? (
              <Suspense fallback={<div className="skeleton" style={{ height: '100%' }} />}>
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
              <p className="notice">{series.error.message}</p>
            ) : (
              <div className="skeleton" style={{ height: '100%' }} />
            )}
          </div>
          <div className="legend-row">
            <span>
              <i style={{ background: 'var(--band-regular)' }} />
              정규장 09:00~15:30
            </span>
            <span>
              <i style={{ background: 'var(--band-nxt)' }} />
              넥스트레이드만 08:00~09:00, 15:30~20:00
            </span>
            <span>
              <i style={{ background: 'var(--band-closed)' }} />
              휴장 (perp만 거래)
            </span>
            <span className="spacer" />
            <span className="faint">perp는 업비트 원/USDC로 환산 · 국내 시세 {series.data?.krxSource === 'kis' ? '한국투자증권' : '공개 시세(임시)'}</span>
          </div>
        </section>

        <aside className="pro__side">
          <Orderbook asset={asset} krxAvailable={!!status.data?.kis} />
          <OrderPanel asset={asset} arb={arb} />
        </aside>
      </div>

      <section className="card">
        <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
          <button role="tab" aria-selected={bottom === 'predict'} onClick={() => setBottom('predict')}>
            개장 예측
          </button>
          <button
            role="tab"
            aria-selected={bottom === 'conv'}
            onClick={() => {
              setBottom('conv')
              track('convergence_view', { asset: asset.id })
            }}
          >
            개장 수렴 이력
          </button>
          <button role="tab" aria-selected={bottom === 'flows'} onClick={() => setBottom('flows')}>
            투자자 동향
          </button>
        </div>
        {bottom === 'predict' && <PredictPanel p={pred.data ?? null} asset={asset} />}
        {bottom === 'conv' && <ConvergenceTable asset={asset} />}
        {bottom === 'flows' && <FlowsPanel asset={asset} />}
      </section>

      {openNews && <NewsSheet news={openNews} onClose={() => setOpenNews(null)} />}
    </div>
  )
}
