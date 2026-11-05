import { memo, useState } from 'react'
import type { ArbSnapshot } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import type { HlNetwork } from '../../shared/hlOrder'
import { track } from '../lib/ga'
import { fmtPct, fmtWon } from '../lib/format'
import { post } from '../lib/query'

type Tab = 'perp' | 'krx' | 'pair'
type Side = 'buy' | 'sell'

function Field({ value, onChange, unit, placeholder }: { value: string; onChange: (v: string) => void; unit?: string; placeholder?: string }) {
  return (
    <div className="field">
      <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} />
      {unit && <span className="field__unit">{unit}</span>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}

function SideTabs({ side, setSide }: { side: Side; setSide: (s: Side) => void }) {
  return (
    <div className="side-tabs">
      <button className="side-tabs__buy" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
        매수
      </button>
      <button className="side-tabs__sell" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
        매도
      </button>
    </div>
  )
}

function Result({ value, error }: { value: unknown; error: string }) {
  if (error) return <p className="notice down">{error}</p>
  if (!value) return null
  return <pre className="result num">{JSON.stringify(value, null, 2)}</pre>
}

function useRunner() {
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<unknown>(null)
  const [err, setErr] = useState('')
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
  return { busy, out, err, run }
}

function PerpForm({ asset }: { asset: Asset }) {
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('market')
  const [size, setSize] = useState('1')
  const [price, setPrice] = useState('')
  const [lev, setLev] = useState(2)
  const [network, setNetwork] = useState<HlNetwork>('testnet')
  const [via, setVia] = useState<'wallet' | 'api'>('wallet')
  const [master, setMaster] = useState<`0x${string}` | null>(null)
  const [hasAgent, setHasAgent] = useState(false)
  const { busy, out, err, run } = useRunner()
  const input = { side, size: Number(size), price: kind === 'limit' && price ? Number(price) : undefined, leverage: lev }
  const sideBtn = side === 'buy' ? 'btn--buy' : 'btn--sell'

  return (
    <div className="stack" style={{ gap: 10 }}>
      <SideTabs side={side} setSide={setSide} />
      <Row label="네트워크">
        <div className="seg" style={{ width: '100%' }}>
          <button aria-pressed={network === 'testnet'} onClick={() => setNetwork('testnet')}>
            테스트넷
          </button>
          <button aria-pressed={network === 'mainnet'} onClick={() => setNetwork('mainnet')}>
            메인넷
          </button>
        </div>
      </Row>
      <Row label="주문 가격">
        <div className="stack" style={{ gap: 6 }}>
          <div className="seg" style={{ width: '100%' }}>
            <button aria-pressed={kind === 'limit'} onClick={() => setKind('limit')}>
              지정가
            </button>
            <button aria-pressed={kind === 'market'} onClick={() => setKind('market')}>
              시장가
            </button>
          </div>
          {kind === 'limit' && <Field value={price} onChange={setPrice} unit="USDC" placeholder="가격 입력" />}
        </div>
      </Row>
      <Row label="수량">
        <Field value={size} onChange={setSize} unit="계약" />
      </Row>
      <Row label="레버리지">
        <div className="pct-chips">
          {[1, 2, 3, 5, 10].map((x) => (
            <button key={x} className="chip" aria-pressed={lev === x} onClick={() => setLev(x)}>
              {x}배
            </button>
          ))}
        </div>
      </Row>
      <Row label="서명">
        <div className="seg" style={{ width: '100%' }}>
          <button aria-pressed={via === 'wallet'} onClick={() => setVia('wallet')}>
            내 지갑
          </button>
          <button aria-pressed={via === 'api'} onClick={() => setVia('api')}>
            서버 API
          </button>
        </div>
      </Row>
      {network === 'mainnet' && <p className="notice">메인넷은 실제 돈이 오가요. 한국 종목 perp는 격리 마진 전용이고, 국내 투자자 보호 대상이 아니에요.</p>}

      {via === 'wallet' ? (
        !master ? (
          <button
            className="btn btn--lg btn--key btn--block"
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
            className="btn btn--lg btn--key btn--block"
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
            className={`btn btn--lg btn--block ${sideBtn}`}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const w = await import('./wallet')
                track('order_submit', { market: 'perp', side, asset: asset.id, network, via })
                return w.placeWithAgent(master, network, { coin: asset.perp, ...input })
              })
            }
          >
            {side === 'buy' ? '매수하기' : '매도하기'}
          </button>
        )
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn btn--lg btn--fill"
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
            className={`btn btn--lg ${sideBtn}`}
            style={{ flex: 1.4 }}
            disabled={busy || network === 'mainnet'}
            title={network === 'mainnet' ? '메인넷은 내 지갑으로만 주문할 수 있어요' : ''}
            onClick={() =>
              run(() => {
                track('order_submit', { market: 'perp', side, asset: asset.id, network, via })
                return post(`/api/v1/orders/perp?asset=${asset.id}`, { ...input, network, dryRun: false })
              })
            }
          >
            {side === 'buy' ? '매수하기' : '매도하기'}
          </button>
        </div>
      )}
      {master && (
        <p className="faint" style={{ fontSize: 12 }}>
          연결된 지갑 {master.slice(0, 6)}…{master.slice(-4)}
        </p>
      )}
      <Result value={out} error={err} />
    </div>
  )
}

