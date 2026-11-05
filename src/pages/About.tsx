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
        <p>국내 시장(정규장·넥스트레이드)이 닫힌 저녁 8시부터 아침 8시까지도 하이퍼리퀴드에서는 삼성전자·SK하이닉스·현대차가 거래돼요. 이 가격으로 내일 아침 가격과 시세차익 기회를 계산해요.</p>
      </section>

      <Block title="하이퍼리퀴드 가격을 원화로">
        <Fact k="계산">하이퍼리퀴드 가격(USDC) × 업비트 USDC 원화 가격</Fact>
        <Fact k="왜 USDC">하이퍼리퀴드는 USDC로 거래해요. 은행 달러 환율보다 실제로 돈을 옮기는 값에 가까워요</Fact>
      </Block>

      <Block title="내일 아침 예상 가격">
        <Fact k="언제">저녁 8시 국내 시장이 닫힌 뒤부터 아침 8시 다시 열릴 때까지 보여줘요</Fact>
        <Fact k="1. 밤사이 차이">지금 하이퍼리퀴드 가격이 어제 저녁 8시 국내 가격보다 몇 % 움직였는지</Fact>
        <Fact k="2. 예상 움직임">밤사이 차이 × 지난 장 시작들에서 국내가 하이퍼리퀴드를 따라간 정도</Fact>
        <Fact k="3. 범위">지난 예측이 빗나간 폭에, 장 열리기까지 남은 시간만큼 더 넓혀요. 10번 중 8번 들어오는 범위가 80% 구간이에요</Fact>
        <Fact k="4. 오를 확률">예상 움직임과 범위로 계산한, 어제 저녁 8시 가격보다 높게 시작할 확률</Fact>
        <Fact k="맞힐 대상">아침 8시~8시 10분 국내 평균 가격. 8시 첫 거래는 거래가 적어 들쭉날쭉해서 10분 평균을 써요</Fact>
        <div className="calc">
          <p className="calc__title">예시 · SK하이닉스 11월 4일 아침</p>
          <Fact k="어제 저녁 8시">1,414,000원</Fact>
          <Fact k="아침 8시 하이퍼리퀴드">1,461,621원 (+3.37%)</Fact>
          <Fact k="예상">약 1,452,500원 (+2.72%) · 오를 확률 약 98%</Fact>
          <Fact k="80% 구간">약 1,427,700원 ~ 1,477,200원</Fact>
          <Fact k="실제">
            <b>1,451,776원 (+2.67%)</b> · 방향도 범위도 맞았어요
          </Fact>
        </div>
        <Fact k="지금까지">
          {preds.data
            ? preds.data.items
                .map((p) => (p.backtest.liquidScored < 30 ? `${p.name} 판단 보류` : `${p.name} ${Math.round(p.backtest.liquidRatePct ?? 0)}%`))
                .join(' · ')
            : '불러오는 중'}
          <span className="faint"> (하이퍼리퀴드 방향대로 시작한 비율, 거래 충분한 밤 기준)</span>
        </Fact>
      </Block>

      <Block title="'거래 적어 덜 정확' 표시">
        <Fact k="기준">밤사이 하이퍼리퀴드 거래가 100만 달러(약 13억 원)보다 적을 때</Fact>
        <Fact k="이유">거래가 적으면 몇 건의 주문에도 가격이 흔들려요. 이런 밤은 하이퍼리퀴드 방향대로 시작한 비율이 67%로, 거래가 충분한 밤(86%)보다 낮았어요</Fact>
      </Block>

      <Block title="시세차익 기회">
        <Fact k="계산">(지금 가격 차이 − 평소 차이) − 수수료·세금·환전·펀딩비</Fact>
        <Fact k="평소 차이">
          최근 5거래일 정규장 시간 가격 차이의 중간값이에요. 두 가격 차이는 0으로 돌아가지 않고 평소 수준에서 움직여서, 평소보다 더 벌어진 만큼만 기회로 봐요
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
        <Fact k="비용">주식 수수료 왕복 0.03% + 매도 세금 0.20% · 하이퍼리퀴드 수수료 왕복 0.018% · 업비트 환전 · 1시간 펀딩비</Fact>
        <Fact k="실행 방향">해외 가격이 평소보다 비쌀 때만 실행할 수 있어요 (해외에서 팔고 국내 주식을 사요). 반대는 주식을 빌려 팔아야 해서 개인은 어려워요</Fact>
      </Block>

      <Block title="예측 기록 보는 법">
        <Fact k="따라감">밤사이 하이퍼리퀴드가 움직인 방향대로 아침 8시 국내 시장이 시작했어요. 둘 중 하나라도 ±0.05% 안쪽이면 '거의 그대로'</Fact>
        <Fact k="따라간 정도">실제 시작 차이 ÷ 하이퍼리퀴드 차이. 100%면 그대로, 50%면 절반만 따라갔어요</Fact>
        <Fact k="만난 지점">아침 8시~9시에 두 가격이 어디서 만났는지. 주식이 하이퍼리퀴드 쪽으로 갔는지, 그 반대인지 보여줘요</Fact>
        <Fact k="밤사이 거래">그날 밤 하이퍼리퀴드 거래대금이에요. 적으면 '적음'으로 표시해요</Fact>
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
