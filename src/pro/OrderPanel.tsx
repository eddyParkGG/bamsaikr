import { memo, useState } from 'react'
import type { ArbSnapshot } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import type { HlNetwork } from '../../shared/hlOrder'
import { track } from '../lib/ga'
import { fmtPct, fmtWon } from '../lib/format'
import { post } from '../lib/query'

type Tab = 'perp' | 'krx' | 'pair'
type Side = 'buy' | 'sell'

function Field({ label, value, onChange, suffix, placeholder }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} />
      {suffix && <span className="muted" style={{ fontSize: 14 }}>{suffix}</span>}
    </div>
  )
}

function SideSeg({ side, setSide }: { side: Side; setSide: (s: Side) => void }) {
  return (
    <div className="side-seg">
      <button aria-pressed={side === 'buy'} className="side-seg__buy" onClick={() => setSide('buy')}>
        매수
      </button>
      <button aria-pressed={side === 'sell'} className="side-seg__sell" onClick={() => setSide('sell')}>
        매도
      </button>
    </div>
  )
}

function useToken() {
  const [token, setToken] = useState(() => sessionStorage.getItem('bamsai-token') ?? '')
  return [
    token,
    (t: string) => {
      sessionStorage.setItem('bamsai-token', t)
      setToken(t)
    },
  ] as const
}

function Result({ value }: { value: unknown }) {
  if (!value) return null
  return <pre className="result num">{JSON.stringify(value, null, 2)}</pre>
}

function PerpForm({ asset }: { asset: Asset }) {
  const [side, setSide] = useState<Side>('buy')
  const [size, setSize] = useState('1')
  const [price, setPrice] = useState('')
  const [lev, setLev] = useState(2)
  const [network, setNetwork] = useState<HlNetwork>('testnet')
  const [via, setVia] = useState<'wallet' | 'api'>('wallet')
  const [master, setMaster] = useState<`0x${string}` | null>(null)
  const [hasAgent, setHasAgent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<unknown>(null)
  const [err, setErr] = useState('')
  const [token] = useToken()

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      setOut(await fn())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const input = { side, size: Number(size), price: price ? Number(price) : undefined, leverage: lev }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <SideSeg side={side} setSide={setSide} />
      <div className="row">
        <div className="seg" role="group" aria-label="네트워크">
          <button aria-pressed={network === 'testnet'} onClick={() => setNetwork('testnet')}>
            테스트넷
          </button>
          <button aria-pressed={network === 'mainnet'} onClick={() => setNetwork('mainnet')}>
            메인넷
          </button>
        </div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="주문 방식">
          <button aria-pressed={via === 'wallet'} onClick={() => setVia('wallet')}>
            내 지갑
          </button>
          <button aria-pressed={via === 'api'} onClick={() => setVia('api')}>
            서버 API
          </button>
        </div>
      </div>
      <Field label="수량" value={size} onChange={setSize} suffix="계약" />
      <Field label="가격" value={price} onChange={setPrice} suffix="USDC" placeholder="비우면 시장가" />
      <div className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>
          레버리지
        </span>
        {[1, 2, 3, 5, 10].map((x) => (
          <button key={x} className="chip chip--sm" aria-pressed={lev === x} onClick={() => setLev(x)}>
            {x}배
          </button>
        ))}
      </div>
      {network === 'mainnet' && <p className="notice">메인넷은 실제 돈이 오가요. 한국 종목 perp는 격리 마진 전용이고, 국내 투자자 보호 대상이 아니에요.</p>}

      {via === 'wallet' ? (
        !master ? (
          <button
            className="btn btn--lg btn--primary btn--block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const w = await import('./wallet')
                const m = await w.connectWallet()
                setMaster(m)
                setHasAgent(!!w.getAgent(m, network))
                track('wallet_connect', { network })
                return { connected: m }
              })
            }
          >
            지갑 연결하기
          </button>
        ) : !hasAgent ? (
          <button
            className="btn btn--lg btn--primary btn--block"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const w = await import('./wallet')
                const agent = await w.approveAgent(master, network)
                setHasAgent(true)
                return { approvedAgent: agent.address, note: '이 브라우저에만 저장돼요. 출금 권한은 없어요.' }
              })
            }
          >
            주문용 에이전트 승인하기
          </button>
        ) : (
          <button
            className={`btn btn--lg btn--block ${side === 'buy' ? 'btn--up' : 'btn--down'}`}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const w = await import('./wallet')
                track('order_submit', { market: 'perp', side, asset: asset.id, network, via })
                return w.placeWithAgent(master, network, { coin: asset.perp, ...input })
              })
            }
          >
            {side === 'buy' ? '매수' : '매도'} 주문 보내기
          </button>
        )
      ) : (
        <div className="row">
          <button
            className="btn btn--lg btn--support"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={() =>
              run(() => {
                track('order_preview', { market: 'perp', side, asset: asset.id })
                return post(`/api/v1/orders/perp?asset=${asset.id}`, { ...input, network, dryRun: true })
              })
            }
          >
            미리보기
          </button>
          <button
            className={`btn btn--lg ${side === 'buy' ? 'btn--up' : 'btn--down'}`}
            style={{ flex: 1 }}
            disabled={busy || !token}
            title={token ? '' : '설정에서 API 토큰을 넣어야 실주문할 수 있어요'}
            onClick={() =>
              run(() => {
                track('order_submit', { market: 'perp', side, asset: asset.id, network, via })
                return post(`/api/v1/orders/perp?asset=${asset.id}`, { ...input, network, dryRun: false }, token)
              })
            }
          >
            주문
          </button>
        </div>
      )}
      {master && (
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>
          연결된 지갑 {master.slice(0, 6)}…{master.slice(-4)}
        </p>
      )}
      {err && <p className="notice down">{err}</p>}
      <Result value={out} />
    </div>
  )
}

