import { useEffect, useState } from 'react'
import { usePrefs } from '../lib/prefs'
import { DEFAULT_PARAMS, type IndicatorParams } from './settings'

export type ParamKey = 'ma' | 'bb' | 'rsi' | 'macd'

interface Field {
  label: string
  get: (p: IndicatorParams) => number
  set: (p: IndicatorParams, v: number) => IndicatorParams
  min: number
  max: number
  step: number
}

const FIELDS: Record<ParamKey, { title: string; fields: Field[] }> = {
  ma: {
    title: '이동평균선',
    fields: [0, 1, 2, 3].map((i) => ({
      label: `${i + 1}번째 기간`,
      get: (p) => p.ma[i],
      set: (p, v) => ({ ...p, ma: p.ma.map((x, j) => (j === i ? v : x)) }),
      min: 1,
      max: 480,
      step: 1,
    })),
  },
  bb: {
    title: '볼린저 밴드',
    fields: [
      { label: '기간', get: (p) => p.bb.period, set: (p, v) => ({ ...p, bb: { ...p.bb, period: v } }), min: 2, max: 200, step: 1 },
      { label: '표준편차 배수', get: (p) => p.bb.mult, set: (p, v) => ({ ...p, bb: { ...p.bb, mult: v } }), min: 0.5, max: 5, step: 0.5 },
    ],
  },
  rsi: {
    title: 'RSI',
    fields: [
      { label: '기간', get: (p) => p.rsi.period, set: (p, v) => ({ ...p, rsi: { ...p.rsi, period: v } }), min: 2, max: 100, step: 1 },
      { label: '과매수 기준', get: (p) => p.rsi.upper, set: (p, v) => ({ ...p, rsi: { ...p.rsi, upper: v } }), min: 50, max: 95, step: 1 },
      { label: '과매도 기준', get: (p) => p.rsi.lower, set: (p, v) => ({ ...p, rsi: { ...p.rsi, lower: v } }), min: 5, max: 50, step: 1 },
    ],
  },
  macd: {
    title: 'MACD',
    fields: [
      { label: '단기', get: (p) => p.macd.fast, set: (p, v) => ({ ...p, macd: { ...p.macd, fast: v } }), min: 2, max: 100, step: 1 },
      { label: '장기', get: (p) => p.macd.slow, set: (p, v) => ({ ...p, macd: { ...p.macd, slow: v } }), min: 3, max: 200, step: 1 },
      { label: '시그널', get: (p) => p.macd.signal, set: (p, v) => ({ ...p, macd: { ...p.macd, signal: v } }), min: 2, max: 50, step: 1 },
    ],
  },
}

/** Indicator parameter editor. Stepper fields like the Toss order form; applies on confirm */
export function ParamsSheet({ which, onClose }: { which: ParamKey; onClose: () => void }) {
  const params = usePrefs((s) => s.params)
  const setParams = usePrefs((s) => s.setParams)
  const [draft, setDraft] = useState(params)
  const spec = FIELDS[which]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clamp = (f: Field, v: number) => Math.min(f.max, Math.max(f.min, Math.round(v / f.step) * f.step))
  const invalid = which === 'macd' && draft.macd.fast >= draft.macd.slow

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${spec.title} 설정`}>
      <div className="sheet params" onClick={(e) => e.stopPropagation()}>
        <h3 className="params__title">{spec.title} 설정</h3>
        <div className="params__rows">
          {spec.fields.map((f) => {
            const v = f.get(draft)
            return (
              <div className="params__row" key={f.label}>
                <span className="params__label">{f.label}</span>
                <div className="stepper">
                  <button aria-label={`${f.label} 줄이기`} onClick={() => setDraft(f.set(draft, clamp(f, v - f.step)))}>
                    −
                  </button>
                  <input
                    className="num"
                    inputMode="decimal"
                    value={v}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ''))
                      if (Number.isFinite(n)) setDraft(f.set(draft, n))
                    }}
                    onBlur={() => setDraft(f.set(draft, clamp(f, v)))}
                  />
                  <button aria-label={`${f.label} 늘리기`} onClick={() => setDraft(f.set(draft, clamp(f, v + f.step)))}>
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {invalid && <p className="notice down" style={{ marginTop: 8 }}>단기 기간은 장기 기간보다 짧아야 해요.</p>}
        <div className="row" style={{ marginTop: 20, gap: 8 }}>
          <button className="btn btn--lg btn--fill" style={{ flex: 1 }} onClick={() => setDraft({ ...draft, [which]: DEFAULT_PARAMS[which] })}>
            기본값으로
          </button>
          <button
            className="btn btn--lg btn--key"
            style={{ flex: 1.4 }}
            disabled={invalid}
            onClick={() => {
              setParams({ [which]: draft[which] } as Partial<IndicatorParams>)
              onClose()
            }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}
