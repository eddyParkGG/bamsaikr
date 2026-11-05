import { useState } from 'react'
import { track } from '../lib/ga'

const origin = typeof location !== 'undefined' ? location.origin : ''

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/api/v1/arb', '두 시장 괴리율과 비용 뺀 순차익 (전체 또는 ?asset=)'],
  ['GET', '/api/v1/predict?asset=SMSN', '내일 아침 8시 국내 시장 예상: 오를 확률, 예상 가격, 80% 구간, 하이퍼리퀴드 방향 적중률'],
  ['GET', '/api/v1/convergence?asset=SKHX', '예측 기록: 날짜별 밤사이 하이퍼리퀴드 움직임, 아침 8시 국내 움직임, 방향대로 열렸는지'],
  ['GET', '/api/v1/perps', '하이퍼리퀴드 한국 상품 7개 시세·펀딩·미결제약정'],
  ['GET', '/api/v1/series?asset=SMSN&interval=5m', '차트용 캔들(두 시장), USDC 환율, 괴리율, 펀딩비'],
  ['GET', '/api/v1/orderbook?asset=SMSN', '하이퍼리퀴드 호가 + 국내 호가'],
  ['GET', '/api/v1/news?asset=SKHX', '날짜별 대표 이슈 (하루 1건)'],
  ['GET', '/api/v1/flows?asset=SMSN', '투자자별 순매수 (개인·외국인·기관, 주식 수와 그날 종가)'],
  ['GET', '/api/v1/status', '지금 장 상태, 다음 국내 개장(08:00)·정규장 시각'],
  ['POST', '/api/v1/orders/krx?asset=SMSN', '국내 주식 주문 (기본 dryRun)'],
  ['POST', '/api/v1/orders/perp?asset=SMSN', '하이퍼리퀴드 주문 (기본 dryRun, 테스트넷)'],
  ['POST', '/api/v1/orders/pair?asset=SMSN', '시세차익 페어 주문 (하이퍼리퀴드 + 주식 반대 방향)'],
  ['GET', '/api/v1/account/krx', '국내 계좌 잔고 (실주문을 켠 서버만)'],
  ['GET', '/api/v1/account/perp?user=0x...', 'HL 포지션·미체결'],
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
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '8px 0 8px' }}>에이전트에 붙여 쓰는 API</h1>
      <p className="muted" style={{ margin: '0 0 32px', fontSize: 16 }}>
        화면에서 보는 숫자는 전부 같은 API에서 나와요. 키 없이 조회할 수 있고, 주문은 기본이 미리보기예요.
      </p>

      <section className="panel panel__body stack">
        <div className="row">
          <h2 className="strong" style={{ fontSize: 15, fontWeight: 700 }}>MCP로 연결하기</h2>
          <span className="spacer" />
          <Copy text={mcpJson} label="설정 복사" onCopy={() => track('mcp_copy')} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Claude, Cursor 같은 에이전트 설정에 넣으면 아래 도구를 바로 쓸 수 있어요.</p>
        <pre className="code">{mcpJson}</pre>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          도구: get_arbitrage · predict_open · get_convergence_history · get_news · preview_pair_order
        </p>
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
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {ENDPOINTS.map(([m, path, desc]) => (
                <tr key={m + path}>
                  <td style={{ width: 56 }}>
                    <span className={`badge ${m === 'POST' ? 'badge--live' : ''}`}>{m}</span>
                  </td>
                  <td className="num" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>
                    {path}
                  </td>
                  <td className="muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel__body stack" style={{ marginTop: 16 }}>
        <h2 className="strong" style={{ fontSize: 15, fontWeight: 700 }}>주문 안전장치</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
          <li>모든 주문 API는 기본이 dryRun이에요. 보낼 내용만 돌려주고 실제로는 보내지 않아요.</li>
          <li>실주문은 서버에 API_TOKEN을 설정하고 Authorization: Bearer 헤더를 넣어야 해요.</li>
          <li>하이퍼리퀴드는 기본이 테스트넷이에요. 메인넷은 서버에서 따로 열어야 해요.</li>
          <li>하이퍼리퀴드 주문은 출금 권한이 없는 에이전트 지갑으로만 서명해요.</li>
          <li>MCP에는 주문 미리보기만 열어뒀어요.</li>
        </ul>
      </section>
    </div>
  )
}
