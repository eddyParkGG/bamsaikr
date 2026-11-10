import { Chevron } from '../components/Icon'
import { Help } from '../components/Help'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { predictionReady } from '../components/NextOpenState'
import type { ArbSnapshot, ChartInterval, ChartSeries, NewsMarker, OpenEvent } from '../../shared/api'
import { canPredict, hasKrx, type Asset } from '../../shared/assets'
import { openSearch } from '../components/AssetSearch'
import { useArb, usePerps, usePrediction, useStatus, useUsdcRate } from '../lib/data'
import { toast } from '../components/Toast'
import { StockLogo } from '../components/Brand'
import { NewsSheet } from '../components/NewsSheet'
import { TodayIssue } from '../components/TodayIssue'
import { SessionBadge } from '../components/SessionBadge'
import { track } from '../lib/ga'
import { fmtKrw, fmtPct, fmtPrice, fmtWonUnit, tone } from '../lib/format'
import { subscribeHl, subscribeKrx, subscribeUsdc, useLive } from '../lib/live'
import { usePrefs } from '../lib/prefs'
import { fadeX } from '../lib/scrollFade'
import { usePhone } from '../lib/phone'
import { useQuery } from '../lib/query'
import { Orderbook } from '../pro/Orderbook'
import { OrderPanel } from '../pro/OrderPanel'
import { useTicket } from '../pro/ticket'
import { ConvergenceTable, FlowsPanel, PredictPanels } from '../pro/Panels'
import type { ChartSettings } from '../pro/settings'
import { ParamsSheet, type ParamKey } from '../pro/ParamsSheet'
import { readWidth, SplitHandle } from '../pro/SplitHandle'

const Chart = lazy(() => import('../pro/Chart').then((m) => ({ default: m.Chart })))

const INTERVALS: ChartInterval[] = ['1m', '5m', '15m', '1h', '1d']
const INTERVAL_LABEL: Record<ChartInterval, string> = { '1m': '1분', '5m': '5분', '15m': '15분', '1h': '1시간', '1d': '일' }

const MENU: { group: string; items: { k: keyof ChartSettings; label: string; help: string; swatch?: string[]; param?: ParamKey }[] }[] = [
  {
    group: '표시',
    items: [
      { k: 'bands', label: '장 시간대 배경', help: '국내 시장이 열린 시간과 닫힌 시간(휴장)을 배경색으로 나눠 보여줘요' },
      { k: 'news', label: '뉴스 말풍선', help: '가격이 크게 움직인 날의 주요 뉴스를 차트 위에 표시해요' },
      { k: 'convergence', label: '따라간 정도 %', help: '밤사이 하이퍼리퀴드가 1% 이상 움직인 날, 그 움직임을 아침 8시 국내 시장이 몇 % 따라 시작했는지 차트 아래 막대로 보여줘요. 점선(100%)에 닿으면 그대로, 절반 높이면 절반만 따라간 거예요' },
      { k: 'forecast', label: '밤사이 해외 가격 · 보통 시작 범위', help: '국내 시장이 닫힌 밤에, 지금 하이퍼리퀴드 가격과 다음 개장 때 국내 시장이 10번 중 8번은 시작한 범위를 그려요' },
    ],
  },
  {
    group: '가격 지표',
    items: [
      { k: 'ma', label: '이동평균선', help: '최근 N개 봉의 평균 가격을 이은 선이에요. 추세 방향을 볼 때 써요', swatch: ['#f5a623', '#f04251', '#a78bfa', '#8b95a1'], param: 'ma' },
      { k: 'ribbon', label: '이동평균 그물망', help: '기간이 다른 이동평균선 여러 개를 겹쳐 그려요. 선이 벌어지면 추세가 강해요', swatch: ['#3e9bff', '#7b8cff', '#a78bfa'] },
      { k: 'bb', label: '볼린저 밴드', help: '평균 가격 위아래로 변동폭만큼 띠를 그려요. 띠 밖으로 나가면 평소보다 많이 움직인 거예요', param: 'bb' },
      { k: 'ichimoku', label: '일목균형표', help: '기준선·전환선과 앞으로 26봉의 구름대로 지지와 저항을 봐요' },
      { k: 'vwap', label: 'VWAP', help: '거래량을 반영한 하루 평균 가격이에요. 이 선 위면 평균보다 비싸게 거래되는 중이에요' },
    ],
  },
  {
    group: '아래 패널',
    items: [
      { k: 'volume', label: '거래량 (시장별)', help: '국내 시장과 하이퍼리퀴드 거래량을 따로 보여줘요' },
      { k: 'premium', label: '가격 차이', help: '하이퍼리퀴드 가격이 국내 가격보다 몇 % 비싸거나 싼지 보여줘요' },
      { k: 'funding', label: '펀딩비', help: '하이퍼리퀴드에서 1시간마다 롱·숏이 주고받는 비용이에요. 플러스면 사려는 사람이 많아요' },
      { k: 'rsi', label: 'RSI', param: 'rsi', help: '최근 오른 힘과 내린 힘을 0~100으로 나타내요. 70 위는 과열, 30 아래는 침체로 봐요' },
      { k: 'macd', label: 'MACD', param: 'macd', help: '짧은 평균과 긴 평균의 차이예요. 시그널선을 위로 뚫으면 상승 전환 신호로 봐요' },
    ],
  },
]

