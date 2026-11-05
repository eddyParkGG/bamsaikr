// Easy mode copy. Conclusion first, one big number, jargon spelled out
export function verdict(probUp: number) {
  if (probUp >= 0.7) return { text: '오를 가능성이 높아요', tone: 'up' as const }
  if (probUp >= 0.57) return { text: '조금 오를 것 같아요', tone: 'up' as const }
  if (probUp > 0.43) return { text: '오를지 내릴지 반반이에요', tone: '' as const }
  if (probUp > 0.3) return { text: '조금 내릴 것 같아요', tone: 'down' as const }
  return { text: '내릴 가능성이 높아요', tone: 'down' as const }
}

/** State probability for whichever side (up/down) is larger */
export function probLabel(probUp: number) {
  return probUp >= 0.5 ? { label: '오를 확률', value: Math.round(probUp * 100), tone: 'up' } : { label: '내릴 확률', value: Math.round((1 - probUp) * 100), tone: 'down' }
}

export const PERP_PLAIN = '하이퍼리퀴드'
