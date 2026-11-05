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
    <section className="panel" style={{ flex: 1 }}>
      <div className="panel__head">
        <span className="panel__title">호가</span>
        <span className="spacer" />
        {tab === 'perp' && asset.fx && (
          <button className="chip" onClick={() => setUnit(unit === 'krw' ? 'usd' : 'krw')} title="표시 단위">
            {unit === 'krw' ? '원' : '$'}
          </button>
        )}
        <div className="seg" role="group" aria-label="호가 시장" style={{ width: 150 }}>
          {(['perp', 'krx', 'nxt'] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'perp' ? 'perp' : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="panel__body" style={{ padding: '8px 12px 12px' }}>
        {tab === 'perp' ? (
          book ? (
            <Book asks={book.asks} bids={book.bids} fmt={perpFmt} sizeFmt={(v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} />
          ) : (
            <div className="skeleton" style={{ height: 440 }} />
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
          <div className="skeleton" style={{ height: 440 }} />
        )}
      </div>
    </section>
  )
}

export const Orderbook = memo(OrderbookImpl)
