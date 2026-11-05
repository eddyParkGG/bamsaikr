import { memo, useEffect, useState } from 'react'
import type { Asset } from '../../shared/assets'
import { fmtPrice, fmtUsd } from '../lib/format'
import { subscribeHl, useLive, type Level } from '../lib/live'
import { useQuery } from '../lib/query'

type Tab = 'perp' | 'krx' | 'nxt'
interface KrxBook {
  asks: Level[]
  bids: Level[]
  expected: { price: number; volume: number; changePct: number } | null
}

const ROWS = 10

function Book({ asks, bids, fmt, sizeFmt }: { asks: Level[]; bids: Level[]; fmt: (v: number) => string; sizeFmt: (v: number) => string }) {
  const a = asks.slice(0, ROWS).reverse()
  const b = bids.slice(0, ROWS)
  const max = Math.max(1, ...a.map((l) => l.sz), ...b.map((l) => l.sz))
  return (
    <div className="ob num">
      {a.map((l, i) => (
        <div className="ob__row ob__row--ask" key={`a${i}`}>
          <span className="ob__size">
            <i style={{ width: `${(l.sz / max) * 100}%` }} />
            {sizeFmt(l.sz)}
          </span>
          <span className="ob__px down">{fmt(l.px)}</span>
          <span />
        </div>
      ))}
      <div className="ob__mid" />
      {b.map((l, i) => (
        <div className="ob__row ob__row--bid" key={`b${i}`}>
          <span />
          <span className="ob__px up">{fmt(l.px)}</span>
          <span className="ob__size ob__size--bid">
            <i style={{ width: `${(l.sz / max) * 100}%` }} />
            {sizeFmt(l.sz)}
          </span>
        </div>
      ))}
    </div>
  )
}

function OrderbookImpl({ asset, krxAvailable }: { asset: Asset; krxAvailable: boolean }) {
  const [tab, setTab] = useState<Tab>('perp')
  const [unit, setUnit] = useState<'krw' | 'usd'>('krw')
  useEffect(() => subscribeHl({ type: 'l2Book', coin: asset.perp }), [asset.perp])
  const book = useLive((s) => s.book[asset.perp])
  const rate = useLive((s) => s.usdc?.rate)
  const krx = useQuery<{ krx: KrxBook | null; nxt: KrxBook | null }>(tab !== 'perp' && krxAvailable ? `/api/v1/orderbook?asset=${asset.id}` : null, 2000)

  const conv = asset.fx && unit === 'krw' && rate ? rate : 1
  const perpFmt = (v: number) => (conv === 1 ? fmtUsd(v) : fmtPrice(v * conv, asset.kind === 'index'))
  const kb = tab === 'krx' ? krx.data?.krx : tab === 'nxt' ? krx.data?.nxt : null

  return (
    <section className="card card--tight panel">
      <div className="panel__head">
        <div className="seg" role="group" aria-label="호가 시장">
          <button aria-pressed={tab === 'perp'} onClick={() => setTab('perp')}>
            perp
          </button>
          <button aria-pressed={tab === 'krx'} onClick={() => setTab('krx')}>
            KRX
          </button>
          <button aria-pressed={tab === 'nxt'} onClick={() => setTab('nxt')}>
            NXT
          </button>
        </div>
        {tab === 'perp' && asset.fx && (
          <button className="chip chip--sm" onClick={() => setUnit(unit === 'krw' ? 'usd' : 'krw')}>
            {unit === 'krw' ? '원화 환산' : 'USDC'}
          </button>
        )}
      </div>
      {tab === 'perp' ? (
        book ? (
          <Book asks={book.asks} bids={book.bids} fmt={perpFmt} sizeFmt={(v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} />
        ) : (
          <div className="skeleton" style={{ height: 420 }} />
        )
      ) : !krxAvailable ? (
        <p className="notice">국내 호가는 한국투자증권 API를 연결하면 볼 수 있어요.</p>
      ) : kb ? (
        <>
          <Book asks={kb.asks} bids={kb.bids} fmt={(v) => fmtPrice(v)} sizeFmt={(v) => v.toLocaleString('ko-KR')} />
          {kb.expected && kb.expected.price > 0 && (
            <dl className="kv">
              <dt>예상 체결가</dt>
              <dd>
                {fmtPrice(kb.expected.price)}원 ({kb.expected.changePct > 0 ? '+' : ''}
                {kb.expected.changePct}%)
              </dd>
            </dl>
          )}
        </>
      ) : krx.error ? (
        <p className="notice">{krx.error.message}</p>
      ) : (
        <div className="skeleton" style={{ height: 420 }} />
      )}
    </section>
  )
}

export const Orderbook = memo(OrderbookImpl)