function KrxForm({ asset }: { asset: Asset }) {
  const [side, setSide] = useState<Side>('buy')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [token] = useToken()
  const [out, setOut] = useState<unknown>(null)
  const [err, setErr] = useState('')
  const send = async (dryRun: boolean) => {
    setErr('')
    try {
      track(dryRun ? 'order_preview' : 'order_submit', { market: 'krx', side, asset: asset.id })
      setOut(await post(`/api/v1/orders/krx?asset=${asset.id}`, { side, qty: Number(qty), price: price ? Number(price) : undefined, dryRun }, dryRun ? undefined : token))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  if (asset.kind === 'index') return <p className="notice">지수는 직접 살 수 없어요. KODEX 200 같은 ETF로 대신 주문해 주세요.</p>
  return (
    <div className="stack" style={{ gap: 10 }}>
      <SideSeg side={side} setSide={setSide} />
      <Field label="수량" value={qty} onChange={setQty} suffix="주" />
      <Field label="가격" value={price} onChange={setPrice} suffix="원" placeholder="비우면 시장가" />
      <div className="row">
        <button className="btn btn--lg btn--support" style={{ flex: 1 }} onClick={() => send(true)}>
          미리보기
        </button>
        <button className={`btn btn--lg ${side === 'buy' ? 'btn--up' : 'btn--down'}`} style={{ flex: 1 }} disabled={!token} onClick={() => send(false)}>
          주문
        </button>
      </div>
      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        한국투자증권 계좌로 주문해요. 서버 설정이 모의투자면 모의계좌로 나가요.
      </p>
      {err && <p className="notice down">{err}</p>}
      <Result value={out} />
    </div>
  )
}

function PairForm({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  const [amount, setAmount] = useState('10000000')
  const [out, setOut] = useState<unknown>(null)
  const [err, setErr] = useState('')
  const [token] = useToken()
  const dir = arb?.net.direction ?? 'perp_short_stock_long'
  const send = async (dryRun: boolean) => {
    setErr('')
    try {
      track(dryRun ? 'order_preview' : 'order_submit', { market: 'pair', asset: asset.id })
      setOut(await post(`/api/v1/orders/pair?asset=${asset.id}`, { notionalKrw: Number(amount), direction: dir, network: 'testnet', dryRun }, dryRun ? undefined : token))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  if (asset.kind === 'index') return <p className="notice">페어 주문은 개별 종목만 돼요.</p>
  return (
    <div className="stack" style={{ gap: 10 }}>
      {arb && (
        <div className="pair-summary">
          <div>
            <span className="muted">지금 괴리</span>
            <b className={`num ${arb.premiumPct >= 0 ? 'up' : 'down'}`}>{fmtPct(arb.premiumPct)}</b>
          </div>
          <div>
            <span className="muted">비용 뺀 순차익</span>
            <b className={`num ${arb.net.netPct > 0 ? 'up' : ''}`}>{fmtPct(arb.net.netPct)}</b>
          </div>
          <p>{dir === 'perp_short_stock_long' ? 'perp 매도 + 주식 매수' : 'perp 매수 + 주식 매도'}</p>
        </div>
      )}
      <Field label="금액" value={amount} onChange={setAmount} suffix="원" />
      <p className="faint num" style={{ fontSize: 12, margin: 0 }}>
        {arb ? `약 ${Math.floor(Number(amount) / arb.krx.price)}주 · 예상 순이익 ${fmtWon((Number(amount) * arb.net.netPct) / 100)}원` : ''}
      </p>
      <div className="row">
        <button className="btn btn--lg btn--support" style={{ flex: 1 }} onClick={() => send(true)}>
          미리보기
        </button>
        <button className="btn btn--lg btn--primary" style={{ flex: 1 }} disabled={!token} onClick={() => send(false)}>
          두 주문 동시에
        </button>
      </div>
      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        두 주문은 동시에 나가지만 한쪽만 체결될 수 있어요. 미체결 쪽은 직접 확인해 주세요.
      </p>
      {err && <p className="notice down">{err}</p>}
      <Result value={out} />
    </div>
  )
}

function OrderPanelImpl({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  const [tab, setTab] = useState<Tab>('perp')
  const [token, setToken] = useToken()
  const [showToken, setShowToken] = useState(false)
  return (
    <section className="card card--tight panel">
      <div className="tabs" role="tablist">
        {(
          [
            ['perp', 'perp'],
            ['krx', '주식'],
            ['pair', '차익 페어'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
        <span className="spacer" />
        <button className="faint" style={{ fontSize: 12, paddingBottom: 10 }} onClick={() => setShowToken(!showToken)}>
          {token ? 'API 토큰 ✓' : 'API 토큰'}
        </button>
      </div>
      {showToken && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>토큰</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} style={{ textAlign: 'left' }} placeholder="서버 API_TOKEN" />
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        {tab === 'perp' && <PerpForm asset={asset} />}
        {tab === 'krx' && <KrxForm asset={asset} />}
        {tab === 'pair' && <PairForm asset={asset} arb={arb} />}
      </div>
    </section>
  )
}

export const OrderPanel = memo(OrderPanelImpl)
