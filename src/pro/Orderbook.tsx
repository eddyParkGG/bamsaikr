import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ArbSnapshot } from '../../shared/api'
import { hasKrx, type Asset } from '../../shared/assets'
import { fmtPct, fmtPrice, fmtUsd, fmtWonUnit, tone } from '../lib/format'
import { subscribeHl, subscribeKrx, useLive, type Level, type Trade } from '../lib/live'
import { useQuery } from '../lib/query'
import { usePerps, useUsdcRate } from '../lib/data'
import { toast } from '../components/Toast'
import { useTicket } from './ticket'
import { SESSION_LABEL } from '../lib/market'

type Tab = 'perp' | 'krx'
const ROWS = 20

interface Info {
  rows: [string, string, string?][] // label, value, tone class
}

/**
 * Brokerage-PC style book: price + change in the middle, ask sizes on the left (blue bars),
 * bid sizes on the right (red bars). The last traded price gets an outline.
 * Upper-right: day stats. Lower-left: recent trades.
 */
function Book({
  asks,
  bids,
  ref0,
  last,
  tape,
  info,
  fmt,
  sizeFmt,
  session,
  centerKey,
  onPick,
}: {
  asks: Level[]
  bids: Level[]
  ref0: number
  last?: number
  tape: Trade[]
  info: Info
  fmt: (v: number) => string
  sizeFmt: (v: number) => string
  session: string
  centerKey: string
  onPick?: (px: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  // Scroll is anchored to the spread (where asks meet bids): rows appearing above or below never
  // move the view. Manual scrolling just changes the remembered distance from the spread.
  const offset = useRef<number | null>(null)
  useEffect(() => {
    offset.current = null
  }, [centerKey])
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const mid = midRef.current
    if (!sc || !mid) return
    if (offset.current == null) offset.current = -sc.clientHeight / 2
    const want = mid.offsetTop + offset.current
    if (Math.abs(sc.scrollTop - want) > 1) sc.scrollTop = want
  })
  const onScroll = () => {
    const sc = scrollRef.current
    const mid = midRef.current
    if (sc && mid && offset.current != null) offset.current = sc.scrollTop - mid.offsetTop
  }
  const a = asks.slice(0, ROWS).reverse()
  const b = bids.slice(0, ROWS)
  const max = Math.max(1, ...a.map((l) => l.sz), ...b.map((l) => l.sz))
  const sum = (ls: Level[]) => ls.reduce((s, l) => s + l.sz, 0)
  const sa = sum(asks.slice(0, ROWS))
  const sb = sum(bids.slice(0, ROWS))
  // Highlight the level closest to the last trade
  const near = (px: number, all: Level[]) => last != null && all.length > 0 && Math.abs(px - last) === Math.min(...all.map((l) => Math.abs(l.px - last)))
  const allLv = [...a, ...b]
  const px = (l: Level, side: 'ask' | 'bid') => {
    const chg = ref0 ? (l.px / ref0 - 1) * 100 : 0
    return (
      <button
        type="button"
        className={`ob2__px ob2__px--${side} ${tone(chg)} ${near(l.px, allLv) ? 'ob2__px--last' : ''}`}
        onClick={() => onPick?.(l.px)}
        title="누르면 이 가격으로 주문창에 입력돼요"
      >
        <b data-fit>{fmt(l.px)}</b>
        <span>{fmtPct(chg)}</span>
      </button>
    )
  }
  const tapeRows = tape.slice(0, Math.max(6, b.length * 2 - 2))
  return (
    <>
      <div className="ob2-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="ob2 num">
          {a.map((l, i) => (
            <div className="ob2__row ob2__row--ask" key={`a${i}`}>
              <div className="ob2__sz ob2__sz--ask">
                <div style={{ width: `calc(${Math.max(1, (l.sz / max) * 100)}% - 8px)` }}>
                  <span>{sizeFmt(l.sz)}</span>
                </div>
              </div>
              {px(l, 'ask')}
              <div />
            </div>
          ))}
          <div className="ob2__mid" ref={midRef} />
          {b.map((l, i) => (
            <div className="ob2__row ob2__row--bid" key={`b${i}`}>
              <div />
              {px(l, 'bid')}
              <div className="ob2__sz ob2__sz--bid">
                <div style={{ width: `calc(${Math.max(1, (l.sz / max) * 100)}% - 8px)` }}>
                  <span>{sizeFmt(l.sz)}</span>
                </div>
              </div>
            </div>
          ))}
          {/* Day stats beside the asks, recent trades beside the bids */}
          <dl className="ob2__info" style={{ height: a.length * 40 }}>
            {info.rows.map(([k, v, c]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={c}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="ob2__tape" style={{ top: a.length * 40, height: b.length * 40 }}>
            <p className="ob2__tape-h">체결</p>
            {tapeRows.map((t, j) => {
              const prev = tape[j + 1]
              const side = t.buy ?? (prev ? t.px >= prev.px : null)
              return (
                <div key={j}>
                  <span>{fmt(t.px)}</span>
                  <span className={side == null ? '' : side ? 'up' : 'down'}>{sizeFmt(t.sz)}</span>
                </div>
              )
            })}
            {!tape.length && <p className="faint">체결을 기다리는 중</p>}
          </div>
        </div>
      </div>
      <div className="ob2__ratio" aria-hidden>
        <i className="ob2__ratio-ask" style={{ flex: sa || 1 }} />
        <i className="ob2__ratio-bid" style={{ flex: sb || 1 }} />
      </div>
      <div className="ob2__foot num">
        <span>
          판매대기 <b className="down">{sizeFmt(sa)}</b>
        </span>
        <span className="muted">{session}</span>
        <span>
          <b className="up">{sizeFmt(sb)}</b> 구매대기
        </span>
      </div>
    </>
  )
}


function OrderbookImpl({ asset, arb }: { asset: Asset; arb: ArbSnapshot | null }) {
  const krxOk = hasKrx(asset)
  const pickPrice = useTicket((s) => s.pickPrice)
  const [tab, setTab] = useState<Tab>(krxOk ? 'krx' : 'perp')
  const [unit, setUnit] = useState<'krw' | 'usd'>('krw')
  useEffect(() => setTab(krxOk ? 'krx' : 'perp'), [asset.id, krxOk])
  useEffect(() => subscribeHl({ type: 'l2Book', coin: asset.perp }), [asset.perp])
  useEffect(() => subscribeHl({ type: 'trades', coin: asset.perp }), [asset.perp])
  useEffect(() => (krxOk ? subscribeKrx(asset.id, asset.krxCode) : undefined), [asset, krxOk])
  const book = useLive((s) => s.book[asset.perp])
  const ctx = useLive((s) => s.ctx[asset.perp])
  const perpTape = useLive((s) => s.tape[asset.perp])
  const krxLive = useLive((s) => (krxOk ? s.krxBook[asset.krxCode] : undefined))
  const krxTape = useLive((s) => (krxOk ? s.tape[asset.krxCode] : undefined))
  const rate = useUsdcRate()
  const pq = usePerps(asset.id).item
  // REST orderbook for the first render until live data arrives
  const first = useQuery<{ krx: { asks: Level[]; bids: Level[] } | null }>(tab === 'krx' && !krxLive ? `/api/v1/orderbook?asset=${asset.id}` : null)
  const krx = krxLive ?? first.data?.krx ?? undefined

  const conv = asset.fx && unit === 'krw' && rate ? rate : 1
  const isIdx = asset.kind === 'index'
  const perpFmt = (v: number) => (conv === 1 ? (asset.fx ? fmtUsd(v) : fmtPrice(v, true)) : fmtPrice(v * conv))
  const prevDay = ctx?.prevDay ?? pq?.prevDay ?? 0
  const perpLast = perpTape?.[0]?.px ?? ctx?.mid

  const perpInfo: Info = {
    rows: [
      ['전일', prevDay ? perpFmt(prevDay) : '-'],
      ['펀딩', ctx ? `${(ctx.funding * 100).toFixed(4)}%` : '-', ctx ? tone(ctx.funding) : ''],
      ['미결제', pq && rate ? `${fmtWonUnit(pq.openInterest * (ctx?.mid ?? pq.mid) * rate)}원` : '-'],
      ['거래대금', pq && rate ? `${fmtWonUnit(pq.volume24hUsd * rate)}원` : '-'],
      ['레버리지', pq ? `최대 ${pq.maxLeverage}배` : '-'],
    ],
  }
  const k = arb?.krx
  const krxInfo: Info = {
    rows: k
      ? [
          ['시작', fmtPrice(k.open, isIdx), tone(k.open - k.prevClose)],
          ['최고', fmtPrice(k.high, isIdx), tone(k.high - k.prevClose)],
          ['최저', fmtPrice(k.low, isIdx), tone(k.low - k.prevClose)],
          ['전일', fmtPrice(k.prevClose, isIdx)],
          ...(k.tradeValue > 0 ? ([['거래대금', `${Math.round(k.tradeValue / 1e8).toLocaleString('ko-KR')}억`]] as [string, string][]) : []),
        ]
      : [],
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">호가</span>
        <span className="spacer" />
        {tab === 'perp' && asset.fx && (
          <div className="seg seg--sm" role="group" aria-label="표시 단위" style={{ width: 72 }}>
            <button aria-pressed={unit === 'krw'} onClick={() => setUnit('krw')}>
              원
            </button>
            <button aria-pressed={unit === 'usd'} onClick={() => setUnit('usd')}>
              $
            </button>
          </div>
        )}
        {krxOk && (
          <div className="seg" role="group" aria-label="호가 시장" style={{ width: 170 }}>
            <button aria-pressed={tab === 'krx'} onClick={() => setTab('krx')}>
              국내 시장
            </button>
            <button aria-pressed={tab === 'perp'} onClick={() => setTab('perp')}>
              하이퍼리퀴드
            </button>
          </div>
        )}
      </div>
      <div className="panel__body" style={{ padding: '4px 0 12px' }}>
        {tab === 'perp' ? (
          book ? (
            <Book
              asks={book.asks}
              bids={book.bids}
              ref0={prevDay}
              last={perpLast}
              tape={perpTape ?? []}
              info={perpInfo}
              fmt={perpFmt}
              sizeFmt={(v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
              session="24시간 거래"
              centerKey={`perp:${asset.id}`}
              onPick={(px) => pickPrice('perp', px)}
            />
          ) : (
            <div className="skeleton" style={{ height: 440, margin: '0 12px' }} />
          )
        ) : krx ? (
          <Book
            asks={krx.asks}
            bids={krx.bids}
            ref0={k?.prevClose ?? 0}
            last={krxTape?.[0]?.px ?? k?.price}
            tape={krxTape ?? []}
            info={krxInfo}
            fmt={(v) => fmtPrice(v, isIdx)}
            sizeFmt={(v) => v.toLocaleString('ko-KR')}
            session={arb ? SESSION_LABEL[arb.session] : ''}
            centerKey={`krx:${asset.id}`}
            onPick={(px) => (asset.kind === 'stock' ? pickPrice('krx', px) : toast('이 종목은 국내 주문을 지원하지 않아요'))}
          />
        ) : first.error ? (
          <p className="notice" style={{ margin: '0 12px' }}>
            {first.error.message}
          </p>
        ) : (
          <div className="skeleton" style={{ height: 440, margin: '0 12px' }} />
        )}
      </div>
    </section>
  )
}

export const Orderbook = memo(OrderbookImpl)
