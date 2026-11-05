import { useEffect } from 'react'
import type { ArbSnapshot, Prediction, Status } from '../../shared/api'
import { ASSET_BY_ID } from '../../shared/assets'
import { probLabel, verdict, PERP_PLAIN } from '../easy/copy'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, fmtWon, kstDay, openDayText, untilText } from '../lib/format'
import { useQuery } from '../lib/query'
import { Link } from '../lib/router'

function StatusLine({ s }: { s?: Status }) {
  if (!s) return <div className="skeleton" style={{ width: 280, height: 18 }} />
  const msg =
    s.session === 'regular'
      ? '지금 국내 주식시장이 열려 있어요'
      : s.session === 'nxt'
        ? '지금은 넥스트레이드에서만 거래되고 있어요'
        : `국내 주식시장은 닫혀 있어요. ${PERP_PLAIN}은 지금도 거래 중이에요`
  return (
    <p className="muted" style={{ margin: 0, fontSize: 15 }}>
      {msg} · 다음 개장 {kstDay(s.nextOpen)} 오전 9시 ({untilText(s.nextOpen)})
    </p>
  )
}

function PredictCard({ p }: { p: Prediction }) {
  const a = ASSET_BY_ID[p.asset]
  const pl = probLabel(p.probUp)
  const v = verdict(p.probUp)
  return (
    <Link href={`/s/${p.asset}`} className="card easy-card" onClick={() => track('prediction_detail_open', { asset: p.asset, from: 'home' })}>
      <div className="row">
        <span className="easy-card__name">{a.name}</span>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 13 }}>
          자세히
        </span>
      </div>
      <p className={`easy-card__verdict ${v.tone}`}>{v.text}</p>
      <div className="prob">
        <div className="prob__bar">
          <i className="prob__up" style={{ width: `${p.probUp * 100}%` }} />
        </div>
        <div className="row num" style={{ fontSize: 13 }}>
          <span className={pl.tone}>
            {pl.label} <b>{pl.value}%</b>
          </span>
          <span className="spacer" />
          <span className="muted">
            예상 시가 {fmtPrice(p.expectedOpen, a.kind === 'index')}
            {a.kind === 'stock' ? '원' : ''} ({fmtPct(p.expectedGapPct, 1)})
          </span>
        </div>
      </div>
    </Link>
  )
}

function ArbRow({ s }: { s: ArbSnapshot }) {
  const a = ASSET_BY_ID[s.asset]
  const net = s.net.netKrwPer10m
  const pricier = s.premiumPct >= 0 ? `${PERP_PLAIN}이 ${fmtPct(Math.abs(s.premiumPct), 2, false)} 비싸요` : `${PERP_PLAIN}이 ${fmtPct(Math.abs(s.premiumPct), 2, false)} 싸요`
  return (
    <Link href={`/s/${s.asset}`} className="arb-row">
      <div>
        <p className="arb-row__name">{a.name}</p>
        <p className="faint arb-row__sub">{s.mode === 'gap' ? `종가보다 ${pricier.replace(`${PERP_PLAIN}이 `, '')}` : pricier}</p>
      </div>
      <div style={{ textAlign: 'right' }}>
        {s.mode === 'gap' ? (
          <p className="muted arb-row__value">장 열리면 확인할 수 있어요</p>
        ) : net > 0 && s.net.executable ? (
          <p className="arb-row__value up num">+{fmtWon(net)}원</p>
        ) : (
          <p className="muted arb-row__value">지금은 비용이 더 커요</p>
        )}
        <p className="faint arb-row__sub">1천만원 기준, 비용 빼고</p>
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

  return (
    <div className="page easy">
      <section className="easy-hero">
        <h1 className="easy-hero__title">{day} 아침 시가, 오를까요?</h1>
        <StatusLine s={status.data} />
      </section>

      <div className="easy-grid">
        {preds.data
          ? preds.data.items.map((p) => <PredictCard key={p.asset} p={p} />)
          : [0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 156 }} />)}
      </div>

      <h2 className="section-title" style={{ marginTop: 40 }}>
        지금 두 시장 차이로 남는 돈
      </h2>
      <section className="card" style={{ padding: '8px 24px' }}>
        {arb.data ? arb.data.items.map((s) => <ArbRow key={s.asset} s={s} />) : <div className="skeleton" style={{ height: 240, margin: '16px 0' }} />}
      </section>

      <section className="explain">
        <h3>어떻게 미리 알 수 있나요?</h3>
        <p>
          국내 주식시장은 오후 3시 30분에 닫히지만, 하이퍼리퀴드 같은 해외 거래소에서는 삼성전자·SK하이닉스 가격을 밤에도 주말에도 사고팔아요. 이 가격을
          원화로 바꿔서 다음 날 시가가 어디서 시작할지 계산해요.
        </p>
        <p>
          지난 개장일마다 이 방법이 얼마나 맞았는지도 매일 다시 계산해요. 맞힌 비율은 종목 화면에서 볼 수 있어요.
        </p>
        <p className="faint" style={{ fontSize: 13 }}>
          투자 판단을 돕는 참고 정보예요. 예측이 틀릴 수 있고, 투자 결과는 본인에게 돌아가요. 해외 perp는 국내 투자자 보호 대상이 아니에요.
        </p>
      </section>
    </div>
  )
}
