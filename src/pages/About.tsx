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
            <li>가격이 달러(USDC)라 바로 비교는 어려워요. 원화로 바꿔 보면 두 가격 차이는 늘 일정 수준에 있고, 평소보다 크게 벌어질 때 수수료를 빼고도 남는 시세차익 기회가 생겨요.</li>
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
              <dd>삼성전자·SK하이닉스를 가진 직장인. 아침 8시 국내 시장이 열리기 전에 "오늘 장 시작하면 어떨까"가 궁금한 사람</dd>
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
          <Hypothesis id="H1" title="하이퍼리퀴드 방향대로 내일 아침 국내 시장이 시작한다" status="삼성전자·SK하이닉스 통과" done>
            <Fact k="무엇을 봤나">저녁 8시 → 아침 8시 하이퍼리퀴드가 움직인 방향과, 아침 8시~8시 10분 국내 평균 가격의 방향이 같은지</Fact>
            <Fact k="조건">밤사이 하이퍼리퀴드 거래 100만 달러(약 13억 원) 이상인 날</Fact>
            <Fact k="기간">2026년 4월 13일 이후 모든 개장일 (그 전은 하이퍼리퀴드에 1시간 단위 가격이 없어요)</Fact>
            <Fact k="통과 기준">80% 이상</Fact>
            <div className="about__hits">
              {preds.data
                ? preds.data.items.map((p) => (
                    <div key={p.asset} className="about__hit">
                      <StockLogo id={p.asset} size={28} />
                      <span className="strong">{p.name}</span>
                      <span className="spacer" />
                      <span className="faint num" style={{ fontSize: 12 }}>
                        {p.backtest.liquidScored < 30 ? `거래 충분한 밤 ${p.backtest.liquidScored}번뿐` : `${p.backtest.liquidScored}번 중 ${p.backtest.liquidYes}번`}
                        {' · '}전체 {p.backtest.followRatePct?.toFixed(1)}%
                      </span>
                      <b className="num" data-fit>
                        {p.backtest.liquidScored < 30 ? '판단 보류' : `${p.backtest.liquidRatePct?.toFixed(1)}%`}
                      </b>
                    </div>
                  ))
                : [0, 1, 2].map((i) => <div key={i} className="about__hit skeleton" style={{ height: 44 }} />)}
            </div>
            <p className="faint about__note">거래가 적은 밤은 67%만 맞았어요 · 둘 중 하나라도 ±0.05% 안쪽이라 방향을 따지기 어려운 날은 뺐어요</p>
          </Hypothesis>

          <Hypothesis id="H2" title="'오를 확률'을 보면 장 시작 전에 다시 온다" status="검증 예정">
            <Fact k="방법">저녁 8시 국내 시장이 닫힌 뒤 종목토론방·주식 갤러리에 링크를 올리고 4일 동안 봐요</Fact>
            <Fact k="통과 기준">처음 온 사람 중 다음 날 아침 6~8시에 다시 온 사람 15% 이상</Fact>
          </Hypothesis>

          <Hypothesis id="H3" title="예측 기록을 보여주면 근거를 확인한다" status="검증 예정">
            <Fact k="통과 기준">예측을 본 사람 중 개장 예측·예측 기록 탭을 연 사람 10% 이상</Fact>
          </Hypothesis>

          <Hypothesis id="H4" title="시세차익 기회를 보여주면 주문 버튼을 누른다" status="검증 예정">
            <Fact k="통과 기준">시세차익 기회를 본 사람 중 주문 버튼을 누른 사람 5% 이상</Fact>
            <Fact k="참고">주문은 출시 전이라, 누르면 출시 알림 신청을 받아요</Fact>
          </Hypothesis>

          <Hypothesis id="H5" title="API·MCP를 열면 화면 밖에서도 쓴다" status="검증 예정">
            <Fact k="통과 기준">외부(에이전트·자동매매) 호출 주 1,000회 이상</Fact>
          </Hypothesis>
        </div>
      </section>

      <p className="faint" style={{ fontSize: 12, marginTop: 20 }}>
        투자 판단을 돕는 참고 정보예요. 예측은 틀릴 수 있고, 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
      </p>
    </div>
  )
}

/** One hypothesis: short claim + status, then labelled facts */
function Hypothesis({ id, title, status, done = false, children }: { id: string; title: string; status: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="hyp">
      <p className="hyp__head">
        <span className="hyp__id">{id}</span>
        <span className="hyp__title">{title}</span>
        <span className={`about__status ${done ? 'about__status--done' : ''}`}>{status}</span>
      </p>
      <dl className="hyp__facts">{children}</dl>
    </div>
  )
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="hyp__fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  )
}
