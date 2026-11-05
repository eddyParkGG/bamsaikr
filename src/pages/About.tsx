import { StockLogo } from '../components/Brand'
import { usePredictions } from '../lib/data'

/** What this prototype is trying to prove: problem, target, hypotheses and how they are measured */
export default function About() {
  const preds = usePredictions()
  return (
    <div className="easy about">
      <section className="easy-hero">
        <h1>밤사이가 풀려는 문제</h1>
        <p>국내 시장이 닫힌 사이에 생긴 일이 내일 아침 가격에 어떻게 반영될지, 장 열리기 전에 먼저 보여드려요.</p>
      </section>

      <section className="panel about__block">
        <div className="panel__head">
          <span className="panel__title">문제</span>
        </div>
        <div className="panel__body about__body">
          <p className="about__lead">
            국내 시장은 넥스트레이드까지 합쳐도 일주일 168시간 중 <b>약 59시간</b>만 열려요. 나머지 <b>65%</b>의 시간에 생긴 뉴스가 다음 날 가격에 얼마나 반영될지 개인 투자자는 알 방법이 없어요.
          </p>
          <ul>
            <li>하이퍼리퀴드 같은 해외 거래소에선 삼성전자·SK하이닉스가 밤에도 주말에도 거래돼요. 하이닉스만 하루 약 5억 달러예요.</li>
            <li>가격이 달러(USDC)라 바로 비교는 어렵지만, 원화로 바꾸고 수수료까지 빼보면 두 시장 사이에 시세차익 기회가 있어요.</li>
          </ul>
        </div>
      </section>

      <section className="panel about__block">
        <div className="panel__head">
          <span className="panel__title">누구를 위해</span>
        </div>
        <div className="panel__body about__body">
          <dl className="about__targets">
            <div>
              <dt>홈</dt>
              <dd>삼성전자·SK하이닉스를 가진 직장인. 출근길 08~09시에 "오늘 장 시작하면 어떨까"가 궁금한 사람</dd>
            </div>
            <div>
              <dt>종목 상세</dt>
              <dd>주식과 코인을 같이 하는 트레이더. 두 시장 차이와 개장 갭을 매매에 쓰는 사람</dd>
            </div>
            <div>
              <dt>API · MCP</dt>
              <dd>AI 에이전트·자동매매를 직접 만드는 사람</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel about__block">
        <div className="panel__head">
          <span className="panel__title">가설과 지금까지의 결과</span>
        </div>
        <div className="panel__body about__body">
          <p className="about__h">
            H1. 국내 시장이 닫힌 동안 해외 선물 탈중앙 거래소(하이퍼리퀴드) 가격이 움직인 방향대로, 다음 날 국내 시장도 80% 이상 같은 방향으로 시작한다
            <span className="about__status about__status--done">통과</span>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            국내 시장이 닫힌 동안 하이퍼리퀴드가 오르거나 내린 방향대로 다음 날 국내 시장이 시작했는지 봤어요. 시작 가격은 정규장 09:00 기준이고, 둘 중 하나라도 ±0.05% 안쪽이라 방향을 따지기 어려운 날은 뺐어요.
          </p>
          <div className="nbar about__period">
            <span className="nbar__label">기간</span>
            <i className="nbar__sep" />
            <span className="nbar__text">
              하이퍼리퀴드에 한국 종목이 <b>처음 상장된 2026년 2월 19일 이후</b>의 모든 개장일
            </span>
          </div>
          <div className="about__hits">
            {preds.data
              ? preds.data.items.map((p) => (
                  <div key={p.asset} className="about__hit">
                    <StockLogo id={p.asset} size={28} />
                    <span className="strong">{p.name}</span>
                    <span className="spacer" />
                    <span className="faint num" style={{ fontSize: 12 }}>
                      상장 후 {p.backtest.followScored}번 중 {p.backtest.followYes}번
                    </span>
                    <b className="num" data-fit>
                      {p.backtest.followRatePct?.toFixed(1)}%
                    </b>
                  </div>
                ))
              : [0, 1, 2].map((i) => <div key={i} className="about__hit skeleton" style={{ height: 44 }} />)}
          </div>
          <p className="about__h" style={{ marginTop: 20 }}>
            H2. "오를 확률"을 보여주면 다음 날 장 시작 전에 다시 찾아온다
            <span className="about__status">검증 예정</span>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            장 마감 후 종목토론방·주식 갤러리에 링크를 올리고 4일 동안 봐요. 처음 온 사람 중 다음 날 장 시작 전(08~09시)에 다시 온 사람이 <b className="strong">15% 이상</b>이면 통과예요.
          </p>
          <p className="about__h" style={{ marginTop: 20 }}>
            H3·H4. 지난 예측 기록을 보여주면 믿고, 비용 뺀 시세차익 기회를 보여주면 주문 버튼까지 누른다
            <span className="about__status">검증 예정</span>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            예측을 본 사람 중 근거(개장 예측·예측 기록 탭)를 연 사람이 <b className="strong">10% 이상</b>, 시세차익 기회를 본 사람 중 주문 버튼을 누른 사람이{' '}
            <b className="strong">5% 이상</b>이면 통과예요. 주문은 아직 출시 전이라, 버튼을 누르면 출시 알림 신청을 받아요.
          </p>
        </div>
      </section>

      <p className="faint" style={{ fontSize: 12, marginTop: 20 }}>
        투자 판단을 돕는 참고 정보예요. 예측은 틀릴 수 있고, 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
      </p>
    </div>
  )
}
