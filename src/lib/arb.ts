// One wording for "is there a spread opportunity right now?", shared by every screen.
// The price gap never returns to 0; it sits at a usual level, so we talk about the gap from that level.
import type { ArbSnapshot } from '../../shared/api'
import { fmtPct, fmtWon } from './format'

export type ArbKind = 'gap' | 'go' | 'normal' | 'cost' | 'short'

/** Within ±0.1%p of the usual gap there is nothing to trade */
const NORMAL_BAND = 0.1

export function arbKind(s: ArbSnapshot): ArbKind {
  if (s.mode === 'gap') return 'gap'
  if (s.net.executable && s.net.netKrwPer10m > 0) return 'go'
  if (Math.abs(s.deviationPct) < NORMAL_BAND) return 'normal'
  return s.deviationPct > 0 ? 'cost' : 'short'
}

const p2 = (v: number) => fmtPct(Math.abs(v), 2, false)

/** Sentence for notice bars; `short` for list rows */
export function arbText(s: ArbSnapshot) {
  const k = arbKind(s)
  const won = fmtWon(Math.round(s.net.netKrwPer10m))
  switch (k) {
    case 'gap':
      return { kind: k, text: '장 열리면 확인할 수 있어요', short: '장 열리면 확인' }
    case 'go':
      return { kind: k, text: `평소보다 ${p2(s.deviationPct)} 더 벌어졌어요 · 1천만원 기준 약 ${won}원 남아요`, short: `+${won}원`, won }
    case 'normal':
      return { kind: k, text: `평소 수준이에요 · 평소에도 해외 가격이 ${p2(s.normalPremiumPct)} ${s.normalPremiumPct >= 0 ? '비싸요' : '싸요'}`, short: '평소 수준' }
    case 'cost':
      return { kind: k, text: `평소보다 ${p2(s.deviationPct)} 벌어졌지만 비용이 더 커요`, short: '비용이 더 커요' }
    case 'short':
      return { kind: k, text: `해외 가격이 평소보다 ${p2(s.deviationPct)} 낮아요 · 주식을 빌려 팔아야 해서 개인은 어려워요`, short: '개인은 어려워요' }
  }
}
