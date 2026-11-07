import { useState } from 'react'
import { track } from '../lib/ga'

const origin = typeof location !== 'undefined' ? location.origin : ''

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/api/v1/arb', '두 시장 가격 차이, 평소 차이, 비용 뺀 수익 (전체 또는 ?asset=)'],
  ['GET', '/api/v1/predict?asset=SMSN', '국내 주식 3종만. 밤사이 하이퍼리퀴드 가격(원화)과 국내 마지막 가격 대비 %, 미국장 마감 때 가격, 지금 시간대에 국내 시장이 그 방향대로 열린 비율(night.follow), 보통 시작하는 범위. 장중엔 오늘 개장 직전 하이퍼리퀴드 가격(preOpen)'],
  ['GET', '/api/v1/convergence?asset=SKHX', '지난 개장 기록: 날짜별 밤사이 하이퍼리퀴드 움직임, 아침 8시 국내 움직임, 방향대로 열렸는지'],
  ['GET', '/api/v1/perps', '하이퍼리퀴드 한국 상품 7개 시세·펀딩·미결제약정'],
  ['GET', '/api/v1/series?asset=SMSN&interval=5m', '차트용 캔들(두 시장), USDC 환율, 가격 차이, 펀딩비'],
  ['GET', '/api/v1/orderbook?asset=SMSN', '하이퍼리퀴드 호가 + 국내 호가'],
  ['GET', '/api/v1/news?asset=SKHX', '날짜별 대표 이슈 (하루 1건)'],
  ['GET', '/api/v1/flows?asset=SMSN', '투자자별 순매수 (개인·외국인·기관, 주식 수와 그날 종가)'],
  ['GET', '/api/v1/status', '지금 장 상태, 다음 국내 개장(08:00)·정규장 시각'],
  ['POST', '/api/v1/orders/krx?asset=SMSN', '국내 주식 주문 미리보기 (실주문은 직접 띄운 서버에서만, 토스증권)'],
  ['POST', '/api/v1/orders/perp?asset=SMSN', '하이퍼리퀴드 주문 미리보기 (실주문은 직접 띄운 서버에서만, 기본 테스트넷)'],
  ['POST', '/api/v1/orders/pair?asset=SMSN', '시세차익 페어 주문 미리보기 (하이퍼리퀴드 + 주식 반대 방향)'],
  ['GET', '/api/v1/account/krx', '국내 계좌 잔고 (직접 띄운 서버에서 본인 계좌만)'],
  ['GET', '/api/v1/account/perp?user=0x...', '하이퍼리퀴드 지갑의 포지션·미체결 (기본 테스트넷, 실제 포지션은 &network=mainnet)'],
]

const MCP_TOOLS: [string, string, string][] = [
  ['get_arbitrage', 'asset (선택)', '두 시장 가격 차이, 평소 차이, 비용 뺀 수익. 비우면 비교 가능한 4종 전체 (SMSN·SKHX·HYUNDAI·SKHY)'],
  ['predict_open', 'asset', '다음 국내 개장 기준 밤사이 하이퍼리퀴드 가격, 미국장 단계, 이 시간대에 그 방향대로 열린 비율, 보통 시작 범위. 장중엔 개장 직전 가격(preOpen). 국내 주식 3종만'],
  ['get_convergence_history', 'asset, limit', '지난 개장 기록: 날짜별 밤사이 하이퍼리퀴드 움직임, 실제 시작 움직임, 방향대로 열렸는지. 최근 20일(limit로 변경). 국내 주식 3종만'],
  ['get_news', 'asset', '날짜별 대표 이슈 (하루 1건)'],
  ['preview_pair_order', 'asset, notionalKrw, direction', '시세차익 페어 주문 미리보기: 주식 수량과 하이퍼리퀴드 주문 내용. 실제 주문은 보내지 않아요 (하이퍼리퀴드는 테스트넷 가격 기준)'],
]

function Copy({ text, label, onCopy }: { text: string; label: string; onCopy?: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="chip chip--fill"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        onCopy?.()
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? '복사했어요' : label}
    </button>
  )
}

