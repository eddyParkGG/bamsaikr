import { Chevron } from '../components/Icon'
import { memo, useEffect, useRef, useState } from 'react'
import type { OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { dateKeyParts, fmtKrw, fmtPct, fmtPrice, fmtWonUnit, tone } from '../lib/format'
import { Help } from '../components/Help'
import { NextOpenWhen } from '../components/NextOpenState'
import { useQuery } from '../lib/query'
import { useArb } from '../lib/data'
import { InSessionNotice, predictionReady, ThinTag } from '../components/NextOpenState'

const HELP = {
  ref: '국내 시장(넥스트레이드 포함)에서 마지막으로 거래된 가격이에요. 저녁 8시 종가예요.',
  perp: '국내 시장이 닫힌 동안 하이퍼리퀴드에서 거래된 지금 가격을 원화로 바꾼 값이에요.',
  expected: '내일 아침 8시 국내 시장이 다시 열렸을 때(8시~8시 10분 평균) 예상되는 가격이에요.',
  band: '10번 중 8번은 이 범위 안에서 시작한다는 뜻이에요. 장 열리기까지 시간이 많이 남을수록 넓어져요.',
  up: '기준 가격보다 높게 시작할 확률이에요.',
  dist: '내일 아침 국내 시장이 기준 가격보다 몇 % 오르거나 내려서 시작할지, 구간별 확률이에요. 막대가 길수록 그 구간일 가능성이 커요.',
  follow: '국내 시장이 닫힌 동안 하이퍼리퀴드가 오르면 다음 날 국내도 올라서, 내리면 내려서 시작한 비율이에요. 거의 안 움직인 날은 뺐어요.',
  liquid: '밤사이 하이퍼리퀴드에서 100만 달러 이상 거래된 날만 센 비율이에요. 거래가 많을수록 하이퍼리퀴드 가격을 믿을 만해요.',
  coverage: '예상 범위(80% 구간) 안에서 실제로 시작한 비율이에요. 80%에 가까울수록 범위를 정직하게 잡은 거예요.',
  mae: '예상 시작 가격과 실제 시작 가격이 평균 몇 %p 차이 났는지예요.',
  naive: '아무 정보 없이 "어제 저녁 8시 가격 그대로 시작한다"고 했을 때의 평균 차이예요. 이보다 작아야 의미가 있어요.',
}

function Row({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <dt>
        {label} <Help text={help} />
      </dt>
      <dd data-fit>{children}</dd>
    </div>
  )
}

/** 'M/D (요일)' from a KST 'YYYYMMDD' key; Saturday and Sunday in red */
function DateDow({ date }: { date: string }) {
  const p = dateKeyParts(date)
  return (
    <>
      {p.md} (<span className={p.weekend ? 'dow--weekend' : undefined}>{p.dow}</span>)
    </>
  )
}

export const PredictPanels = memo(function PredictPanels({ p, asset }: { p: Prediction | null; asset: Asset }) {
  if (!p) return <div className="skeleton" style={{ height: 260, marginTop: 8 }} />
  const isIdx = asset.kind === 'index'
  const maxP = Math.max(...p.distribution.map((d) => d.p))
  const bt = p.backtest
  return (
    <div className="cols3">
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">내일 아침 가격</span>
          {predictionReady(p) && <ThinTag p={p} />}
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            <NextOpenWhen at={p.targetOpenAt} />
          </span>
        </div>
        <div className="panel__body">
          {!predictionReady(p) ? (
            <InSessionNotice />
          ) : (
            <dl>
              <Row label="기준 가격" help={HELP.ref}>
                {fmtKrw(p.refClose, isIdx)}
              </Row>
              <Row label="하이퍼리퀴드 지금" help={HELP.perp}>
                {fmtKrw(p.perpKrw, isIdx)} <span className={tone(p.perpGapPct)}>{fmtPct(p.perpGapPct)}</span>
              </Row>
              <Row label="예상 시작 가격" help={HELP.expected}>
                <b>{fmtKrw(p.expectedOpen, isIdx)}</b> <span className={tone(p.expectedGapPct)}>{fmtPct(p.expectedGapPct)}</span>
              </Row>
              <Row label="80% 구간" help={HELP.band}>
                {fmtPrice(p.band80.low, isIdx)} ~ {fmtKrw(p.band80.high, isIdx)}
              </Row>
              <Row label="오를 확률" help={HELP.up}>
                <b className={p.probUp >= 0.5 ? 'up' : 'down'}>{Math.round(p.probUp * 100)}%</b>
              </Row>
            </dl>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">
            몇 % 움직여 시작할까 <Help text={HELP.dist} />
          </span>
        </div>
        <div className="panel__body">
          {!predictionReady(p) ? (
            <InSessionNotice />
          ) : (
            <>
              <div className="dist">
                {p.distribution.map((d, i) => (
                  <div className="dist__row" key={d.label}>
                    <span className="muted">{d.label}</span>
                    <span className="dist__bar">
                      <i style={{ width: `${(d.p / maxP) * 100}%`, background: i < 2 ? 'var(--down)' : i > 2 ? 'var(--up)' : 'var(--text-3)' }} />
                    </span>
                    <span className="num">{Math.round(d.p * 100)}%</span>
                  </div>
                ))}
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
                {p.regime === 'weekend' ? '주말·연휴를 건너는 밤' : '평일 밤'} · 장 열리기까지 {p.hoursToOpen}시간 남아서 그만큼 범위를 넓혔어요
              </p>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">얼마나 맞았나</span>
        </div>
        <div className="panel__body">
          <dl>
            <div className="kv kv--key">
              <dt>
                하이퍼리퀴드 방향대로 열림 <Help text={HELP.follow} />
              </dt>
              <dd data-fit>
                <b>{bt.followRatePct?.toFixed(1)}%</b> <span className="faint">({bt.followScored}번 중 {bt.followYes}번)</span>
              </dd>
            </div>
            <Row label="거래 충분한 밤만" help={HELP.liquid}>
              {bt.liquidScored < 30 ? (
                <span className="faint">{bt.liquidScored}번뿐이라 아직 판단 어려워요</span>
              ) : (
                <>
                  {bt.liquidRatePct?.toFixed(1)}% <span className="faint">({bt.liquidScored}번 중 {bt.liquidYes}번)</span>
                </>
              )}
            </Row>
            <Row label="80% 구간 안에서 시작" help={HELP.coverage}>
              {bt.coverage80Pct?.toFixed(1)}%
            </Row>
            <Row label="예상 가격과의 차이" help={HELP.mae}>
              평균 {bt.maePct}%p
            </Row>
            <Row label="어제 마지막 가격 그대로라면" help={HELP.naive}>
              평균 {bt.naiveMaePct}%p
            </Row>
          </dl>
          <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
            하이퍼리퀴드가 아침 8시 가격을 제공하는 {bt.since ? `${+bt.since.slice(4, 6)}월 ${+bt.since.slice(6, 8)}일` : ''}부터 {bt.opens}번의 장 시작을 봤어요.
          </p>
        </div>
      </section>
    </div>
  )
})

/** Brokerage-style filter chip: opens a popover with options, applies on 보기 */
function FilterChip({ label, options, value, onApply }: { label: string; options: [string, string][]; value: string; onApply: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setDraft(value)
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = options.find(([v]) => v === value)?.[1]
  return (
    <div className="fchip-wrap" ref={ref}>
      <button className={`fchip ${value ? 'fchip--on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {current ? `${label} · ${current}` : label}
        <Chevron />
      </button>
      {open && (
        <div className="fpop" role="dialog" aria-label={label}>
          <p className="fpop__title">{label}</p>
          <div className="fpop__list" role="radiogroup">
            {options.map(([v, l]) => (
              <button key={v} role="radio" aria-checked={draft === v} className="fpop__opt" onClick={() => setDraft(draft === v ? '' : v)}>
                {l}
              </button>
            ))}
          </div>
          <div className="fpop__foot">
            <button className="fpop__reset" disabled={!draft} onClick={() => setDraft('')}>
              초기화
            </button>
            <button
              className="fpop__apply"
              disabled={draft === value}
              onClick={() => {
                onApply(draft)
                setOpen(false)
              }}
            >
              보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 17 → "17시간", 65 → "2일 17시간" */
function hoursText(h: number) {
  const r = Math.round(h)
  if (r < 24) return `${r}시간`
  return `${Math.floor(r / 24)}일${r % 24 ? ` ${r % 24}시간` : ''}`
}

const meetText = (m: number) => (m > 0.66 ? '주식이 따라감' : m < 0.34 ? '하이퍼리퀴드가 맞춤' : '가운데서 만남')

type Filters = { follow: string; regime: string; gap: string; open: string; absorb: string; meet: string }
const ALL: Filters = { follow: '', regime: '', gap: '', open: '', absorb: '', meet: '' }

const FOLLOW_TEXT = { yes: '따라감', no: '반대로', flat: '거의 그대로' } as const

const FILTERS: { key: keyof Filters; label: string; options: [string, string][] }[] = [
  { key: 'follow', label: '하이퍼리퀴드 방향대로', options: [['yes', '따라감'], ['no', '반대로'], ['flat', '거의 그대로']] },
  { key: 'regime', label: '닫혀 있던 시간', options: [['overnight', '평일 밤'], ['weekend', '주말 · 연휴']] },
  { key: 'gap', label: '하이퍼리퀴드 차이', options: [['up', '올라 있었음'], ['down', '내려 있었음'], ['big', '1% 넘게 벌어짐']] },
  { key: 'open', label: '실제 시작 차이', options: [['up', '올라서 시작'], ['down', '내려서 시작']] },
  { key: 'absorb', label: '따라간 정도', options: [['80', '80% 이상'], ['50', '50~80%'], ['low', '50% 미만']] },
  { key: 'meet', label: '만난 지점', options: [['stock', '주식이 따라감'], ['mid', '가운데서 만남'], ['perp', '하이퍼리퀴드가 맞춤']] },
]

function pass(e: OpenEvent, f: Filters) {
  if (f.follow && e.follow !== f.follow) return false
  if (f.regime && e.regime !== f.regime) return false
  if (f.gap === 'up' && !(e.gapPct > 0)) return false
  if (f.gap === 'down' && !(e.gapPct < 0)) return false
  if (f.gap === 'big' && !(Math.abs(e.gapPct) >= 1)) return false
  if (f.open === 'up' && !(e.openGapPct > 0)) return false
  if (f.open === 'down' && !(e.openGapPct < 0)) return false
  if (f.absorb) {
    const a = e.absorptionPct
    if (a == null) return false
    if (f.absorb === '80' && a < 80) return false
    if (f.absorb === '50' && (a < 50 || a >= 80)) return false
    if (f.absorb === 'low' && a >= 50) return false
  }
  if (f.meet) {
    const m = e.meetPoint
    if (m == null) return false
    const k = m > 0.66 ? 'stock' : m < 0.34 ? 'perp' : 'mid'
    if (k !== f.meet) return false
  }
  return true
}

export const ConvergenceTable = memo(function ConvergenceTable({ asset }: { asset: Asset }) {
  const q = useQuery<{ events: OpenEvent[] }>(`/api/v1/convergence?asset=${asset.id}&limit=500`, 300_000)
  const [f, setF] = useState<Filters>(ALL)
  if (!q.data) return <div className="skeleton" style={{ height: 240, margin: 16 }} />
  const rows = q.data.events.filter((e) => pass(e, f))
  const scored = rows.filter((e) => e.follow !== 'flat')
  const followPct = scored.length ? Math.round((scored.filter((e) => e.follow === 'yes').length / scored.length) * 100) : null
  return (
    <>
      <div className="fbar">
        {FILTERS.map((x) => (
          <FilterChip key={x.key} label={x.label} options={x.options} value={f[x.key]} onApply={(v) => setF({ ...f, [x.key]: v })} />
        ))}
      </div>
      <div className="table-wrap" style={{ padding: '0 4px 8px' }}>
        <table className="table num">
          <thead>
            <tr>
              <th>
                개장일 · {rows.length}개{followPct != null && ` · 방향대로 ${followPct}%`}
              </th>
              <th>닫혀 있던 시간</th>
              <th>하이퍼리퀴드 차이</th>
              <th>실제 시작 차이</th>
              <th className="th-key" title="장이 닫힌 동안 하이퍼리퀴드가 오르거나 내린 방향대로 정규장이 시작했는지">
                하이퍼리퀴드 방향대로
              </th>
              <th title="실제 차이 ÷ 하이퍼리퀴드 차이. 100%면 하이퍼리퀴드가 보여준 그대로 시작">따라간 정도</th>
              <th title="장 시작 후 1시간 동안 두 가격이 어디서 만났는지">만난 지점</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.date}>
                <td>
                  <DateDow date={e.date} />
                </td>
                <td className="muted">{hoursText(e.closedHours)}</td>
                <td className={tone(e.gapPct)}>{fmtPct(e.gapPct)}</td>
                <td className={tone(e.openGapPct)}>{fmtPct(e.openGapPct)}</td>
                <td>
                  <span
                    className={`follow follow--${e.follow}`}
                    title={e.follow === 'flat' ? `둘 중 하나가 ±0.05% 안쪽이라 방향을 따지기 어려운 날이에요` : undefined}
                  >
                    {FOLLOW_TEXT[e.follow]}
                  </span>
                </td>
                <td>{e.absorptionPct == null ? <span className="faint">차이 작음</span> : `${Math.round(e.absorptionPct)}%`}</td>
                <td>
                  {e.meetPoint == null ? (
                    <span className="faint">-</span>
                  ) : (
                    <span className="meet" title="왼쪽 = 하이퍼리퀴드가 주식 쪽으로, 오른쪽 = 주식이 하이퍼리퀴드 쪽으로">
                      <span className="meet__label">{meetText(e.meetPoint)}</span>
                      <span className="range__bar">
                        <i style={{ left: `calc(${e.meetPoint} * (100% - 4px))` }} />
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="faint" style={{ textAlign: 'center', padding: 24 }}>
                  조건에 맞는 개장일이 없어요
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
})

interface Flows {
  available: boolean
  investors: { date: string; individual: number | null; foreign: number | null; institution: number | null; close: number | null }[]
}

export const FlowsPanel = memo(function FlowsPanel({ asset }: { asset: Asset }) {
  const q = useQuery<Flows>(`/api/v1/flows?asset=${asset.id}`, 60_000)
  const livePx = useArb(asset.id).item?.krx.price ?? null
  if (!q.data) return <div className="skeleton" style={{ height: 160, margin: 16 }} />
  if (!q.data.available)
    return (
      <p className="notice" style={{ margin: 16 }}>
        국내 주식이 아니라서 투자자별 매매 정보가 없어요.
      </p>
    )
  return (
    <div className="table-wrap">
      <table className="table num">
        <thead>
          <tr>
            <th>날짜</th>
            <th>개인</th>
            <th>외국인</th>
            <th>기관</th>
          </tr>
        </thead>
        <tbody>
          {q.data.investors.map((d) => (
            <tr key={d.date}>
              <td>
                <DateDow date={d.date} />
              </td>
              {[d.individual, d.foreign, d.institution].map((v, i) => {
                // Today's close is not final yet: value it at the live price
                const px = d.close ?? (d === q.data!.investors[0] ? livePx : null)
                const won = v != null && px ? v * px : null
                return (
                  <td key={i} className={v == null ? 'faint' : tone(v)}>
                    {v == null ? '집계 전' : `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}주`}
                    {won != null && (
                      <span className="flow-won">
                        {won > 0 ? '+' : won < 0 ? '-' : ''}
                        {fmtWonUnit(Math.abs(won))}원
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
