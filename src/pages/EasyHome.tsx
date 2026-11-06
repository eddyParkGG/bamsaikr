import { useEffect } from 'react'
import { arbText } from '../lib/arb'
import { predictionReady, ThinTag } from '../components/NextOpenState'
import type { ArbSnapshot, Prediction, Status } from '../../shared/api'
import { ASSET_BY_ID } from '../../shared/assets'
import { PERP_PLAIN } from '../lib/copy'
import { track } from '../lib/ga'
import { fmtPct, fmtPrice, tone } from '../lib/format'
import { SessionLine, useNow } from '../lib/market'
import { followText, nightStage } from '../lib/night'
import { useArb, usePredictions, useStatus } from '../lib/data'
import { Link } from '../lib/router'
import { StockLogo } from '../components/Brand'

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
          <p className="stock-card__label">{night.stage === 'after' ? `미국장 닫힌 뒤 ${PERP_PLAIN}` : `${PERP_PLAIN} 지금`}</p>
          <p className="stock-card__big num" data-fit>
            {fmtPrice(p.perpKrw)}원 <span className={tone(p.perpGapPct)}>{fmtPct(p.perpGapPct)}</span>
          </p>
          {night.stage !== 'after' && <p className="stock-card__sub">{night.text}</p>}
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
          {s && p.preOpen && (
            <>
              <p className="stock-card__label stock-card__label--gap">미국장 닫힌 뒤 · 국내 개장 직전 {PERP_PLAIN}</p>
              <p className="stock-card__sub num" data-fit>
                {fmtPrice(p.preOpen.krw)}원 <span className={tone(p.preOpen.krw / s.krx.prevClose - 1)}>{fmtPct((p.preOpen.krw / s.krx.prevClose - 1) * 100)}</span>
              </p>
            </>
          )}
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


  return (
    <div className="easy">
      <section className="easy-hero">
        <h1>국장 시작 전, 가격을 먼저 가늠해 보세요</h1>
        <p className="easy-intro">
          국내 주식시장이 닫힌 밤과 주말에도, 탈중앙 거래소 하이퍼리퀴드에서는 삼성전자·SK하이닉스·현대차 가격을 따라가는 선물이 24시간 거래돼요. 그 가격을 원화로 바꾸고, 지난 개장일마다 국내 시장이 그 방향대로 열린 비율을 함께 보여드려요.
        </p>
        <StatusLine s={status.data} />
      </section>

      <div className="easy-section-title">
        <h2>밤사이 해외 가격과 비교</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          {status.data ? nightStage(status.data.nextOpen, now).short : `${PERP_PLAIN} 가격 기준`}
        </span>
      </div>
      <div className="stock-cards">
        {preds.data
          ? preds.data.items.map((p) => <StockCard key={p.asset} p={p} s={arb.data?.items.find((x) => x.asset === p.asset)} now={now} />)
          : [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 168, borderRadius: 16 }} />)}
      </div>


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
          <h2>밤사이 가격, 언제 봐야 맞나요?</h2>
        </div>
        <p>
          하이퍼리퀴드 가격은 미국장이 열려 있는 동안 가장 크게 움직여요. 그래서 언제 본 가격이냐에 따라, 국내 시장이 그 방향대로 열린 비율이 달라요.
        </p>
        <table className="explain__table num">
          <tbody>
            <tr>
              <td>저녁 9시 가격</td>
              <td>약 49%</td>
            </tr>
            <tr>
              <td>새벽 1시 가격</td>
              <td>약 72%</td>
            </tr>
            <tr>
              <td>
                미국장 마감 뒤 가격 <span className="faint">(겨울 새벽 6시 · 여름 새벽 5시)</span>
              </td>
              <td>
                <b>약 86%</b>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="faint" style={{ fontSize: 12 }}>
          평일 밤 108번, 삼성전자·SK하이닉스 기준 (4/13 이후)
        </p>
        <p>
          비율은 매일 아침 개장 결과로 다시 세요. 종목별 숫자는 종목 상세와{' '}
          <Link href="/about" className="link">
            소개
          </Link>
          에서 볼 수 있어요.
        </p>
        <p>
          시세차익은 두 시장 가격 차이가 평소보다 더 벌어졌을 때, 수수료·세금·환전 비용·펀딩비를 빼고도 남는 금액이에요. 남지 않으면 &lsquo;기회가 없어요&rsquo;로 보여드려요.
        </p>
        <p className="faint" style={{ fontSize: 12 }}>
          참고 정보예요. 과거 비율이 앞으로도 같다는 보장은 없고, 투자 결과는 본인에게 돌아가요. 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
        </p>
      </section>
    </div>
  )
}
