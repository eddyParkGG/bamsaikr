import { useEffect, useMemo, useState } from 'react'
import { IN_SESSION, NextOpenWhen, predictionReady } from '../components/NextOpenState'
import type { ArbSnapshot, ChartSeries, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { PERP_PLAIN, probLabel, verdict } from '../easy/copy'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, fmtWon, openDayText, tone } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import { useQuery } from '../lib/query'
import { SessionBadge } from '../components/SessionBadge'
import { StockLogo } from '../components/Brand'
import { openSearch, useAssetQuotes } from '../components/AssetSearch'
import { navigate } from '../lib/router'
import { TodayIssue } from '../components/TodayIssue'
import { IndicatorStrip } from '../components/IndicatorStrip'

function Spark({ data, isIdx }: { data: ChartSeries; isIdx: boolean }) {
  // Last two days of 15m bars. Domestic quotes exist only during market hours, so the line looks broken
  const W = 640
  const H = 140
  const from = Date.now() - 2 * 86400_000
  const perp = data.perpKrw.filter((k) => k.t >= from)
  const krx = data.krx.filter((k) => k.t >= from)
  const all = [...perp.map((k) => k.c), ...krx.map((k) => k.c)]
  if (!perp.length) return null
  const min = Math.min(...all)
  const max = Math.max(...all)
  const t0 = perp[0].t
  const t1 = perp[perp.length - 1].t
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W
  const y = (v: number) => H - 8 - ((v - min) / Math.max(1e-9, max - min)) * (H - 16)
  const path = (pts: { t: number; c: number }[], gapMs: number) =>
    pts.map((k, i) => `${i === 0 || k.t - pts[i - 1].t > gapMs ? 'M' : 'L'}${x(k.t).toFixed(1)},${y(k.c).toFixed(1)}`).join('')
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="최근 이틀 가격 흐름">
        <path d={path(perp, 3600_000)} fill="none" stroke="var(--perp)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(krx, 3600_000)} fill="none" stroke="var(--krx)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="row" style={{ gap: 16, fontSize: 13 }}>
        <span className="row" style={{ gap: 6 }}>
          <i className="chip__dot" style={{ background: 'var(--krx)' }} />
          국내 주식시장
        </span>
        <span className="row" style={{ gap: 6 }}>
          <i className="chip__dot" style={{ background: 'var(--perp)' }} />
          {PERP_PLAIN} (원화로 바꾼 값)
        </span>
        <span className="spacer" />
        <span className="faint num">
          {fmtPrice(min, isIdx)} ~ {fmtPrice(max, isIdx)}
        </span>
      </figcaption>
    </figure>
  )
}

const AMOUNTS = [1_000_000, 10_000_000, 100_000_000]
const amountLabel = (v: number) => (v >= 1e8 ? `${v / 1e8}억원` : `${(v / 1e4).toLocaleString('ko-KR')}만원`)

function BackButton() {
  return (
    <button
      className="back-btn"
      onClick={() => (history.state?.fromApp ? history.back() : navigate('/'))}
      aria-label="시세 요약으로 돌아가기"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
      시세 요약
    </button>
  )
}

function AssetTitle({ asset }: { asset: Asset }) {
  return (
    <button className="asset-switch" onClick={openSearch} aria-label={`${asset.name}, 다른 종목 보기`}>
      <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{asset.name}</h1>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  )
}

