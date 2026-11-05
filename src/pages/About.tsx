import { useArb, usePredictions } from '../lib/data'
import { fmtPct } from '../lib/format'

/** How every number on the site is worked out, in plain words with one worked example */
export default function About() {
  const preds = usePredictions()
  const arb = useArb()
  return (
    <div className="easy about">
      <section className="easy-hero">
        <h1>밤사이는 이렇게 계산해요</h1>
        <p>
          국내 주식시장은 저녁 8시에 닫혀서 다음 날 아침 8시에 다시 열려요. 그 사이에도 하이퍼리퀴드라는 해외 거래소에서는 삼성전자·SK하이닉스·현대차가 계속 거래돼요. 밤사이는 이 가격을 보고 내일 아침 가격을 미리 알려드려요.
        </p>
      </section>

      <Block title="해외 가격을 원화로 바꾸는 법">
        <Fact k="어떻게">하이퍼리퀴드에서는 가격이 USDC(달러와 1:1로 묶인 코인)로 매겨져요. 여기에 업비트의 USDC 원화 가격을 곱해 원화로 바꿔요.</Fact>
        <Fact k="왜 업비트 가격">은행 환율이 아니라, 실제로 원화를 USDC로 바꿀 때 내는 가격이라서요.</Fact>
      </Block>

      <Block title="내일 아침 가격은 이렇게 예측해요">
        <Fact k="언제 보여주나">저녁 8시부터 다음 날 아침 8시까지, 국내 시장이 닫혀 있을 때만요. 장이 열려 있을 땐 지금 가격을 보면 되니까요.</Fact>
        <Fact k="1. 밤사이 움직임">하이퍼리퀴드 가격이 어제 저녁 8시 국내 가격보다 몇 % 오르거나 내렸는지 봐요.</Fact>
        <Fact k="2. 예상 가격">지난 기록을 보면 국내 시장은 밤사이 움직임을 대부분 따라 시작했어요. 종목마다 얼마나 따라갔는지 계산해서, 그만큼 움직인 가격을 예상 가격으로 보여드려요.</Fact>
        <Fact k="3. 예상 범위">예측이 딱 맞을 순 없어서 범위도 같이 보여드려요. 10번 중 8번은 이 범위 안에서 시작하도록 잡았어요. 장 열리기까지 시간이 많이 남았으면 그사이 더 움직일 수 있어서 범위를 넓게 잡아요.</Fact>
        <Fact k="4. 오를 확률">어제 저녁 8시 가격보다 높게 시작할 가능성이에요. 하이퍼리퀴드가 많이 올랐을수록, 장 열리기까지 남은 시간이 짧을수록 높아져요.</Fact>
        <Fact k="무엇과 비교하나">아침 8시~8시 10분 국내 평균 가격과 비교해요. 8시 첫 거래는 몇 건 안 돼서 가격이 튀기 쉬워요.</Fact>
        <div className="calc">
          <p className="calc__title">예시 · 11월 4일 SK하이닉스</p>
          <Fact k="어제 저녁 8시 국내 가격">1,414,000원</Fact>
          <Fact k="아침 8시 하이퍼리퀴드 가격">1,461,621원 (밤사이 +3.37%)</Fact>
          <Fact k="예상 가격">1,452,500원쯤 (+2.72%)</Fact>
          <Fact k="예상 범위">1,427,700원 ~ 1,477,200원</Fact>
          <Fact k="오를 확률">98%</Fact>
          <Fact k="실제 시작 가격">
            <b>1,451,776원 (+2.67%)</b> · 예상과 거의 같았어요
          </Fact>
        </div>
        {preds.data && (
          <Fact k="지금까지 얼마나 맞았나">
            {preds.data.items
              .filter((p) => p.backtest.liquidScored >= 30)
              .map((p) => `${p.name}는 100번 중 ${Math.round(p.backtest.liquidRatePct ?? 0)}번`)
              .join(', ')}{' '}
            하이퍼리퀴드가 움직인 방향대로 시작했어요.
            <span className="faint"> (4월 13일부터, 하이퍼리퀴드 거래가 충분했던 밤 기준)</span>
          </Fact>
        )}
      </Block>

      <Block title="'거래 적어 덜 정확'이 붙는 날">
        <Fact k="언제">밤사이 하이퍼리퀴드 거래가 100만 달러(약 13억 원)도 안 될 때요.</Fact>
        <Fact k="왜">거래가 적으면 주문 몇 건에도 가격이 크게 흔들려서 그 가격을 믿기 어려워요. 실제로 이런 밤은 방향이 맞은 게 3번 중 2번꼴이었어요.</Fact>
      </Block>

      <Block title="시세차익 기회는 이렇게 계산해요">
        <Fact k="평소 차이">
          두 시장 가격은 늘 조금씩 달라요. 그래서 최근 5거래일 정규장 시간의 가격 차이 중 한가운데 값을 '평소 차이'로 봐요.
          {arb.data && (
            <span className="faint">
              {' '}
              (지금{' '}
              {arb.data.items
                .filter((s) => s.asset !== 'SKHY')
                .map((s) => `${s.name} ${fmtPct(s.normalPremiumPct)}`)
                .join(' · ')}
              )
            </span>
          )}
        </Fact>
        <Fact k="기회">지금 차이가 평소보다 더 벌어졌을 때만 기회로 봐요. 벌어진 만큼이 평소 수준으로 돌아오면 그만큼 남아요.</Fact>
        <Fact k="남는 돈">벌어진 만큼에서 수수료·세금·환전 비용·펀딩비(하이퍼리퀴드에서 1시간마다 주고받는 비용)를 뺀 금액이에요.</Fact>
        <Fact k="빼는 비용">주식 수수료 0.03%(사고팔 때 합계)와 팔 때 세금 0.20%, 하이퍼리퀴드 수수료 0.018%, 업비트 환전 수수료, 1시간 펀딩비</Fact>
        <Fact k="할 수 있는 경우">하이퍼리퀴드가 평소보다 비쌀 때만요. 하이퍼리퀴드에서 팔고 국내에서 사두면 돼요. 반대로 쌀 때는 국내 주식을 빌려서 팔아야 하는데, 개인은 하기 어려워요.</Fact>
      </Block>

      <Block title="예측 기록 보는 법">
        <Fact k="따라감">하이퍼리퀴드가 밤사이 오르면 아침에도 오르고, 내리면 내리며 시작했다는 뜻이에요. 둘 중 하나라도 거의 안 움직였으면 '거의 그대로'로 따로 봐요.</Fact>
        <Fact k="따라간 정도">하이퍼리퀴드가 움직인 만큼을 100으로 볼 때 국내가 얼마나 움직여 시작했는지예요. 100%면 똑같이, 50%면 절반만 움직였어요.</Fact>
        <Fact k="만난 지점">아침 8시~9시 사이 두 가격이 결국 어디서 만났는지예요. 국내 가격이 하이퍼리퀴드 쪽으로 갔는지, 하이퍼리퀴드가 국내 쪽으로 왔는지 알 수 있어요.</Fact>
        <Fact k="밤사이 거래">그날 밤 하이퍼리퀴드에서 거래된 금액이에요. 적은 날은 '적음'이라고 붙여요.</Fact>
      </Block>

      <p className="faint" style={{ fontSize: 12, marginTop: 20 }}>
        투자 판단을 돕는 참고 정보예요. 예측은 틀릴 수 있고, 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
      </p>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel about__block">
      <div className="panel__head">
        <span className="panel__title">{title}</span>
      </div>
      <dl className="panel__body about__body">{children}</dl>
    </section>
  )
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  )
}
