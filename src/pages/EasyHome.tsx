import { useEffect } from 'react'
import { IN_SESSION, InSessionNotice, predictionReady } from '../components/NextOpenState'
import type { ArbSnapshot, Prediction, Status } from '../../shared/api'
import { ASSET_BY_ID } from '../../shared/assets'
import { probLabel, verdict, PERP_PLAIN } from '../easy/copy'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, fmtWon, kstDay, openDayText, untilText } from '../lib/format'
import { useQuery } from '../lib/query'
import { Link } from '../lib/router'
import { StockLogo } from '../components/Brand'
import { TodayIssue } from '../components/TodayIssue'
import { IndicatorStrip } from '../components/IndicatorStrip'

function StatusLine({ s }: { s?: Status }) {
  if (!s) return <div className="skeleton" style={{ width: 280, height: 18 }} />
  const msg =
    s.session === 'regular'
      ? '지금 국내 주식시장이 열려 있어요'
      : s.session === 'nxt'
        ? '지금은 넥스트레이드에서만 거래되고 있어요'
        : `국내 주식시장은 닫혀 있어요. ${PERP_PLAIN}는 지금도 거래 중이에요`
  return (
    <p>
      {msg} · 다음 개장 {kstDay(s.nextOpen)} 오전 9시 ({untilText(s.nextOpen)})
    </p>
  )
}

function PredictRow({ p }: { p: Prediction }) {
  const a = ASSET_BY_ID[p.asset]
  const pl = probLabel(p.probUp)
  const v = verdict(p.probUp)
  if (!predictionReady(p))
    return (
      <Link href={`/s/${p.asset}`} className="easy-row">
        <StockLogo id={p.asset} size={36} />
        <div>
          <p className="easy-row__name" data-fit>{a.name}</p>
          <p className="easy-row__sub" data-fit>{IN_SESSION.title}</p>
        </div>
        <div className="easy-row__right">
          <InSessionNotice compact />
        </div>
      </Link>
    )
  return (
    <Link href={`/s/${p.asset}`} className="easy-row" onClick={() => track('prediction_detail_open', { asset: p.asset, from: 'home' })}>
      <StockLogo id={p.asset} size={36} />
      <div>
        <p className="easy-row__name" data-fit>{a.name}</p>
        <p className="easy-row__sub num" data-fit>
          예상 시작 가격 {fmtPrice(p.expectedOpen, a.kind === 'index')}
          {a.kind === 'stock' ? '원' : ''} <span className={p.expectedGapPct >= 0 ? 'up' : 'down'}>{fmtPct(p.expectedGapPct, 1)}</span>
        </p>
      </div>
      <div className="easy-row__right">
        <p className={`easy-row__big num ${v.tone}`} data-fit>
          {pl.label} {pl.value}%
        </p>
        <div className="prob-mini">
          <i style={{ width: `${p.probUp * 100}%` }} />
        </div>
      </div>
    </Link>
  )
}

function ArbRow({ s }: { s: ArbSnapshot }) {
  const a = ASSET_BY_ID[s.asset]
  const net = s.net.netKrwPer10m
  const diff = `${fmtPct(Math.abs(s.premiumPct), 2, false)} ${s.premiumPct >= 0 ? '비싸요' : '싸요'}`
  return (
    <Link href={`/s/${s.asset}`} className="easy-row">
      <StockLogo id={s.asset} size={36} />
      <div>
        <p className="easy-row__name" data-fit>{a.name}</p>
        <p className="easy-row__sub" data-fit>{s.mode === 'gap' ? `종가보다 해외 가격이 ${diff}` : `해외 가격이 ${diff}`}</p>
      </div>
      <div className="easy-row__right">
        {s.mode === 'gap' ? (
          <p className="easy-row__big faint" style={{ fontSize: 14 }}>
            장 열리면 확인
          </p>
        ) : net > 0 && s.net.executable ? (
          <p className="easy-row__big up num" data-fit>+{fmtWon(net)}원</p>
        ) : (
          <p className="easy-row__big faint" style={{ fontSize: 14 }}>
            비용이 더 커요
          </p>
        )}
        <p className="easy-row__sub" data-fit>1천만원 기준</p>
      </div>
    </Link>
  )
}

export default function EasyHome() {
  const status = useQuery<Status>('/api/v1/status', 60_000)
  const preds = useQuery<{ items: Prediction[] }>('/api/v1/predict', 30_000)
  const arb = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 5000)

  useEffect(() => {
    if (preds.data && status.data) track('prediction_view', { from: 'home', session: status.data.session })
  }, [!!preds.data, !!status.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = status.data ? openDayText(status.data.nextOpen) : '다음'
  const inSession = status.data?.session === 'regular'

  return (
    <div className="easy">
      <section className="easy-hero">
        <h1>{inSession ? '장이 끝나도 내일 가격이 어떨지 추측할 수 있어요' : `${day} 아침 장 시작 가격, 오를까요?`}</h1>
        <p className="easy-intro">
          국내 주식시장이 닫힌 밤과 주말에도 삼성전자·SK하이닉스·현대차는 24시간 돌아가는 해외 선물 탈중앙 거래소 하이퍼리퀴드에서 거래돼요. 그 가격으로 다음 날 가격을 미리 보여드려요.
        </p>
        <StatusLine s={status.data} />
      </section>

      <IndicatorStrip />
      <TodayIssue limit={3} />
      <div style={{ height: 8 }} />

      <section className="panel easy-list">
        <div className="panel__head">
          <span className="panel__title">다음 장 시작 가격 예측</span>
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            {PERP_PLAIN} 가격 기준
          </span>
        </div>
        <div className="panel__body">
          {!preds.data ? (
            <div className="skeleton" style={{ height: 260, margin: 8 }} />
          ) : preds.data.items.every((p) => !predictionReady(p)) ? (
            // During regular hours: one notice instead of the same line on every row
            <div style={{ padding: '12px 12px 8px' }}>
              <InSessionNotice />
            </div>
          ) : (
            preds.data.items.map((p) => <PredictRow key={p.asset} p={p} />)
          )}
        </div>
      </section>

      <div className="easy-section-title">
        <h2>지금 시세차익 기회</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          수수료·세금·환전 비용 뺀 금액
        </span>
      </div>
      <section className="panel easy-list">
        <div className="panel__body">{arb.data ? arb.data.items.filter((s) => ASSET_BY_ID[s.asset].kind === 'stock').map((s) => <ArbRow key={s.asset} s={s} />) : <div className="skeleton" style={{ height: 260, margin: 8 }} />}</div>
      </section>

      <section className="explain">
        <div className="easy-section-title" style={{ marginLeft: 0 }}>
          <h2>어떻게 미리 알 수 있나요?</h2>
        </div>
        <p>
          국내 주식시장은 오후 3시 30분에 닫히지만, 하이퍼리퀴드에서는 삼성전자·SK하이닉스 가격을 밤에도 주말에도 사고팔아요. 이 가격을 원화로
          바꿔서 다음 날 장이 어떤 가격에서 시작할지 계산해요.
        </p>
        <p>
          지난 개장일마다 이 방법이 얼마나 맞았는지도 매일 다시 계산해요. 맞힌 비율은 종목 화면과{' '}
          <Link href="/about" className="link">
            소개
          </Link>
          에서 볼 수 있어요.
        </p>
        <p className="faint" style={{ fontSize: 12 }}>
          투자 판단을 돕는 참고 정보예요. 예측이 틀릴 수 있고, 투자 결과는 본인에게 돌아가요. 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
        </p>
      </section>
    </div>
  )
}