function KrxForm({ asset, live }: { asset: Asset; live: boolean }) {
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('limit')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const { busy, out, err, run } = useRunner()
  const send = (dryRun: boolean) =>
    run(() => {
      track(dryRun ? 'order_preview' : 'order_submit', { market: 'krx', side, asset: asset.id })
      return post(`/api/v1/orders/krx?asset=${asset.id}`, { side, qty: Number(qty), price: kind === 'limit' && price ? Number(price) : undefined, dryRun })
    })
  return (
    <div className="stack" style={{ gap: 10 }}>
      <SideTabs side={side} setSide={setSide} />
      <Row label="주문 가격">
        <div className="stack" style={{ gap: 6 }}>
          <div className="seg" style={{ width: '100%' }}>
            <button aria-pressed={kind === 'limit'} onClick={() => setKind('limit')}>
              지정가
            </button>
            <button aria-pressed={kind === 'market'} onClick={() => setKind('market')}>
              시장가
            </button>
          </div>
          {kind === 'limit' && <Field value={price} onChange={setPrice} unit="원" placeholder="가격 입력" />}
        </div>
      </Row>
      <Row label="수량">
        <Field value={qty} onChange={setQty} unit="주" />
      </Row>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn--lg btn--fill" style={{ flex: 1 }} disabled={busy} onClick={() => send(true)}>
          미리보기
        </button>
        {live && (
          <button className={`btn btn--lg ${side === 'buy' ? 'btn--buy' : 'btn--sell'}`} style={{ flex: 1.4 }} disabled={busy} onClick={() => send(false)}>
            {side === 'buy' ? '매수하기' : '매도하기'}
          </button>
        )}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>
        {live ? '토스증권 계좌로 바로 주문돼요. 모의투자가 없어서 실제 돈이 나가요.' : '토스증권은 모의투자가 없어서 이 화면에서는 주문 내용만 확인해요. 실제 주문은 서버 주인이 켜야 돼요.'}
      </p>
      <Result value={out} error={err} />
    </div>
  )
}

function PairForm({ asset, arb, live }: { asset: Asset; arb: ArbSnapshot | null; live: boolean }) {
  const [amount, setAmount] = useState('10000000')
  const { busy, out, err, run } = useRunner()
  const dir = arb?.net.direction ?? 'perp_short_stock_long'
  const send = (dryRun: boolean) =>
    run(() => {
      track(dryRun ? 'order_preview' : 'order_submit', { market: 'pair', asset: asset.id })
      return post(`/api/v1/orders/pair?asset=${asset.id}`, { notionalKrw: Number(amount), direction: dir, network: 'testnet', dryRun })
    })
  return (
    <div className="stack" style={{ gap: 10 }}>
      {arb && (
        <div className="pair-box num">
          <div>
            <span className="muted">지금 괴리</span>
            <b className={arb.premiumPct >= 0 ? 'up' : 'down'}>{fmtPct(arb.premiumPct)}</b>
          </div>
          <div>
            <span className="muted">비용 뺀 순차익</span>
            <b className={arb.net.netPct > 0 ? 'up' : 'strong'}>{fmtPct(arb.net.netPct)}</b>
          </div>
          <p>{dir === 'perp_short_stock_long' ? 'perp 매도 + 주식 매수' : 'perp 매수 + 주식 매도'}</p>
        </div>
      )}
      <Row label="금액">
        <Field value={amount} onChange={setAmount} unit="원" />
      </Row>
      <p className="faint num" style={{ fontSize: 12 }}>
        {arb ? `약 ${Math.floor(Number(amount) / arb.krx.price)}주 · 예상 순이익 ${fmtWon((Number(amount) * arb.net.netPct) / 100)}원` : ''}
      </p>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn--lg btn--fill" style={{ flex: 1 }} disabled={busy} onClick={() => send(true)}>
          미리보기
        </button>
        {live && (
          <button className="btn btn--lg btn--key" style={{ flex: 1.4 }} disabled={busy} onClick={() => send(false)}>
            두 주문 동시에
          </button>
        )}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>
        두 주문은 동시에 나가지만 한쪽만 체결될 수 있어요. 미체결 쪽은 직접 확인해 주세요.
      </p>
      <Result value={out} error={err} />
    </div>
  )
}

function OrderPanelImpl({ asset, arb, liveKrx }: { asset: Asset; arb: ArbSnapshot | null; liveKrx: boolean }) {
  const [tab, setTab] = useState<Tab>('perp')
  const tabs: [Tab, string][] = [
    ['perp', 'perp 주문'],
    ['krx', '주식 주문'],
    ['pair', '차익 페어'],
  ]
  return (
    <section className="panel">
      <div className="panel__head">
        {tabs.map(([k, label]) => (
          <button key={k} className={k === tab ? 'panel__title' : 'chip'} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel__body">
        {tab === 'perp' && <PerpForm asset={asset} />}
        {tab === 'krx' && <KrxForm asset={asset} live={liveKrx} />}
        {tab === 'pair' && <PairForm asset={asset} arb={arb} live={liveKrx} />}
      </div>
    </section>
  )
}

export const OrderPanel = memo(OrderPanelImpl)
