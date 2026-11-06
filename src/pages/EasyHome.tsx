import { useEffect } from 'react'
import { arbText } from '../lib/arb'
import { predictionReady, ThinTag } from '../components/NextOpenState'
import type { ArbSnapshot, Prediction, Status } from '../../shared/api'
import { ASSET_BY_ID } from '../../shared/assets'
import { PERP_PLAIN } from '../lib/copy'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, openDayText, tone } from '../lib/format'
import { SessionLine, useNow } from '../lib/market'
import { followText, nightStage } from '../lib/night'
import { useArb, usePredictions, useStatus } from '../lib/data'
import { Link } from '../lib/router'
import { StockLogo } from '../components/Brand'
import { TodayIssue } from '../components/TodayIssue'

function StatusLine({ s }: { s?: Status }) {
  if (!s) return <div className="skeleton" style={{ width: 280, height: 18 }} />
  const msg =
    s.session === 'regular'
      ? '지금 국내 주식시장이 열려 있어요'
      : s.session === 'nxt'
        ? '지금은 넥스트레이드에서 거래되고 있어요'
        : `국내 주식시장은 닫혀 있어요. ${PERP_PLAIN}는 지금도 거래 중이에요`
  return (
    <p>
      {msg} · <SessionLine status={s} style="words" />
    </p>
  )
}

/**
 * One card per stock: tonight's Hyperliquid price against the domestic close, the price when the US session closed,
 * and how often past opens followed it at this time of night. While the domestic market trades, its live price instead
 */
function StockCard({ p, s, now }: { p: Prediction; s?: ArbSnapshot; now: number }) {
  const a = ASSET_BY_ID[p.asset]
  const ready = predictionReady(p)
  const night = nightStage(p.targetOpenAt, now)
  const follow = followText(p)
  return (
    <Link href={`/s/${p.asset}`} className="panel stock-card" onClick={() => track('prediction_detail_open', { asset: p.asset, from: 'home' })}>
      <div className="stock-card__head">
        <StockLogo id={p.asset} size={28} />
        <b>{a.name}</b>
        {ready && <ThinTag p={p} help={false} />}
        <span className="spacer" />
        <span className="stock-card__go">차트·자세히 ›</span>
      </div>
      {ready ? (
        <>
          <p className="stock-card__label">{PERP_PLAIN} 지금</p>
          <p className="stock-card__big num" data-fit>
            {fmtPrice(p.perpKrw)}원 <span className={tone(p.perpGapPct)}>{fmtPct(p.perpGapPct)}</span>
          </p>
          <p className="stock-card__sub num">
            {p.night?.usCloseKrw != null && p.night.usClosePct != null ? (
              <>
                미국장 마감 때 {fmtPrice(p.night.usCloseKrw)}원 <span className={tone(p.night.usClosePct)}>{fmtPct(p.night.usClosePct)}</span>
              </>
            ) : (
              night.text
            )}
          </p>
          {follow && <p className="stock-card__foot">{follow}</p>}
        </>
      ) : (
        <>
          <p className="stock-card__label">국내 지금</p>
          <p className="stock-card__big num" data-fit>
            {s ? (
              <>
                {fmtPrice(s.krx.price)}원 <span className={tone(s.krx.changePct)}>{fmtPct(s.krx.changePct)}</span>
              </>
            ) : (
              '-'
            )}
          </p>
          <p className="stock-card__foot">저녁 8시 국내 시장이 닫히면 밤사이 {PERP_PLAIN} 가격을 보여드려요</p>
        </>
      )}
    </Link>
  )
}

function ArbRow({ s }: { s: ArbSnapshot }) {
  const a = ASSET_BY_ID[s.asset]
  const t = arbText(s)
  const diff = `${fmtPct(Math.abs(s.premiumPct), 2, false)} ${s.premiumPct >= 0 ? '비싸요' : '싸요'}`
  return (
    <Link href={`/s/${s.asset}`} className="easy-row">
      <StockLogo id={s.asset} size={36} />
      <div>
        <p className="easy-row__name" data-fit>{a.name}</p>
        <p className="easy-row__sub" data-fit>
          {s.mode === 'gap' ? `종가보다 해외 가격이 ${diff}` : `해외 가격이 ${diff} · 평소 ${fmtPct(s.normalPremiumPct)}`}
        </p>
      </div>
      <div className="easy-row__right">
        {t.kind === 'go' ? (
          <p className="easy-row__big up num" data-fit>{t.short}</p>
        ) : (
          <p className="easy-row__big faint" style={{ fontSize: 14 }}>
            {t.short}
          </p>
        )}
        {t.kind === 'go' && (
          <p className="easy-row__sub" data-fit>
            1천만원 기준
          </p>
        )}
      </div>
    </Link>
  )
}

export default function EasyHome() {
  const status = useStatus()
  const now = useNow(60_000)
  const preds = usePredictions()
  const arb = useArb()

  useEffect(() => {
    if (preds.data && status.data) track('prediction_view', { from: 'home', session: status.data.session })
  }, [!!preds.data, !!status.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = status.data ? openDayText(status.data.nextOpen) : '다음'
  const inSession = !!status.data && status.data.session !== 'closed'

  return (
    <div className="easy">
      <section className="easy-hero">
        <h1>{inSession ? '국내 시장이 닫히면, 밤사이 해외 가격을 보여드려요' : `${day} 아침 국내 시장 시작 전, 밤사이 해외 가격부터 보세요`}</h1>
        <p className="easy-intro">
          국내 주식시장이 닫힌 밤과 주말에도, 탈중앙 거래소 하이퍼리퀴드에서는 삼성전자·SK하이닉스·현대차 가격을 따라가는 선물이 24시간 거래돼요. 그 가격을 원화로 바꾸고, 지난 개장일마다 국내 시장이 그 방향대로 열린 비율을 함께 보여드려요.
        </p>
        <StatusLine s={status.data} />
      </section>

      <div className="easy-section-title">
        <h2>밤사이 해외 가격</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          {status.data ? nightStage(status.data.nextOpen, now).short : `${PERP_PLAIN} 가격 기준`}
        </span>
      </div>
      <div className="stock-cards">
        {preds.data
          ? preds.data.items.map((p) => <StockCard key={p.asset} p={p} s={arb.data?.items.find((x) => x.asset === p.asset)} now={now} />)
          : [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 168, borderRadius: 16 }} />)}
      </div>

      <TodayIssue limit={3} />
      <div style={{ height: 8 }} />

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
          국내 시장은 넥스트레이드까지 저녁 8시면 닫히지만, 하이퍼리퀴드에서는 삼성전자·SK하이닉스 가격을 밤에도 주말에도 사고팔아요. 이 가격을 원화로
          바꿔 보여드려요. 밤사이 가장 크게 움직이는 건 미국장이 열려 있는 동안이라, 미국장이 닫힌 뒤(겨울 새벽 6시, 여름 새벽 5시) 가격이 다음 날 시작 가격과 가장 가까워요.
        </p>
        <p>
          지난 개장일마다 국내 시장이 하이퍼리퀴드 방향대로 열렸는지 매일 다시 세요. 시간대별 비율은 종목 상세와{' '}
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