/** Products without a next-open forecast (ADR, index, US ETFs): price + a pointer to the detail tab */
function PerpOnlyDetail({ asset }: { asset: Asset }) {
  const { setMode } = usePrefs()
  const q = useAssetQuotes()[asset.id]
  const isIdx = asset.kind === 'index'
  return (
    <div className="easy-detail">
      <BackButton />
      <header className="easy-head">
        <StockLogo id={asset.id} size={44} />
        <div>
          <AssetTitle asset={asset} />
          {q ? (
            <p className="num" style={{ marginTop: 2, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              {fmtPrice(q.price, isIdx)}
              {isIdx ? '' : '원'} <span className={tone(q.changePct)} style={{ fontSize: 14, fontWeight: 600 }}>{fmtPct(q.changePct)}</span>
            </p>
          ) : (
            <div className="skeleton" style={{ width: 180, height: 30, marginTop: 4 }} />
          )}
        </div>
      </header>
      <section className="panel q-card">
        <p className="q-card__q">{asset.note ?? '하이퍼리퀴드 가격만 제공해요'}</p>
        <p className="q-card__reason">
          이 상품은 국내 주식과 1:1로 맞물리지 않아서 내일 가격 예측과 시세차익은 계산하지 않아요. 차트와 호가는 상세 탭에서 볼 수 있어요.
        </p>
        <button className="btn btn--lg btn--key btn--block" style={{ marginTop: 16 }} onClick={() => setMode('pro')}>
          상세 탭에서 보기
        </button>
      </section>
    </div>
  )
}

export default function EasyDetail({ asset }: { asset: Asset }) {
  if (asset.kind !== 'stock') return <PerpOnlyDetail asset={asset} />
  return <StockDetail asset={asset} />
}

function StockDetail({ asset }: { asset: Asset }) {
  const { setMode } = usePrefs()
  const pred = useQuery<Prediction>(`/api/v1/predict?asset=${asset.id}`, 15_000)
  const arbQ = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const series = useQuery<ChartSeries>(`/api/v1/series?asset=${asset.id}&interval=15m`, 60_000)
  const [amount, setAmount] = useState(10_000_000)
  const [why, setWhy] = useState(false)
  const arb = arbQ.data?.items.find((x) => x.asset === asset.id)
  const p = pred.data
  const isIdx = asset.kind === 'index'
  const unit = isIdx ? '' : '원'

  useEffect(() => {
    if (p) track('prediction_view', { asset: asset.id, from: 'detail', hours_to_open: p.hoursToOpen, prob_up: p.probUp })
  }, [!!p, asset.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (arb) track('arb_view', { asset: asset.id, net_pct: arb.net.netPct, mode: arb.mode })
  }, [!!arb, asset.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const net = useMemo(() => (arb ? Math.round((amount * arb.net.netPct) / 100) : 0), [arb, amount])

  return (
    <div className="easy-detail">
      <BackButton />
      <header className="easy-head">
        <StockLogo id={asset.id} size={44} />
        <div>
          <div className="row" style={{ gap: 6 }}>
            <AssetTitle asset={asset} />
            {arb && <SessionBadge session={arb.session} />}
          </div>
          {arb ? (
            <p className="num" style={{ marginTop: 2, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              {fmtPrice(arb.krx.price, isIdx)}
              {unit} <span className={tone(arb.krx.changePct)} style={{ fontSize: 14, fontWeight: 600 }}>{fmtPct(arb.krx.changePct)}</span>
            </p>
          ) : (
            <div className="skeleton" style={{ width: 180, height: 30, marginTop: 4 }} />
          )}
        </div>
      </header>

      <IndicatorStrip />

      {/* Question 1: up or down */}
      <section className="panel q-card">
        <p className="q-card__q">{p ? `${openDayText(p.targetOpenAt)} 아침 가격, 오를까요?` : '다음 장 가격, 오를까요?'}</p>
        {p && !predictionReady(p) ? (
          <>
            <p className="q-card__a" data-fit>{IN_SESSION.title}</p>
            <p className="q-card__reason">{IN_SESSION.body}</p>
            <button
              className="trust"
              onClick={() => {
                if (!why) track('model_explain_open', { asset: asset.id, hit_rate: p.backtest.hitRatePct ?? 0 })
                setWhy(!why)
              }}
              aria-expanded={why}
            >
              <span>
                지난 {p.backtest.tested}번 개장 중 <b>{Math.round(((p.backtest.hitRatePct ?? 0) * p.backtest.tested) / 100)}번</b> 방향을 맞혔어요
              </span>
              <span className="faint">{why ? '접기' : '어떻게 계산하나요'}</span>
            </button>
            {why && (
              <div className="notice" style={{ marginTop: 8 }}>
                장이 닫혀 있는 동안 {PERP_PLAIN} 가격을 원/USDC 환율로 바꿔서, 마지막 종가와 얼마나 벌어졌는지 봐요. 지난 {p.model.n}번의 개장에서 이 차이가 실제 장 시작 가격에
                얼마나 반영됐는지 학습해서 확률을 내요.
              </div>
            )}
          </>
        ) : p ? (
          <>
            <p className={`q-card__a ${verdict(p.probUp).tone}`} data-fit>{verdict(p.probUp).text}</p>
            <div className="big-prob">
              <span className={`num ${probLabel(p.probUp).tone}`}>{probLabel(p.probUp).value}%</span>
              <span className="muted">{probLabel(p.probUp).label}</span>
            </div>
            <div className="prob__bar" style={{ height: 10 }}>
              <i className="prob__up" style={{ width: `${p.probUp * 100}%` }} />
            </div>
            <dl className="q-facts">
              <div>
                <dt>예상 시작 가격</dt>
                <dd className="num" data-fit>
                  {fmtPrice(p.expectedOpen, isIdx)}
                  {unit} <span className={tone(p.expectedGapPct)}>{fmtPct(p.expectedGapPct, 1)}</span>
                </dd>
              </div>
              <div>
                <dt>10번 중 8번은 이 안에서 시작해요</dt>
                <dd className="num" data-fit>
                  {fmtPrice(p.band80.low, isIdx)} ~ {fmtPrice(p.band80.high, isIdx)}
                  {unit}
                </dd>
              </div>
            </dl>
            <p className="q-card__reason">
              {`${PERP_PLAIN}에서 ${asset.short} 가격이 ${p.regime === 'weekend' ? '지난 종가' : '오늘 종가'}보다 ${fmtPct(p.perpGapPct, 1)} ${p.perpGapPct >= 0 ? '높게' : '낮게'} 거래되고 있어요.`}
            </p>
            <button
              className="trust"
              onClick={() => {
                if (!why) track('model_explain_open', { asset: asset.id, hit_rate: p.backtest.hitRatePct ?? 0 })
                setWhy(!why)
              }}
              aria-expanded={why}
            >
              <span>
                지난 {p.backtest.tested}번 개장 중 <b>{Math.round(((p.backtest.hitRatePct ?? 0) * p.backtest.tested) / 100)}번</b> 방향을 맞혔어요
              </span>
              <span className="faint">{why ? '접기' : '어떻게 계산하나요'}</span>
            </button>
            {why && (
              <div className="notice" style={{ marginTop: 8 }}>
                장이 닫혀 있는 동안 {PERP_PLAIN} 가격을 원/USDC 환율로 바꿔서, 마지막 종가와 얼마나 벌어졌는지 봐요. 지난 {p.model.n}번의 개장에서 이 차이가 실제 장 시작 가격에
                얼마나 반영됐는지 학습해서 확률을 내요. 개장까지 시간이 많이 남을수록 범위를 넓게 잡아요. 예측은 매번 그날 이전 데이터로만 해서 실제와 비교했어요.
              </div>
            )}
            <p className="faint" style={{ fontSize: 13, margin: '12px 0 0' }}>
              <NextOpenWhen at={p.targetOpenAt} long />
            </p>
          </>
        ) : (
          <div className="skeleton" style={{ height: 260 }} />
        )}
      </section>

      {/* Question 2: arbitrage */}
      <section className="panel q-card">
        <p className="q-card__q">지금 두 시장 차이로 얼마나 남아요?</p>
        {arb ? (
          <>
            <div className="seg" role="group" aria-label="금액" style={{ margin: '4px 0 16px' }}>
              {AMOUNTS.map((v) => (
                <button
                  key={v}
                  aria-pressed={amount === v}
                  onClick={() => {
                    setAmount(v)
                    track('arb_calc_change', { amount: v })
                  }}
                >
                  {amountLabel(v)}
                </button>
              ))}
            </div>
            {arb.mode === 'gap' ? (
              <>
                <p className="q-card__a" data-fit>장 열리면 바로 확인할 수 있어요</p>
                <p className="q-card__reason">
                  국내 주식시장이 닫혀 있어서 지금은 주식을 사고팔 수 없어요. 대신 {PERP_PLAIN} 가격이 종가보다 {fmtPct(arb.premiumPct)} 벌어져 있어요. 이 차이는 보통 다음
                  장 시작 가격에 대부분 반영돼요.
                </p>
              </>
            ) : (
              <>
                <p className={`q-card__a num ${net > 0 && arb.net.executable ? 'up' : ''}`} data-fit>
                  {net > 0 && arb.net.executable ? `약 ${fmtWon(net)}원 남아요` : '지금은 남는 게 없어요'}
                </p>
                <p className="q-card__reason">
                  {PERP_PLAIN}가 {fmtPct(Math.abs(arb.premiumPct), 2, false)} {arb.premiumPct >= 0 ? '비싸요' : '싸요'}. 수수료·세금·환전 비용{' '}
                  {fmtPct(arb.net.costs.stock + arb.net.costs.perp + arb.net.costs.fx, 2, false)}를 빼면 {fmtPct(arb.net.netPct)}예요.
                </p>
                <p className="faint" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  {arb.net.note}
                </p>
              </>
            )}
          </>
        ) : (
          <div className="skeleton" style={{ height: 160 }} />
        )}
      </section>

      <section className="panel" style={{ padding: 20 }}>{series.data && series.data.asset === asset.id ? <Spark data={series.data} isIdx={isIdx} /> : <div className="skeleton" style={{ height: 170 }} />}</section>

      <TodayIssue asset={asset.id} limit={2} />

      <button
        className="btn btn--lg btn--fill btn--block"
        onClick={() => {
          setMode('pro')
          track('mode_switch', { mode: 'pro', from: 'easy_detail' })
        }}
      >
        차트와 호가까지 자세히 보기
      </button>
    </div>
  )
}
