import { useArb, usePredictions } from '../lib/data'
import { fmtPct } from '../lib/format'

/** How every number on the site is worked out, in plain words with one worked example */
export default function About() {
  const preds = usePredictions()
  // Hit rate by where the night stood against the US session (weeknights, one count per open), averaged over the main stocks
  const stage = (() => {
    const items = preds.data?.items.filter((p) => p.backtest.followByStage && p.backtest.liquidScored >= 30) ?? []
    if (!items.length) return null
    const avg = (k: 'before' | 'during' | 'after') => `${Math.round(items.reduce((s, p) => s + (p.backtest.followByStage.overnight[k].ratePct ?? 0), 0) / items.length)}%`
    return { before: avg('before'), during: avg('during'), after: avg('after') }
  })()
  const arb = useArb()
  return (
    <div className="easy about">
      <section className="easy-hero">
        <h1>밤사이는 이렇게 계산해요</h1>
        <p>
          국내 주식시장은 저녁 8시에 닫혀서 다음 날 아침 8시에 다시 열려요. 그 사이에도 하이퍼리퀴드라는 해외 거래소에서는 삼성전자·SK하이닉스·현대차가 계속 거래돼요. 밤사이는 이 가격을 원화로 바꾸고, 지난 개장일마다 국내 시장이 그 방향대로 열린 비율을 함께 보여드려요. 장 시작 가격은 이걸 보고 직접 가늠해 보세요.
        </p>
      </section>

      <Block title="해외 가격을 원화로 바꾸는 법">
        <Fact k="어떻게">하이퍼리퀴드에서는 가격이 USDC(달러와 1:1로 묶인 코인)로 매겨져요. 여기에 업비트의 USDC 원화 가격을 곱해 원화로 바꿔요.</Fact>
        <Fact k="왜 업비트 가격">은행 환율이 아니라, 실제로 원화를 USDC로 바꿀 때 내는 가격이라서요.</Fact>
      </Block>

      <Block title="밤사이 가격은 이렇게 보여드려요">
        <Fact k="언제 보여주나">저녁 8시부터 아침 8시까지 국내 시장이 닫혀 있을 땐 지금 하이퍼리퀴드 가격을 보여드려요. 장이 열려 있을 땐 미국장이 닫힌 뒤, 국내 개장 직전 하이퍼리퀴드 가격을 국내 지금 가격과 나란히 보여드려요.</Fact>
        <Fact k="1. 밤사이 움직임">하이퍼리퀴드 가격이 어제 저녁 8시 국내 마지막 가격보다 몇 % 오르거나 내렸는지 보여드려요.</Fact>
        <Fact k="2. 언제 본 가격이냐가 중요해요">
          밤사이 가장 크게 움직이는 건 미국장이 열려 있는 동안이에요(겨울 밤 11시 반~새벽 6시, 여름 밤 10시 반~새벽 5시). 그래서 미국장이 닫힌 뒤 가격이 다음 날
          시작 가격과 가장 가까워요.
          {stage && (
            <>
              {' '}
              평일 밤 기준으로 그 시간대에 본 하이퍼리퀴드 방향대로 국내 시장이 열린 비율은 미국장 열리기 전 {stage.before}, 열려 있는 동안 {stage.during}, 닫힌 뒤{' '}
              {stage.after}였어요.
            </>
          )}
        </Fact>
        <Fact k="3. 이 방향대로 열린 비율">지금과 같은 시간대에 하이퍼리퀴드 가격을 봤던 지난 개장일 중, 국내 시장이 그 방향(오름·내림)으로 시작한 비율이에요. 개장일마다 한 번씩 세요. 앞으로 오를지 내릴지를 약속하는 숫자가 아니에요.</Fact>
        <Fact k="4. 보통 이 안에서 시작">지난 기록으로 보면 10번 중 8번은 이 범위 안에서 시작했어요. 장 열리기까지 시간이 많이 남았으면 그사이 더 움직일 수 있어서 범위를 넓게 잡아요.</Fact>
        <Fact k="무엇과 비교하나">아침 8시~8시 10분 국내 평균 가격과 비교해요. 8시 첫 거래는 몇 건 안 돼서 가격이 튀기 쉬워요.</Fact>
        <div className="calc">
          <p className="calc__title">예시 · 11월 4일 SK하이닉스</p>
          <Fact k="어제 저녁 8시 국내 가격">1,414,000원</Fact>
          <Fact k="아침 8시 하이퍼리퀴드 가격">1,461,621원 (밤사이 +3.37%)</Fact>
          <Fact k="보통 이 안에서 시작">1,428,000원 ~ 1,477,200원</Fact>
          <Fact k="실제 시작 가격">
            <b>1,451,776원 (+2.67%)</b> · 하이퍼리퀴드 방향대로 열렸고, 범위 안이었어요
          </Fact>
        </div>
        {preds.data && (
          <Fact k="지금까지 이 방향대로 열린 비율">
            {preds.data.items
              .filter((p) => p.backtest.liquidScored >= 30)
              .map((p) => `${p.name}는 100번 중 ${Math.round(p.backtest.liquidRatePct ?? 0)}번`)
              .join(', ')}{' '}
            아침 8시 하이퍼리퀴드가 움직인 방향대로 시작했어요.
            <span className="faint"> (4월 13일부터, 하이퍼리퀴드 거래가 충분했던 밤 기준)</span>
          </Fact>
        )}
      </Block>

      <Block title="'거래 적어 덜 정확'이 붙는 날">
        <Fact k="언제">밤사이 하이퍼리퀴드 거래가 100만 달러(약 13억 원)도 안 될 때요.</Fact>
        <Fact k="왜">거래가 적으면 주문 몇 건에도 가격이 크게 흔들려서 그 가격을 믿기 어려워요. 실제로 이런 밤은 방향이 맞은 게 3번 중 2번꼴이었어요.</Fact>
        <Fact k="왜 100만 달러">지난 기록을 거래대금별로 나눠 보니 100만 달러 아래에서 크게 떨어져서 정했어요. 기준을 0~500만 달러로 바꿔 봐도 거래가 충분한 밤의 비율은 85~89%로 거의 같아요.</Fact>
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
        <Fact k="할 수 있는 경우">하이퍼리퀴드가 평소보다 비쌀 때만요. 하이퍼리퀴드에서 팔고 국내에서 사두면 돼요. 반대로 쌀 때는 국내 주식을 빌려서 팔아야 하는데, 개인은 하기 어려워요. 그 밖의 경우는 '아직 시세차익 기회가 없어요'로 보여드려요.</Fact>
        <Fact k="한계">호가 중간 가격으로 계산해요. 큰 금액을 주문하면 호가가 밀려 덜 남을 수 있어요.</Fact>
        <Fact k="오라클 위험">하이퍼리퀴드 가격은 trade.xyz 오라클에 묶여 있어서, 국내 개장 직후처럼 국내 체결이 적을 때 체결 하나로 크게 움직이고 청산이 날 수 있어요(2026-07-28 SK하이닉스 −17.9%). 이런 순간에도 시세차익은 실제 호가 그대로 계산하지만, 추가 급변 시 청산 위험이 커요.</Fact>
      </Block>

      <Block title="데이터는 어디서 오나요">
        <Fact k="하이퍼리퀴드">공식 API에서 3초마다 받아요.</Fact>
        <Fact k="국내 시장">정규장과 넥스트레이드 시세를 3초마다 받아요.</Fact>
        <Fact k="환율">업비트 원/USDC 호가를 3초마다 받아요.</Fact>
        <Fact k="이 방향대로 열린 비율">매일 아침 개장 결과를 더해 다시 세요. 화면에는 15초마다 새로 불러와요.</Fact>
      </Block>

      <Block title="지난 개장 기록 보는 법">
        <Fact k="따라감">하이퍼리퀴드가 밤사이 오르면 아침에도 오르고, 내리면 내리며 시작했다는 뜻이에요. 둘 중 하나라도 거의 안 움직였으면 '거의 그대로'로 따로 봐요.</Fact>
        <Fact k="따라간 정도">하이퍼리퀴드가 움직인 만큼을 100으로 볼 때 국내가 얼마나 움직여 시작했는지예요. 100%면 똑같이, 50%면 절반만 움직였어요.</Fact>
        <Fact k="만난 지점">아침 8시~9시 사이 두 가격이 결국 어디서 만났는지예요. 국내 가격이 하이퍼리퀴드 쪽으로 갔는지, 하이퍼리퀴드가 국내 쪽으로 왔는지 알 수 있어요.</Fact>
        <Fact k="밤사이 거래">그날 밤 하이퍼리퀴드에서 거래된 금액이에요. 적은 날은 '적음'이라고 붙여요.</Fact>
      </Block>

      <p className="faint" style={{ fontSize: 12, marginTop: 20 }}>
        참고 정보예요. 과거 비율이 앞으로도 같다는 보장은 없고, 투자 결과는 본인에게 돌아가요. 하이퍼리퀴드 거래는 국내 투자자 보호 대상이 아니에요.
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