export default function Developers() {
  const mcpJson = JSON.stringify({ mcpServers: { bamsai: { type: 'http', url: `${origin}/api/mcp` } } }, null, 2)
  const curl = `curl "${origin}/api/v1/predict?asset=SKHX"`
  return (
    <div style={{ maxWidth: 960, padding: '20px 0 40px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '8px 0 8px' }}>자동매매 봇·AI 에이전트에 붙여 쓰는 API</h1>
      <p className="muted" style={{ margin: '0 0 32px', fontSize: 16 }}>
        화면에서 보는 숫자는 전부 같은 API에서 나와요. 키 없이 조회할 수 있고, 주문은 기본이 미리보기예요.
      </p>

      <section className="panel panel__body stack">
        <div className="row">
          <h2 className="strong" style={{ fontSize: 15, fontWeight: 700 }}>MCP로 연결하기</h2>
          <span className="spacer" />
          <Copy text={mcpJson} label="설정 복사" onCopy={() => track('mcp_copy')} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Claude, ChatGPT, Cursor 등 MCP를 지원하는 에이전트 설정에 넣으면 아래 도구를 바로 쓸 수 있어요. 공식 MCP Registry(io.github.eddyParkGG/bamsai)와 Glama에서도 찾을 수 있어요.</p>
        <pre className="code">{mcpJson}</pre>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {MCP_TOOLS.map(([name, args, desc]) => (
                <tr key={name}>
                  <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, textAlign: 'left' }}>
                    {name}
                    <span className="faint" style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>
                      {args}
                    </span>
                  </td>
                  <td className="muted" style={{ textAlign: 'left', whiteSpace: 'normal', fontWeight: 500 }}>
                    {desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel__body stack" style={{ marginTop: 16 }}>
        <div className="row">
          <h2 className="strong" style={{ fontSize: 15, fontWeight: 700 }}>REST</h2>
          <span className="spacer" />
          <a className="chip chip--fill" href="/api/openapi.json" target="_blank" rel="noreferrer">
            OpenAPI 문서
          </a>
          <Copy text={curl} label="예시 복사" />
        </div>
        <pre className="code">{curl}</pre>
        <div className="table-wrap table-wrap--full">
          <table className="table">
            <tbody>
              {ENDPOINTS.map(([m, path, desc]) => (
                <tr key={m + path}>
                  <td style={{ width: 56 }}>
                    <span className={`badge ${m === 'POST' ? 'badge--live' : ''}`}>{m}</span>
                  </td>
                  <td className="num" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, textAlign: 'left' }}>
                    {path}
                  </td>
                  <td className="muted" style={{ textAlign: 'left', whiteSpace: 'normal', fontWeight: 500 }}>
                    {desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel__body stack" style={{ marginTop: 16 }}>
        <h2 className="strong" style={{ fontSize: 15, fontWeight: 700 }}>주문 안전장치</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
          <li>bamsai.kr 서버는 실제 주문을 보내지 않아요. 국내 주식도 하이퍼리퀴드도 보낼 주문 내용(미리보기)만 돌려줘요. 다른 사람 계좌로 대신 주문하지 않아요.</li>
          <li>
            실제로 주문하려면 각자 서버를 직접 띄워야 해요.{' '}
            <a className="link" href="https://github.com/eddyParkGG/bamsaikr" target="_blank" rel="noreferrer">
              공개 저장소
            </a>{' '}
            코드에 본인 키를 넣어 실행하면, 주문은 그 키의 본인 계좌로만 나가요.
            <ul style={{ paddingLeft: 18 }}>
              <li>국내 주식: 토스증권 Open API만 지원해요. 본인 키 발급 + 서버 IP를 허용 IP로 등록 + TOSS_LIVE_ORDERS=1</li>
              <li>하이퍼리퀴드: 본인 지갑에서 승인한 에이전트 키(HL_AGENT_KEY, HL_ACCOUNT). 실제 돈(메인넷)은 HL_ALLOW_MAINNET=1까지 켜야 해요</li>
              <li>외부에서 호출할 때 쓸 API_TOKEN</li>
            </ul>
          </li>
          <li>직접 띄운 서버에서도 기본은 미리보기예요. 실제로 보내려면 dryRun=false와 Authorization: Bearer API_TOKEN 헤더가 필요해요.</li>
          <li>하이퍼리퀴드 주문은 기본이 테스트넷(연습용 네트워크)이에요. 실제 돈으로 거래하려면 network=mainnet을 넣어요.</li>
          <li>하이퍼리퀴드 주문은 출금 권한이 없는 지갑으로 서명해요. 키가 새어도 돈이 빠져나가지 않아요.</li>
          <li>MCP(AI 에이전트 연결)는 조회와 시세차익 페어 주문 미리보기만 돼요.</li>
          <li>하이퍼리퀴드 가격은 trade.xyz 오라클에 묶여 있어요. 국내 개장 직후(08:00)처럼 국내 체결이 적을 때 체결 하나로 급변하고 청산이 날 수 있어요(2026-07-28 SK하이닉스 프리마켓 1주 하한가 → perp −17.9%). 봇은 08:00 직후 순간 가격 하나로 주문하지 않는 걸 권해요.</li>
          <li>사용량을 세려고 호출한 경로와 MCP 도구 이름, 그리고 IP와 User-Agent로 만든 되돌릴 수 없는 값(해시)을 기록해요. IP 원문과 요청 내용은 저장하지 않아요.</li>
          <li>조회는 키 없이 쓸 수 있어요. 대신 IP당 1분에 300번까지예요(REST와 MCP 합산). 넘으면 429 응답이 와요.</li>
        </ul>
      </section>
    </div>
  )
}
