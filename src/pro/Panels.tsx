import { memo, useEffect, useRef, useState } from 'react'
import type { ArbSnapshot, OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { fmtPct, fmtPrice, fmtWonUnit, tone } from '../lib/format'
import { NextOpenWhen } from '../components/NextOpenState'
import { useQuery } from '../lib/query'
import { InSessionNotice, predictionReady } from '../components/NextOpenState'

export const PredictPanels = memo(function PredictPanels({ p, asset }: { p: Prediction | null; asset: Asset }) {
  if (!p) return <div className="skeleton" style={{ height: 260, marginTop: 8 }} />
  const isIdx = asset.kind === 'index'
  const maxP = Math.max(...p.distribution.map((d) => d.p))
  return (
    <div className="cols3">
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">다음 장 시작 가격</span>
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            <NextOpenWhen at={p.targetOpenAt} />
          </span>
        </div>
        <div className="panel__body">
        {!predictionReady(p) ? <InSessionNotice /> : (
        <dl>
          <div className="kv">
            <dt>기준 종가</dt>
            <dd data-fit>{fmtPrice(p.refClose, isIdx)}</dd>
          </div>
          <div className="kv">
            <dt>하이퍼리퀴드 원화 환산</dt>
            <dd data-fit>
              {fmtPrice(p.perpKrw, isIdx)} <span className={tone(p.perpGapPct)}>{fmtPct(p.perpGapPct)}</span>
            </dd>
          </div>
          <div className="kv">
            <dt>예상 시작 가격</dt>
            <dd data-fit>
              <b>{fmtPrice(p.expectedOpen, isIdx)}</b> <span className={tone(p.expectedGapPct)}>{fmtPct(p.expectedGapPct)}</span>
            </dd>
          </div>
          <div className="kv">
            <dt>80% 구간</dt>
            <dd data-fit>
              {fmtPrice(p.band80.low, isIdx)} ~ {fmtPrice(p.band80.high, isIdx)}
            </dd>
          </div>
          <div className="kv">
            <dt>상승 확률</dt>
            <dd className={p.probUp >= 0.5 ? 'up' : 'down'}>
              <b>{Math.round(p.probUp * 100)}%</b>
            </dd>
          </div>
        </dl>
        )}
        </div>
      </section>
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">시작 가격 차이 분포</span>
        </div>
        <div className="panel__body">
        {!predictionReady(p) ? <InSessionNotice /> : (<>
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
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          {p.regime === 'weekend' ? '주말·연휴 구간' : '평일 밤 구간'} · 남은 시간 {p.hoursToOpen}시간만큼 불확실성을 더했어요
        </p>
        </>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">이 모델, 얼마나 맞았나</span>
        </div>
        <div className="panel__body">
        <dl>
          <div className="kv">
            <dt>방향 적중</dt>
            <dd data-fit>
              <b>{p.backtest.hitRatePct}%</b> <span className="faint">({p.backtest.tested}회)</span>
            </dd>
          </div>
          <div className="kv">
            <dt>80% 구간 실제 포함</dt>
            <dd data-fit>{p.backtest.coverage80Pct}%</dd>
          </div>
          <div className="kv">
            <dt>평균 오차</dt>
            <dd data-fit>{p.backtest.maePct}%p</dd>
          </div>
          <div className="kv">
            <dt>하이퍼리퀴드 가격 그대로 썼을 때</dt>
            <dd data-fit>{p.backtest.perpRawMaePct}%p</dd>
          </div>
          <div className="kv">
            <dt>전일 종가 그대로 썼을 때</dt>
            <dd data-fit>{p.backtest.naiveMaePct}%p</dd>
          </div>
        </dl>
        <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          그날 이전 데이터로만 학습해 예측한 결과예요 (walk-forward). 시작 가격 갭 = α + β·하이퍼리퀴드 갭, β {p.model.beta}, σ 평일 {p.model.sigmaPct.overnight}% / 주말 {p.model.sigmaPct.weekend}%
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="fpop" role="dialog" aria-label={label}>
          <p className="fpop__title">{label}</p>
          <div className="fpop__list" role="radiogroup">
            {options.map(([v, l]) => (
              <button key={v} role="radio" aria-checked={draft === v} className="fpop__opt" onClick={() => setDraft(draft === v ? '' : v)}>
                {l}
                {draft === v && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
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

type Filters = { regime: string; gap: string; open: string; absorb: string; meet: string; hit: string }
const ALL: Filters = { regime: '', gap: '', open: '', absorb: '', meet: '', hit: '' }

const FILTERS: { key: keyof Filters; label: string; options: [string, string][] }[] = [
  { key: 'regime', label: '닫혀 있던 시간', options: [['overnight', '평일 밤'], ['weekend', '주말 · 연휴']] },
  { key: 'gap', label: '하이퍼리퀴드 차이', options: [['up', '올라 있었음'], ['down', '내려 있었음'], ['big', '1% 넘게 벌어짐']] },
  { key: 'open', label: '실제 시작 차이', options: [['up', '올라서 시작'], ['down', '내려서 시작']] },
  { key: 'absorb', label: '따라간 정도', options: [['80', '80% 이상'], ['50', '50~80%'], ['low', '50% 미만']] },
  { key: 'meet', label: '만난 지점', options: [['stock', '주식이 따라감'], ['mid', '가운데서 만남'], ['perp', '하이퍼리퀴드가 맞춤']] },
  { key: 'hit', label: '예측', options: [['hit', '맞음'], ['miss', '틀림']] },
]

function pass(e: OpenEvent, f: Filters) {
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
  if (f.hit === 'hit' && e.hit !== true) return false
  if (f.hit === 'miss' && e.hit !== false) return false
  return true
}

export const ConvergenceTable = memo(function ConvergenceTable({ asset }: { asset: Asset }) {
  const q = useQuery<{ events: OpenEvent[] }>(`/api/v1/convergence?asset=${asset.id}&limit=500`, 300_000)
  const [f, setF] = useState<Filters>(ALL)
  if (!q.data) return <div className="skeleton" style={{ height: 240, margin: 16 }} />
  const rows = q.data.events.filter((e) => pass(e, f))
  const hits = rows.filter((e) => e.hit != null)
  return (
    <>
      <div className="fbar">
        {FILTERS.map((x) => (
          <FilterChip key={x.key} label={x.label} options={x.options} value={f[x.key]} onApply={(v) => setF({ ...f, [x.key]: v })} />
        ))}
      </div>
      <div className="table-wrap table-wrap--sticky" style={{ padding: '0 4px 8px' }}>
        <table className="table num">
          <thead>
            <tr>
              <th>
                개장일 · {rows.length}개{hits.length > 0 && ` · 적중 ${Math.round((hits.filter((e) => e.hit).length / hits.length) * 100)}%`}
              </th>
              <th>닫혀 있던 시간</th>
              <th>하이퍼리퀴드 차이</th>
              <th>실제 시작 차이</th>
              <th title="실제 차이 ÷ 하이퍼리퀴드 차이. 100%면 하이퍼리퀴드가 보여준 그대로 시작">따라간 정도</th>
              <th title="장 시작 후 1시간 동안 두 가격이 어디서 만났는지">만난 지점</th>
              <th>예측</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.date}>
                <td>
                  {+e.date.slice(4, 6)}/{+e.date.slice(6, 8)}
                </td>
                <td className="muted">{hoursText(e.closedHours)}</td>
                <td className={tone(e.gapPct)}>{fmtPct(e.gapPct)}</td>
                <td className={tone(e.openGapPct)}>{fmtPct(e.openGapPct)}</td>
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
                <td>{e.hit == null ? '' : e.hit ? <span className="hit-yes">맞음</span> : <span className="faint">틀림</span>}</td>
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
  const arbQ = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 5000)
  const livePx = arbQ.data?.items.find((x) => x.asset === asset.id)?.krx.price ?? null
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
                {+d.date.slice(4, 6)}/{+d.date.slice(6, 8)}
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
