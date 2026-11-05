import { memo } from 'react'
import type { OpenEvent, Prediction } from '../../shared/api'
import type { Asset } from '../../shared/assets'
import { fmtPct, fmtPrice, kstDay, tone, untilText } from '../lib/format'
import { useQuery } from '../lib/query'

export const PredictPanel = memo(function PredictPanel({ p, asset }: { p: Prediction | null; asset: Asset }) {
  if (!p) return <div className="skeleton" style={{ height: 220 }} />
  const isIdx = asset.kind === 'index'
  const maxP = Math.max(...p.distribution.map((d) => d.p))
  return (
    <div className="pro-grid">
      <div>
        <h4 className="mini-title">다음 시가 · {kstDay(p.targetOpenAt)} 09:00 ({untilText(p.targetOpenAt)})</h4>
        <dl>
          <div className="kv">
            <dt>{p.status === 'in-session' ? '기준가 (장중 현재가, 잠정)' : '기준 종가'}</dt>
            <dd>{fmtPrice(p.refClose, isIdx)}</dd>
          </div>
          <div className="kv">
            <dt>perp 원화 환산</dt>
            <dd>
              {fmtPrice(p.perpKrw, isIdx)} <span className={tone(p.perpGapPct)}>{fmtPct(p.perpGapPct)}</span>
            </dd>
          </div>
          <div className="kv">
            <dt>예상 시가</dt>
            <dd>
              <b>{fmtPrice(p.expectedOpen, isIdx)}</b> <span className={tone(p.expectedGapPct)}>{fmtPct(p.expectedGapPct)}</span>
            </dd>
          </div>
          <div className="kv">
            <dt>80% 구간</dt>
            <dd>
              {fmtPrice(p.band80.low, isIdx)} ~ {fmtPrice(p.band80.high, isIdx)}
            </dd>
          </div>
          <div className="kv">
            <dt>상승 확률</dt>
            <dd className={p.probUp >= 0.5 ? 'up' : 'down'}>
              <b>{Math.round(p.probUp * 100)}%</b>
            </dd>
          </div>
          {p.auction && (
            <div className="kv">
              <dt>동시호가 예상체결가</dt>
              <dd>
                {fmtPrice(p.auction.price)} ({fmtPct(p.auction.changePct)})
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div>
        <h4 className="mini-title">시가 갭 분포</h4>
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
      </div>
      <div>
        <h4 className="mini-title">이 모델, 얼마나 맞았나</h4>
        <dl>
          <div className="kv">
            <dt>방향 적중</dt>
            <dd>
              <b>{p.backtest.hitRatePct}%</b> <span className="faint">({p.backtest.tested}회)</span>
            </dd>
          </div>
          <div className="kv">
            <dt>80% 구간 실제 포함</dt>
            <dd>{p.backtest.coverage80Pct}%</dd>
          </div>
          <div className="kv">
            <dt>시가 평균 오차</dt>
            <dd>{p.backtest.maePct}%p</dd>
          </div>
          <div className="kv">
            <dt>perp 가격 그대로 썼을 때</dt>
            <dd>{p.backtest.perpRawMaePct}%p</dd>
          </div>
          <div className="kv">
            <dt>전일 종가 그대로 썼을 때</dt>
            <dd>{p.backtest.naiveMaePct}%p</dd>
          </div>
        </dl>
        <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          그날 이전 데이터로만 학습해 예측한 결과예요 (walk-forward). 시가 = α + β·perp갭, β {p.model.beta}, σ 평일 {p.model.sigmaPct.overnight}% / 주말 {p.model.sigmaPct.weekend}%
        </p>
      </div>
    </div>
  )
})

export const ConvergenceTable = memo(function ConvergenceTable({ asset }: { asset: Asset }) {
  const q = useQuery<{ events: OpenEvent[] }>(`/api/v1/convergence?asset=${asset.id}&limit=60`, 300_000)
  if (!q.data) return <div className="skeleton" style={{ height: 240 }} />
  return (
    <div className="table-wrap">
      <table className="table num">
        <thead>
          <tr>
            <th>개장일</th>
            <th>휴장</th>
            <th>perp가 말한 갭</th>
            <th>실제 시가 갭</th>
            <th title="실제 갭 ÷ perp 갭. 100%면 perp가 말한 그대로 열림">따라간 정도</th>
            <th title="개장 후 1시간 동안 두 가격이 어디서 만났는지">만난 지점</th>
            <th>예측</th>
          </tr>
        </thead>
        <tbody>
          {q.data.events.map((e) => (
            <tr key={e.date}>
              <td>
                {+e.date.slice(4, 6)}/{+e.date.slice(6, 8)}
              </td>
              <td className="muted">{e.regime === 'weekend' ? `${Math.round(e.closedHours)}h 주말` : `${Math.round(e.closedHours)}h`}</td>
              <td className={tone(e.gapPct)}>{fmtPct(e.gapPct)}</td>
              <td className={tone(e.openGapPct)}>{fmtPct(e.openGapPct)}</td>
              <td>{e.absorptionPct == null ? <span className="faint">갭 작음</span> : `${Math.round(e.absorptionPct)}%`}</td>
              <td>
                {e.meetPoint == null ? (
                  <span className="faint">-</span>
                ) : (
                  <span className="meet" title={`0=perp가 주식 쪽으로, 1=주식이 perp 쪽으로`}>
                    <span className="meet__track">
                      <i style={{ left: `${e.meetPoint * 100}%` }} />
                    </span>
                    <span className="faint">{e.meetPoint > 0.66 ? '주식이 따라감' : e.meetPoint < 0.34 ? 'perp가 맞춤' : '가운데'}</span>
                  </span>
                )}
              </td>
              <td>{e.hit == null ? '' : e.hit ? <span className="up">맞음</span> : <span className="down">틀림</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

interface Flows {
  available: boolean
  investors: { date: string; individual: number; foreign: number; institution: number }[]
}

export const FlowsPanel = memo(function FlowsPanel({ asset }: { asset: Asset }) {
  const q = useQuery<Flows>(`/api/v1/flows?asset=${asset.id}`, 60_000)
  if (!q.data) return <div className="skeleton" style={{ height: 160 }} />
  if (!q.data.available) return <p className="notice">투자자별 매매동향은 한국투자증권 API를 연결하면 보여드려요.</p>
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
              {[d.individual, d.foreign, d.institution].map((v, i) => (
                <td key={i} className={tone(v)}>
                  {v.toLocaleString('ko-KR')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
