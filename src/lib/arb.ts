// One wording for "is there a spread opportunity right now?", shared by every screen.
// The price gap never returns to 0; it sits at a usual level, so we talk about the gap from that level.
import type { ArbSnapshot } from '../../shared/api'
import { fmtKoreanUnit, fmtPct, fmtWon } from './format'

export type ArbKind = 'gap' | 'go' | 'normal' | 'cost' | 'short'

/** Within ±0.1%p of the usual gap there is nothing to trade */
const NORMAL_BAND = 0.1

export function arbKind(s: ArbSnapshot): ArbKind {
  if (s.mode === 'gap') return 'gap'
  if (s.net.executable && s.net.netKrwPer10m > 0) return 'go'
  if (Math.abs(s.deviationPct) < NORMAL_BAND) return 'normal'
  return s.deviationPct > 0 ? 'cost' : 'short'
}

/** Lists and the bottom bar keep two cases only: money left after costs, or none */
const NONE = '아직 시세차익 기회가 없어요'

const p2 = (v: number) => fmtPct(Math.abs(v), 2, false)

/** When the order books can't take the full 10M, the amount shown is for what they can take */
export function depthNote(s: ArbSnapshot) {
  return s.net.depthLimited && s.net.maxNotionalKrw != null ? `호가 잔량이 부족해 최대 ${fmtKoreanUnit(s.net.maxNotionalKrw)}원까지` : null
}

/** Full sentence for the chart note; `short` for list rows and the bottom bar */
export function arbText(s: ArbSnapshot) {
  const k = arbKind(s)
  const won = fmtWon(Math.round(s.net.netKrw ?? s.net.netKrwPer10m))
  switch (k) {
    case 'gap':
      return { kind: k, text: '시세차익 계산은 국장 중에만 가능해요 · 국장이 닫혀 있으면 국내 주식을 사고팔 수 없어요', short: '시세차익 계산은 국장 중에만 가능해요' }
    case 'go':
      return { kind: k, text: [`평소보다 ${p2(s.deviationPct)} 더 벌어졌어요 · 1천만원 기준 약 ${won}원 남아요`, depthNote(s)].filter(Boolean).join(' · '), short: `+${won}원`, won }
    case 'normal':
      return { kind: k, text: `평소 수준이에요 · 평소에도 해외 가격이 ${p2(s.normalPremiumPct)} ${s.normalPremiumPct >= 0 ? '비싸요' : '싸요'}`, short: NONE }
    case 'cost':
      return { kind: k, text: `평소보다 ${p2(s.deviationPct)} 벌어졌지만 비용이 더 커요`, short: NONE }
    case 'short':
      return {
        kind: k,
        text: `해외 가격이 평소보다 ${p2(s.deviationPct)} 싸요 · 이 주식을 가진 사람은 국내에서 팔고 하이퍼리퀴드에서 사면 차익이 남아요`,
        short: NONE,
      }
  }
}