/** Current parameters shown next to each indicator, e.g. "(14)" */
function paramText(k: ParamKey, p: ReturnType<typeof usePrefs.getState>['params']) {
  if (k === 'ma') return p.ma.join(' · ')
  if (k === 'bb') return `${p.bb.period}, ${p.bb.mult}`
  if (k === 'rsi') return `${p.rsi.period}`
  return `${p.macd.fast}, ${p.macd.slow}, ${p.macd.signal}`
}

function IndicatorMenu({ krxAvailable }: { krxAvailable: boolean }) {
  const { chart: settings, toggle, params } = usePrefs()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ParamKey | null>(null)
  // Where the popover hangs: under the button, right edges lined up
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !layerRef.current?.contains(e.target as Node) && setOpen(false)
    // The popover is fixed, so follow the button when the page or the toolbar scrolls
    const place = () => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, right: Math.max(12, window.innerWidth - r.right) })
    }
    place()
    document.addEventListener('mousedown', close)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
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
      {/* Rendered on <body>: the toolbar scrolls sideways and fades its edges, which would clip or fade anything inside it */}
      {(open || editing) &&
        createPortal(
          <div className="menu__layer" ref={layerRef}>
            {open && (
              <div className="menu__pop" role="menu" style={{ '--pop-top': `${pos.top}px`, '--pop-right': `${pos.right}px` } as React.CSSProperties}>
                <p className="menu__note">
                  {krxAvailable
                    ? '가격 지표는 국내 시장이 켜져 있으면 국내 시장 기준, 꺼져 있으면 하이퍼리퀴드 기준으로 그려요.'
                    : '이 종목은 국내 가격이 없어서 하이퍼리퀴드 기준으로 그려요.'}
                </p>
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
                        <span>
                          {i.label}
                          {i.param && <span className="faint"> ({paramText(i.param, params)})</span>}
                        </span>
                        <Help text={i.help} />
                        {i.swatch && (
                          <span className="menu__swatch">
                            {i.swatch.map((c) => (
                              <i key={c} style={{ background: c }} />
                            ))}
                          </span>
                        )}
                        {i.param && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="menu__gear"
                            aria-label={`${i.label} 설정`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditing(i.param!)
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                            </svg>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {editing && <ParamsSheet which={editing} onClose={() => setEditing(null)} />}
          </div>,
          document.body,
        )}
    </div>
  )
}

function Range({ low, high, value, isIdx }: { low: number; high: number; value: number; isIdx: boolean }) {
  const pos = high > low ? ((value - low) / (high - low)) * 100 : 50
  return (
    <span className="range num">
      {fmtKrw(low, isIdx)}
      <span className="range__bar">
        <i style={{ left: `calc(${Math.min(100, Math.max(0, pos)) / 100} * (100% - 4px))` }} />
      </span>
      {fmtKrw(high, isIdx)}
    </span>
  )
}

/** Name + code with a chevron that opens the asset search (like a brokerage PC stock header) */
function AssetName({ asset }: { asset: Asset }) {
  const code = asset.kind === 'stock' ? asset.krxCode : asset.kind === 'index' ? '지수' : asset.perp.replace('xyz:', '')
  return (
    <button className="asset-switch" onClick={openSearch} aria-label={`${asset.name}, 다른 종목 보기`}>
      <StockLogo id={asset.id} size={20} />
      {asset.name}
      <span className="stock-head__code">{code}</span>
      <Chevron />
    </button>
  )
}

/** Phone head: two prices side by side (label, price, how far it moved). Hidden above 720px, where the price line and
 *  the stats strip show instead */
function QuotePair({ cells }: { cells: { label: string; value: string; sub: React.ReactNode; dot?: 'krx' | 'perp' }[] }) {
  return (
    <div className="quote2 num">
      {cells.map((c) => (
        <div key={c.label} className="quote2__cell">
          <span className="quote2__label">
            {/* Same colours as the two markets on the chart */}
            {c.dot && <i className="quote2__dot" style={{ background: `var(--${c.dot})` }} />}
            {c.label}
          </span>
          <b className="quote2__value">{c.value}</b>
          <span className="quote2__sub">{c.sub}</span>
        </div>
      ))}
    </div>
  )
}

/** Live numbers for a Hyperliquid-only asset; null until the contract and (when converted) the USDC rate are in */
function usePerpLive(asset: Asset) {
  useEffect(() => subscribeHl({ type: 'activeAssetCtx', coin: asset.perp }), [asset.perp])
  const ctx = useLive((s) => s.ctx[asset.perp])
  const usdcRate = useUsdcRate()
  const p = usePerps(asset.id).item
  if (!p || (asset.fx && !usdcRate)) return null
  const rate = asset.fx ? usdcRate! : 1
  const mid = ctx?.mid ?? p.mid
  const prev = ctx?.prevDay ?? p.prevDay
  // contract notional is USDC for every product, index included
  return { p, rate, usdcKrw: usdcRate ?? 0, mid, prev, diff: (mid - prev) * rate, funding: (ctx?.funding ?? p.fundingHourly) * 100 }
}

/** Header for assets traded only on Hyperliquid (no domestic counterpart) */
function PerpHead({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  const live = usePerpLive(asset)
  if (!live) return <div className="skeleton" style={{ height: 60, margin: '12px 0 14px' }} />
  const isIdx = asset.kind === 'index'
  const { p, rate, usdcKrw, mid, prev, diff, funding } = live
  return (
    <div className="stock-head">
      <div className="stock-head__id">
        <div className="stock-head__name">
          <AssetName asset={asset} />
          <span className="badge">{asset.kind === 'adr' ? '미국 ADR · 하이퍼리퀴드 24시간' : '하이퍼리퀴드 24시간'}</span>
        </div>
        <div className="stock-head__price num">
          <b>
            {fmtKrw(mid * rate, isIdx)}
          </b>
          <span>24시간 전보다</span>
          <span className={tone(diff)}>
            {diff > 0 ? '+' : ''}
            {fmtKrw(diff, isIdx)} ({fmtPct(Math.abs((mid / prev - 1) * 100), 2, false)})
          </span>
        </div>
      </div>
      <QuotePair
        cells={[
          {
            label: '하이퍼리퀴드',
            dot: 'perp',
            value: fmtKrw(mid * rate, isIdx),
            sub: (
              <>
                24시간 전보다 <span className={tone(diff)}>{fmtPct((mid / prev - 1) * 100)}</span>
              </>
            ),
          },
          arb
            ? {
                label: `국내 보통주 ${asset.ratio}주`,
                dot: 'krx',
                value: `${fmtPrice(arb.krx.price)}원`,
                sub: (
                  <>
                    차이 <span className={tone((mid * rate) / arb.krx.price - 1)}>{fmtPct(((mid * rate) / arb.krx.price - 1) * 100)}</span>
                  </>
                ),
              }
            : {
                label: '24시간 거래대금',
                value: usdcKrw ? `${fmtWonUnit(p.volume24hUsd * usdcKrw)}원` : '-',
                sub: (
                  <>
                    펀딩 <span className={tone(funding)}>{funding.toFixed(4)}%</span>
                  </>
                ),
              },
        ]}
      />
      <PerpStats asset={asset} arb={arb} live={live} />
    </div>
  )
}

/** The Hyperliquid-only stats strip (a plain list in the phone 정보 tab) */
function PerpStats({ asset, arb, live, list }: { asset: Asset; arb: ArbSnapshot | null; live: NonNullable<ReturnType<typeof usePerpLive>>; list?: boolean }) {
  const isIdx = asset.kind === 'index'
  const { p, rate, usdcKrw, mid, prev, funding } = live
  return (
      <dl className={list ? 'stats stats--list' : 'stats'} ref={list ? undefined : fadeX}>
        <div className="stats__group">
          <dt>24시간 범위</dt>
          <dd>
            <Range low={Math.min(mid, prev) * rate} high={Math.max(mid, prev) * rate} value={mid * rate} isIdx={isIdx} />
          </dd>
          <dt>24시간 전</dt>
          <dd>
            {fmtKrw(prev * rate, isIdx)}
          </dd>
        </div>
        <div className="stats__group">
          <dt>USDC</dt>
          <dd>{asset.fx ? `${rate.toLocaleString('ko-KR')}원` : '환산 없음'}</dd>
          <dt>펀딩 (1시간)</dt>
          <dd className={tone(funding)}>{funding.toFixed(4)}%</dd>
        </div>
        <div className="stats__group">
          <dt>미결제약정</dt>
          <dd>{usdcKrw ? `${fmtWonUnit(p.openInterest * mid * usdcKrw)}원` : '-'}</dd>
          <dt>거래대금</dt>
          <dd>{usdcKrw ? `${fmtWonUnit(p.volume24hUsd * usdcKrw)}원` : '-'}</dd>
        </div>
        <div className="stats__group">
          <dt>최대 레버리지</dt>
          <dd>{p.maxLeverage}배</dd>
          {arb ? (
            <>
              <dt>국내 보통주 {asset.ratio}주</dt>
              <dd className={tone((mid * rate) / arb.krx.price - 1)}>
                {fmtPrice(arb.krx.price)}원 ({fmtPct(((mid * rate) / arb.krx.price - 1) * 100)})
              </dd>
            </>
          ) : (
            <>
              <dt>국내 비교</dt>
              <dd className="faint">{asset.kind === 'index' ? '국내 지수 실시간 없음' : '국내 상장 상품 없음'}</dd>
            </>
          )}
        </div>
      </dl>
  )
}

/** Live numbers for the stock head: domestic price from live trades, perp in KRW */
function useStockLive(asset: Asset, arb: ArbSnapshot | null) {
  const ctx = useLive((s) => s.ctx[asset.perp])
  const usdcRate = useUsdcRate()
  const trade = useLive((s) => s.krxTrade[asset.krxCode])
  if (!arb) return null
  const krxPrice = trade && trade.t > arb.updatedAt - 5000 ? trade.price : arb.krx.price
  const mid = ctx?.mid ?? arb.perp.mid
  const usdcKrw = usdcRate ?? arb.fx?.rate ?? 0
  const rate = asset.fx ? usdcKrw : 1
  const perpKrw = mid * rate
  const diff = krxPrice - arb.krx.prevClose
  return { ctx, krxPrice, mid, usdcKrw, rate, perpKrw, premium: (perpKrw / krxPrice - 1) * 100, diff, changePct: (diff / arb.krx.prevClose) * 100 }
}

function StockHead({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  useEffect(() => subscribeHl({ type: 'activeAssetCtx', coin: asset.perp }), [asset.perp])
  const live = useStockLive(asset, arb)
  if (!arb || !live) return <div className="skeleton" style={{ height: 60, margin: '12px 0 14px' }} />
  const isIdx = asset.kind === 'index'
  const { krxPrice, diff, changePct, perpKrw, premium } = live
  return (
    <div className="stock-head">
      <div className="stock-head__id">
        <div className="stock-head__name">
          <AssetName asset={asset} />
          <SessionBadge session={arb.session} />
        </div>
        <div className="stock-head__price num">
          <b>
            {fmtKrw(krxPrice, isIdx)}
          </b>
          <span>어제보다</span>
          <span className={tone(diff)}>
            {diff > 0 ? '+' : ''}
            {fmtKrw(diff, isIdx)} ({fmtPct(Math.abs(changePct), 2, false)})
          </span>
        </div>
      </div>
      <QuotePair
        cells={[
          {
            label: '국내 시장',
            dot: 'krx',
            value: fmtKrw(krxPrice, isIdx),
            sub: (
              <>
                어제보다 <span className={tone(diff)}>{fmtPct(changePct)}</span>
              </>
            ),
          },
          {
            label: '하이퍼리퀴드 환산',
            dot: 'perp',
            value: fmtKrw(perpKrw, isIdx),
            sub: (
              <>
                {arb.mode === 'live' ? '국내보다' : '종가보다'} <span className={tone(premium)}>{fmtPct(premium)}</span>
              </>
            ),
          },
        ]}
      />
      <StockStats asset={asset} arb={arb} live={live} />
    </div>
  )
}

/** The stock stats strip (a plain list in the phone 정보 tab) */
function StockStats({ asset, arb, live, list }: { asset: Asset; arb: ArbSnapshot; live: NonNullable<ReturnType<typeof useStockLive>>; list?: boolean }) {
  const isIdx = asset.kind === 'index'
  const { ctx, krxPrice, mid, usdcKrw, rate, perpKrw, premium } = live
  const funding = (ctx?.funding ?? arb.perp.fundingHourly) * 100
  return (
    <dl className={list ? 'stats stats--list' : 'stats'} ref={list ? undefined : fadeX}>
      <div className="stats__group">
        <dt>1일 범위</dt>
        <dd>{arb.krx.high ? <Range low={Math.min(arb.krx.low, krxPrice)} high={Math.max(arb.krx.high, krxPrice)} value={krxPrice} isIdx={isIdx} /> : '-'}</dd>
        <dt>하이퍼리퀴드 범위</dt>
        <dd>
          <Range low={Math.min(arb.perp.mid, ctx?.prevDay ?? arb.perp.mid) * rate} high={Math.max(arb.perp.mid, ctx?.prevDay ?? arb.perp.mid) * rate} value={perpKrw} isIdx={isIdx} />
        </dd>
      </div>
      <div className="stats__group">
        <dt>하이퍼리퀴드 환산</dt>
        <dd>
          {fmtKrw(perpKrw, isIdx)}
        </dd>
        <dt>{arb.mode === 'live' ? '가격 차이' : '종가 대비'}</dt>
        <dd className={tone(premium)}>
          {fmtPct(premium)}
          {arb.mode === 'live' && <span className="faint"> 평소 {fmtPct(arb.normalPremiumPct)}</span>}
        </dd>
      </div>
      <div className="stats__group">
        <dt title="가격 차이가 평소 수준으로 돌아온다고 볼 때, 수수료·세금·환전·펀딩비를 빼고 남는 비율이에요">비용 뺀 수익</dt>
        <dd className={tone(arb.net.netPct)}>{fmtPct(arb.net.netPct)}</dd>
        <dt>USDC</dt>
        <dd>{asset.fx ? `${rate.toLocaleString('ko-KR')}원` : '환산 없음'}</dd>
      </div>
      <div className="stats__group">
        <dt>펀딩 (1시간)</dt>
        <dd className={tone(funding)}>{funding.toFixed(4)}%</dd>
        <dt>미결제약정</dt>
        <dd>{fmtWonUnit(arb.perp.openInterest * mid * usdcKrw)}원</dd>
      </div>
      <div className="stats__group">
        <dt>하이퍼리퀴드 거래대금</dt>
        <dd>{fmtWonUnit(arb.perp.volume24hUsd * usdcKrw)}원</dd>
        <dt>최대 레버리지</dt>
        <dd>{arb.perp.maxLeverage}배</dd>
      </div>
    </dl>
  )
}

/** Phone-only 정보 tab: the stats strip as a readable list, the price-conversion note and the latest issues,
 *  moved here from the head so the chart gets the screen */
function InfoTab({ asset, arb, onNews }: { asset: Asset; arb: ArbSnapshot | null; onNews: (n: NewsMarker) => void }) {
  const stock = useStockLive(asset, arb)
  const perp = usePerpLive(asset)
  const stats =
    asset.kind === 'stock' ? (
      arb && stock ? <StockStats asset={asset} arb={arb} live={stock} list /> : null
    ) : perp ? (
      <PerpStats asset={asset} arb={arb} live={perp} list />
    ) : null
  return (
    <div className="info-tab">
      <TodayIssue asset={asset.id} limit={3} onOpen={onNews} />
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">시세 정보</span>
        </div>
        <div className="panel__body">
          {stats ?? <div className="skeleton" style={{ height: 240 }} />}
          <p className="info-tab__note">{asset.fx ? '하이퍼리퀴드 가격은 업비트 원/USDC로 원화 환산했어요' : '하이퍼리퀴드 지수 포인트 그대로예요'}</p>
        </div>
      </section>
    </div>
  )
}

type Tab = 'chart' | 'predict' | 'conv' | 'flows' | 'info'

// Phone: chart, order book and order form each scroll or pan on their own, so they take turns in one screen-high pane
type Pane = 'chart' | 'book' | 'order'
const PANES: [Pane, string][] = [
  ['chart', '차트'],
  ['book', '호가'],
  ['order', '주문'],
]
const PANE_KEY = 'bamsai-phone-pane'
function readPane(): Pane {
  try {
    const v = sessionStorage.getItem(PANE_KEY)
    return v === 'book' || v === 'order' ? v : 'chart'
  } catch {
    return 'chart'
  }
}

export default function ProTerminal({ asset }: { asset: Asset }) {
  const { interval, setInterval, chart: settings, toggle, theme, params } = usePrefs()
  const [tab, setTab] = useState<Tab>('chart')
  const [obW, setObW] = useState(() => readWidth('bamsai-ob-w'))
  const [orderW, setOrderW] = useState(() => readWidth('bamsai-order-w'))
  // Chart only, filling the window (toggle next to the background legend; Esc closes)
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const [openNews, setOpenNews] = useState<NewsMarker | null>(null)
  const [pane, setPane] = useState<Pane>(readPane)
  const choosePane = (p: Pane) => {
    setPane(p)
    try {
      sessionStorage.setItem(PANE_KEY, p)
    } catch {
      // storage blocked: the choice just isn't remembered
    }
  }

  const arbAll = useArb()
  const arb = arbAll.data?.items.find((x) => x.asset === asset.id) ?? null
  const series = useQuery<ChartSeries>(`/api/v1/series?asset=${asset.id}&interval=${interval}`, interval === '1d' ? 60_000 : 15_000)
  const news = useQuery<{ items: NewsMarker[] }>(`/api/v1/news?asset=${asset.id}`, 300_000)
  const predictable = canPredict(asset)
  const conv = useQuery<{ events: OpenEvent[] }>(predictable ? `/api/v1/convergence?asset=${asset.id}&limit=500` : null, 300_000)
  const pred = usePrediction(predictable ? asset.id : null)
  const status = useStatus()

  useEffect(() => subscribeUsdc(), [])
  // Funnel events (H2–H4): forecast and spread seen on the stock screen, once per asset
  useEffect(() => {
    if (pred.data) track('prediction_view', { asset: asset.id, from: 'stock', stage: pred.data.night?.stage, follow_rate: pred.data.night?.follow?.ratePct ?? undefined, ready: predictionReady(pred.data) })
  }, [!!pred.data, asset.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (arb) track('arb_view', { asset: asset.id, net_pct: arb.net.netPct, mode: arb.mode })
  }, [!!arb, asset.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (hasKrx(asset) ? subscribeKrx(asset.id, asset.krxCode) : undefined), [asset])
  useEffect(() => subscribeHl({ type: 'candle', coin: asset.perp, interval }), [asset.perp, interval])

  const onNews = useCallback(
    (n: NewsMarker) => {
      track('news_open', { asset: asset.id, date: n.date, kind: n.kind })
      setOpenNews(n)
    },
    [asset.id],
  )

  const phone = usePhone()
  // [key, label, shorter label for phones: all five tabs fit one line at 320px]
  const tabs: [Tab, string, string][] = [
    ['chart', '차트 · 호가', '차트·호가'],
    ...(predictable
      ? ([
          ['predict', '개장 전 가격', '개장 전'],
          ['conv', '지난 개장 기록', '지난 기록'],
          ['flows', '투자자 동향', '수급'],
        ] as [Tab, string, string][])
      : []),
    // Phones: the stats strip and the latest issue live here instead of above the chart
    ...(phone ? ([['info', '정보', '정보']] as [Tab, string, string][]) : []),
  ]
  useEffect(() => setTab('chart'), [asset.id])
  // The 정보 tab only exists on phones: leave it when the window grows past the breakpoint
  useEffect(() => {
    if (!phone && tab === 'info') setTab('chart')
  }, [phone, tab])
  const selectTab = (k: Tab) => {
    setTab(k)
    if (k === 'conv') track('convergence_view', { asset: asset.id })
    // H3: opening the evidence (forecast detail or the record) counts as checking the basis
    if (k === 'predict' || k === 'conv') track('model_explain_open', { asset: asset.id, tab: k })
  }

  // Chart, order book and order form fill the screen below the stock head: the page never scrolls.
  // 8px gap above, 60px = the page's bottom padding (bottom bar + margin)
  const headRef = useRef<HTMLDivElement>(null)
  const [chartH, setChartH] = useState(600)
  useEffect(() => {
    const measure = () => {
      const head = headRef.current
      if (!head) return
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60
      const top = Math.round(headerH + head.getBoundingClientRect().height + 8)
      setChartH(Math.max(480, Math.round(window.innerHeight - top - 60)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (headRef.current) ro.observe(headRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [tab])

  // Phone (CSS under max-width 720px reads these): while 차트 · 호가 is open the page stops scrolling and the
  // selected pane fills the screen from the bottom of the head (--pane-top) down to the pane switch.
  // The two table tabs do the same (without the switch): the table scrolls down and sideways inside one box,
  // instead of a box scrolling inside a scrolling page. The text tabs (개장 전 가격, 정보) scroll the page
  useEffect(() => {
    if (tab !== 'chart' && tab !== 'conv' && tab !== 'flows') return
    const root = document.documentElement
    root.classList.add('stock-panes')
    root.classList.toggle('stock-panes--switch', tab === 'chart')
    // The head is only fully visible at the top, and the page can't be scrolled back up in this mode
    if (window.matchMedia('(max-width: 720px)').matches) window.scrollTo(0, 0)
    const measure = () => {
      const head = headRef.current
      if (!head) return
      // Rounded up so a fractional head never pushes the page 1px taller than the screen
      const top = `${Math.ceil(head.getBoundingClientRect().bottom + window.scrollY)}px`
      // Only on a real change: writing the same value again would just re-trigger layout
      if (root.style.getPropertyValue('--pane-top') !== top) root.style.setProperty('--pane-top', top)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (headRef.current) ro.observe(headRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      root.classList.remove('stock-panes', 'stock-panes--switch')
      root.style.removeProperty('--pane-top')
    }
  }, [tab])
  // A price picked in the order book, or a spread-order shortcut, lands in the order form: show it on phones
  const pick = useTicket((s) => s.pick)
  const seenPick = useRef(pick)
  useEffect(() => {
    // Skip a pick left over from before this page opened
    if (pick && pick !== seenPick.current) choosePane('order')
    seenPick.current = pick
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => choosePane('order')
    window.addEventListener('bamsai:order-tab', on)
    return () => window.removeEventListener('bamsai:order-tab', on)
  }, [])

  return (
    <>
      <div ref={headRef}>
        {asset.kind === 'stock' ? <StockHead asset={asset} arb={arb} /> : <PerpHead asset={asset} arb={arb} />}
        <div className="ptabs-row">
          <div className="ptabs" role="tablist" ref={fadeX}>
            {tabs.map(([k, label, short]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => selectTab(k)}>
                {phone ? short : label}
              </button>
            ))}
          </div>
          {!phone && <TodayIssue asset={asset.id} limit={1} onOpen={onNews} inline />}
        </div>
      </div>

      {tab === 'chart' && (
        <div className="pro-grid" data-pane={pane} style={{ '--ob-w': `${obW}px`, '--order-w': `${orderW}px`, '--chart-h': `${chartH}px` } as React.CSSProperties}>
          <section className={full ? 'panel pro-chart pro-chart--full' : 'panel pro-chart'}>
            <div className="panel__head">
              <span className="panel__title">차트</span>
              <div className="chart-tools" ref={fadeX}>
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
                {hasKrx(asset) ? (
                <button
                  className="chip chip--mkt"
                  aria-pressed={settings.showKrx}
                  onClick={() => {
                    toggle('showKrx')
                    track('chart_market_toggle', { market: 'krx', on: !settings.showKrx })
                  }}
                >
                  <span className="chip__dot" style={{ background: settings.showKrx ? 'var(--krx)' : 'var(--text-3)' }} />
                  {asset.kind === 'stock' ? '국내 시장' : '국내 보통주'}
                </button>
                ) : (
                  <button
                    className="chip chip--disabled"
                    aria-disabled
                    onClick={() => toast(asset.kind === 'index' ? '코스피200은 국내 지수 실시간 시세가 없어서 하이퍼리퀴드 가격만 보여드려요' : `${asset.name}은 국내에 상장되지 않아서 하이퍼리퀴드 가격만 있어요`)}
                  >
                    <span className="chip__dot" style={{ background: 'var(--text-3)' }} />
                    국내 시장
                  </button>
                )}
                <button
                  className="chip chip--mkt"
                  aria-pressed={settings.showPerp}
                  onClick={() => {
                    toggle('showPerp')
                    track('chart_market_toggle', { market: 'perp', on: !settings.showPerp })
                  }}
                >
                  <span className="chip__dot" style={{ background: settings.showPerp ? 'var(--perp)' : 'var(--text-3)' }} />
                  하이퍼리퀴드
                </button>
                <span className="spacer" />
                <span className="band-legend" aria-label="차트 배경색">
                  <span>
                    <i style={{ background: 'var(--band-open-solid)' }} />
                    국장 개장
                  </span>
                  <span>
                    <i style={{ background: 'var(--band-closed-solid)' }} />
                    국장 휴장
                  </span>
                </span>
                <span className="chart-tools__sep" />
                <IndicatorMenu krxAvailable={hasKrx(asset)} />
                <button className="icon-btn chart-full" aria-label={full ? '차트 작게 보기' : '차트 크게 보기'} title={full ? '작게 보기 (Esc)' : '크게 보기'} onClick={() => setFull(!full)}>
                  {full ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  )}
                </button>
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
                    prediction={predictable ? (pred.data ?? null) : null}
                    arb={arb}
                    settings={settings}
                    params={params}
                    theme={theme}
                    onNews={onNews}
                    onPredict={() => {
                      selectTab('predict')
                      track('model_explain_open', { asset: asset.id, tab: 'predict', from: 'chart' })
                    }}
                    onArb={() => {
                      track('arb_cta_click', { asset: asset.id, from: 'chart', net_pct: arb?.net.netPct })
                      window.dispatchEvent(new CustomEvent('bamsai:order-tab', { detail: 'pair' }))
                    }}
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
              <span className="spacer" />
              <span>{asset.fx ? '하이퍼리퀴드 가격은 업비트 원/USDC로 원화 환산했어요' : '하이퍼리퀴드 지수 포인트 그대로예요'}</span>
            </div>
          </section>

          <SplitHandle width={obW} onChange={setObW} storageKey="bamsai-ob-w" label="호가 너비 조절" />
          <div className="pro-trade pro-trade--book">
            <Orderbook asset={asset} arb={arb} />
          </div>
          <SplitHandle width={orderW} onChange={setOrderW} storageKey="bamsai-order-w" label="주문 너비 조절" />
          <div className="pro-trade pro-trade--order">
            <OrderPanel asset={asset} arb={arb} liveKrx={!!status.data?.liveKrxOrders} />
          </div>
          {/* Phone only (hidden by CSS above 720px), fixed right above the bottom strip */}
          <div className="pane-switch" role="tablist" aria-label="차트 · 호가 · 주문">
            {PANES.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={pane === k} onClick={() => choosePane(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'predict' && <PredictPanels p={pred.data ?? null} asset={asset} />}
      {tab === 'conv' && (
        <section className="panel panel--fill" style={{ marginTop: 8, height: chartH }}>
          <ConvergenceTable asset={asset} />
        </section>
      )}
      {tab === 'flows' && (
        <section className="panel panel--fill" style={{ marginTop: 8, height: chartH }}>
          <div className="panel__head">
            <span className="panel__title">개인 · 외국인 · 기관</span>
          </div>
          <FlowsPanel asset={asset} />
        </section>
      )}
      {tab === 'info' && <InfoTab asset={asset} arb={arb} onNews={onNews} />}

      {openNews && <NewsSheet news={openNews} onClose={() => setOpenNews(null)} />}
    </>
  )
}
