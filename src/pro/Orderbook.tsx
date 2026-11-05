import { memo, useEffect, useState } from 'react'
import type { Asset } from '../../shared/assets'
import { fmtPrice, fmtUsd } from '../lib/format'
import { subscribeHl, subscribeKrx, useLive, type Level } from '../lib/live'
import { useQuery } from '../lib/query'

type Tab = 'perp' | 'krx'
const ROWS = 8

function Book({ asks, bids, fmt, sizeFmt }: { asks: Level[]; bids: Level[]; fmt: (v: number) => string; sizeFmt: (v: number) => string }) {
  const a = asks.slice(0, ROWS).reverse()
  const b = bids.slice(0, ROWS)
  const max = Math.max(1, ...a.map((l) => l.sz), ...b.map((l) => l.sz))
  const sum = (ls: Level[]) => ls.reduce((s, l) => s + l.sz, 0)
  return (
    <>
      <div className="ob num">
        {a.map((l, i) => (
          <div className="ob__row ob__row--ask" key={`a${i}`}>
            <span className="ob__size">
              <i style={{ width: `${(l.sz / max) * 100}%` }} />
              <span>{sizeFmt(l.sz)}</span>
            </span>
            <span className="ob__px down" data-fit>{fmt(l.px)}</span>
            <span />
          </div>
        ))}
        <div className="ob__mid" />
        {b.map((l, i) => (
          <div className="ob__row ob__row--bid" key={`b${i}`}>
            <span />
            <span className="ob__px up" data-fit>{fmt(l.px)}</span>
            <span className="ob__size ob__size--bid">
              <i style={{ width: `${(l.sz / max) * 100}%` }} />
              <span>{sizeFmt(l.sz)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="ob__foot num">
        <span>
          판매대기 <b className="strong">{sizeFmt(sum(a))}</b>
        </span>
        <span>
          구매대기 <b className="strong">{sizeFmt(sum(b))}</b>
        </span>
      </div>
    </>
  )
}

function OrderbookImpl({ asset }: { asset: Asset }) {
  const [tab, setTab] = useState<Tab>('perp')
  const [unit, setUnit] = useState<'krw' | 'usd'>('krw')
  useEffect(() => subscribeHl({ type: 'l2Book', coin: asset.perp }), [asset.perp])
  useEffect(() => subscribeKrx(asset.id, asset.krxCode), [asset.id, asset.krxCode])
  const book = useLive((s) => s.book[asset.perp])
  const krxLive = useLive((s) => s.krxBook[asset.krxCode])
  const rate = useLive((s) => s.usdc?.rate)
  // Use the Toss REST orderbook for the first render until live data arrives
  const first = useQuery<{ krx: { asks: Level[]; bids: Level[] } }>(tab === 'krx' && !krxLive ? `/api/v1/orderbook?asset=${asset.id}` : null)
  const krx = krxLive ?? first.data?.krx

  const conv = asset.fx && unit === 'krw' && rate ? rate : 1
  const perpFmt = (v: number) => (conv === 1 ? fmtUsd(v) : fmtPrice(v * conv))

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">호가</span>
        <span className="spacer" />
        {tab === 'perp' && (
          <button className="chip" onClick={() => setUnit(unit === 'krw' ? 'usd' : 'krw')} title="표시 단위">
            {unit === 'krw' ? '원' : '$'}
          </button>
        )}
        <div className="seg" role="group" aria-label="호가 시장" style={{ width: 130 }}>
          <button aria-pressed={tab === 'perp'} onClick={() => setTab('perp')}>
            perp
          </button>
          <button aria-pressed={tab === 'krx'} onClick={() => setTab('krx')}>
            국내
          </button>
        </div>
      </div>
      <div className="panel__body" style={{ padding: '8px 12px 12px' }}>
        {tab === 'perp' ? (
          book ? (
            <Book asks={book.asks} bids={book.bids} fmt={perpFmt} sizeFmt={(v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} />
          ) : (
            <div className="skeleton" style={{ height: 440 }} />
          )
        ) : krx ? (
          <Book asks={krx.asks} bids={krx.bids} fmt={(v) => fmtPrice(v)} sizeFmt={(v) => v.toLocaleString('ko-KR')} />
        ) : first.error ? (
          <p className="notice">{first.error.message}</p>
        ) : (
          <div className="skeleton" style={{ height: 440 }} />
        )}
      </div>
    </section>
  )
}

export const Orderbook = memo(OrderbookImpl)
