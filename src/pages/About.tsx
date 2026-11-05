import type { Prediction } from '../../shared/api'
import { StockLogo } from '../components/Brand'
import { useQuery } from '../lib/query'

/** What this prototype is trying to prove: problem, target, hypotheses and how they are measured */
export default function About() {
  const preds = useQuery<{ items: Prediction[] }>('/api/v1/predict', 300_000)
  return (
    <div className="easy about">
      <section className="easy-hero">
        <h1>밤사이가 풀려는 문제</h1>
        <p>국장이 닫힌 사이에 생긴 일이 내일 아침 가격에 어떻게 반영될지, 장 열리기 전에 먼저 보여드려요.</p>
      </section>

      <section className="panel about__block">
        <div className="panel__head">
          <span className="panel__title">문제</span>
        </div>
        <div className="panel__body about__body">
          <p className="about__lead">
            국내 주식시장은 일주일 168시간 중 <b>32.5시간</b>만 열려요. 나머지 <b>81%</b>의 시간에 생긴 뉴스가 다음 날 가격에 얼마나 반영될지 개인 투자자는 알 방법이 없어요.
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
              <dt>종목 화면</dt>
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
          <p className="about__h">H1. 해외 선물 탈중앙 거래소 가격으로 다음 날 장 시작 가격의 방향을 80% 이상 맞힐 수 있다</p>
          <p className="muted" style={{ fontSize: 13 }}>
            그날 이전 데이터로만 학습해서 그날 장 시작 가격을 맞혀봤어요 (2026년 5월 13일~, 종목별 119번. 4월 13일부터 20번은 학습에만 썼어요).
          </p>
          <div className="about__hits">
            {preds.data
              ? preds.data.items.map((p) => (
                  <div key={p.asset} className="about__hit">
                    <StockLogo id={p.asset} size={28} />
                    <span className="strong">{p.name}</span>
                    <span className="spacer" />
                    <b className="num up" data-fit>
                      {p.backtest.hitRatePct}%
                    </b>
                    <span className="faint num" style={{ fontSize: 12 }}>
                      오차 {p.backtest.maePct}%p
                    </span>
                  </div>
                ))
              : [0, 1, 2].map((i) => <div key={i} className="about__hit skeleton" style={{ height: 44 }} />)}
          </div>
          <p className="about__h" style={{ marginTop: 20 }}>
            H2. "오를 확률"을 보여주면 장 시작 전에 다시 찾아온다
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            장 마감 후 종목토론방·주식 갤러리에 링크를 올리고 4일 동안 봐요. 다음 개장 전(08~09시)에 다시 온 사람이 <b className="strong">15% 이상</b>이면 통과예요.
          </p>
          <p className="about__h" style={{ marginTop: 20 }}>
            H3·H4. 적중 이력을 보여주면 믿고, 비용 뺀 차익을 보여주면 주문까지 간다
          </p>
          <p className="muted" style={{ fontSize: 13 }}>근거 펼침률 10% 이상, 차익 조회 → 주문 버튼 클릭 5% 이상을 봐요.</p>
        </div>
      </section>

      <p className="faint" style={{ fontSize: 12, marginTop: 20 }}>
        투자 판단을 돕는 참고 정보예요. 예측은 틀릴 수 있고, 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
      </p>
    </div>
  )
}
