import { forwardRef, memo, useEffect, useRef, useState } from 'react'
import { krxTick, perpTick, snap, useTicket } from './ticket'
import type { ArbSnapshot } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { track } from '../lib/ga'
import { fmtPct, fmtWon, tone } from '../lib/format'
import { openLaunchNotify } from '../components/LaunchNotify'

type Tab = 'perp' | 'krx' | 'pair'
type Side = 'buy' | 'sell'

/** 1261000 → 1,261,000; keeps whatever is typed after the decimal point */
const withCommas = (v: string) => {
  if (!v) return v
  const [i, f] = v.split('.')
  return (i ? Number(i).toLocaleString('en-US') : '0') + (f != null ? `.${f}` : '')
}

const Field = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; unit?: string; placeholder?: string; flash?: number; step?: number }>(function Field(
  { value, onChange, unit, placeholder, flash, step },
  ref,
) {
  const bump = (dir: 1 | -1) => {
    const v = Number(value) || 0
    onChange(String(Math.max(0, snap(v + dir * (step ?? 1), step ?? 1))))
  }
  return (
    <div className="field-row">
      <div className={`field ${flash ? 'field--flash' : ''}`} key={flash}>
        <input
          ref={ref}
          inputMode="decimal"
          value={withCommas(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => {
            if (!step) return
            if (e.key === 'ArrowUp') (e.preventDefault(), bump(1))
            if (e.key === 'ArrowDown') (e.preventDefault(), bump(-1))
          }}
        />
        {unit && <span className="field__unit">{unit}</span>}
      </div>
      {step != null && (
        <div className="stepper">
          <button type="button" aria-label="내리기" onClick={() => bump(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14" />
            </svg>
          </button>
          <button type="button" aria-label="올리기" onClick={() => bump(1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
})

/** Apply a price picked in the order book: limit order, that price, cursor to quantity */
function usePicked(market: 'perp' | 'krx', onPick: (price: number) => void) {
  const pick = useTicket((s) => s.pick)
  // A form mounted by the same click (tab switch) still applies that pick
  const seen = useRef(pick && Date.now() - pick.t < 1000 ? -1 : (pick?.n ?? 0))
  useEffect(() => {
    if (!pick || pick.market !== market || pick.n === seen.current) return
    seen.current = pick.n
    onPick(pick.price)
  }, [pick, market]) // eslint-disable-line react-hooks/exhaustive-deps
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

function OrderButton({ side, label, onClick }: { side?: Side; label: string; onClick: () => void }) {
  return (
    <button className={`btn btn--lg btn--block ${side === 'buy' ? 'btn--buy' : side === 'sell' ? 'btn--sell' : 'btn--key'}`} onClick={onClick}>
      {label}
    </button>
  )
}

function PerpForm({ asset }: { asset: Asset }) {
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('market')
  const [size, setSize] = useState('1')
  const [price, setPrice] = useState('')
  const [lev, setLev] = useState(2)
  const sizeRef = useRef<HTMLInputElement>(null)
  const [flash, setFlash] = useState(0)
  usePicked('perp', (px) => {
    setKind('limit')
    setPrice(String(px))
    setFlash((f) => f + 1)
    requestAnimationFrame(() => sizeRef.current?.focus())
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
          {kind === 'limit' && <Field value={price} onChange={setPrice} unit="USDC" placeholder="가격 입력" flash={flash} step={perpTick(Number(price))} />}
        </div>
      </Row>
      <Row label="수량">
        <Field ref={sizeRef} value={size} onChange={setSize} unit="계약" />
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
      <OrderButton
        side={side}
        label={side === 'buy' ? '매수하기' : '매도하기'}
        onClick={() => {
          track('order_submit', { market: 'perp', side, asset: asset.id, kind, leverage: lev })
          openLaunchNotify(`${asset.name} 하이퍼리퀴드 ${side === 'buy' ? '매수' : '매도'}`)
        }}
      />
    </div>
  )
}

function KrxForm({ asset }: { asset: Asset }) {
  const [side, setSide] = useState<Side>('buy')
  const [kind, setKind] = useState<'limit' | 'market'>('limit')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const qtyRef = useRef<HTMLInputElement>(null)
  const [flash, setFlash] = useState(0)
  usePicked('krx', (px) => {
    setKind('limit')
    setPrice(String(px))
    setFlash((f) => f + 1)
    requestAnimationFrame(() => qtyRef.current?.focus())
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
          {kind === 'limit' && <Field value={price} onChange={setPrice} unit="원" placeholder="가격 입력" flash={flash} step={krxTick(Number(price))} />}
        </div>
      </Row>
      <Row label="수량">
        <Field ref={qtyRef} value={qty} onChange={setQty} unit="주" />
      </Row>
      <OrderButton
        side={side}
        label={side === 'buy' ? '매수하기' : '매도하기'}
        onClick={() => {
          track('order_submit', { market: 'krx', side, asset: asset.id, kind })
          openLaunchNotify(`${asset.name} ${side === 'buy' ? '매수' : '매도'}`)
        }}
      />
    </div>
  )
}

function PairForm({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  const [amount, setAmount] = useState('10000000')
  const dir = arb?.net.direction ?? 'perp_short_stock_long'
  return (
    <div className="stack" style={{ gap: 10 }}>
      {arb && (
        <div className="pair-box num">
          <div>
            <span className="muted">지금 가격 차이</span>
            <b className={tone(arb.premiumPct)} data-fit>{fmtPct(arb.premiumPct)}</b>
          </div>
          <div>
            <span className="muted">비용 뺀 순차익</span>
            <b className={tone(arb.net.netPct)} data-fit>{fmtPct(arb.net.netPct)}</b>
          </div>
          <p>{dir === 'perp_short_stock_long' ? '하이퍼리퀴드 매도 + 주식 매수' : '하이퍼리퀴드 매수 + 주식 매도'}</p>
        </div>
      )}
      <Row label="금액">
        <Field value={amount} onChange={setAmount} unit="원" />
      </Row>
      <p className="faint num" style={{ fontSize: 12 }}>
        {arb ? `약 ${Math.floor(Number(amount) / arb.krx.price)}주 · 예상 순이익 ${fmtWon((Number(amount) * arb.net.netPct) / 100)}원` : ''}
      </p>
      <OrderButton
        label="실행하기"
        onClick={() => {
          track('order_submit', { market: 'pair', asset: asset.id })
          openLaunchNotify(`${asset.name} 시세차익 페어 주문`)
        }}
      />
    </div>
  )
}

function OrderPanelImpl({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null; liveKrx?: boolean }) {
  const [tab, setTab] = useState<Tab>(asset.kind === 'stock' ? 'krx' : 'perp')
  const tabs: [Tab, string][] =
    asset.kind === 'stock'
      ? [
          ['krx', '국내 시장'],
          ['perp', '하이퍼리퀴드'],
          ['pair', '시세차익 기회'],
        ]
      : [['perp', '하이퍼리퀴드']]
  useEffect(() => setTab(asset.kind === 'stock' ? 'krx' : 'perp'), [asset.id, asset.kind])
  // "시세차익" on the top bar opens the pair tab and scrolls to the bottom so the whole order panel shows
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Tab>).detail
      if (t === 'pair' && asset.kind !== 'stock') return
      setTab(t)
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
    }
    window.addEventListener('bamsai:order-tab', on)
    return () => window.removeEventListener('bamsai:order-tab', on)
  }, [asset.kind])
  // A price picked in the order book opens the matching order tab
  const pick = useTicket((s) => s.pick)
  useEffect(() => {
    if (!pick) return
    if (pick.market === 'perp') setTab('perp')
    else if (asset.kind === 'stock') setTab('krx')
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel__head">
        <span className="panel__title">주문</span>
        <span className="spacer" />
        {tabs.length > 1 && (
          <div className="seg seg--sm" role="group" aria-label="주문 종류">
            {tabs.map(([k, label]) => (
              <button key={k} aria-pressed={k === tab} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel__body order-form">
        {tab === 'perp' && <PerpForm asset={asset} />}
        {tab === 'krx' && <KrxForm asset={asset} />}
        {tab === 'pair' && <PairForm asset={asset} arb={arb} />}
      </div>
    </section>
  )
}

export const OrderPanel = memo(OrderPanelImpl)
