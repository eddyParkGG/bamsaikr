// What to tell people about tonight's number: how much it can still move before the open
import { nightStageAt, type NightStage } from '../../shared/night'

const KST = 9 * 3600_000

export type { NightStage }

export function nightStage(nextOpen: number, now = Date.now()) {
  const { stage, usClose } = nightStageAt(nextOpen, now)
  const closeHour = usClose ? new Date(usClose + KST).getUTCHours() : 6
  const when = `미국장이 닫히는 새벽 ${closeHour}시 이후가 가장 정확해요`
  const text = stage === 'before' ? '미국장이 열리기 전이라 크게 바뀔 수 있어요' : stage === 'during' ? '미국장이 열려 있어 계속 바뀌어요' : '미국장이 닫혀 거의 확정이에요'
  return { stage, closeHour, text, when, short: stage === 'after' ? text : when }
}

/** Past opens that went the way Hyperliquid stood at this stage of the night (weeknight or weekend), or null */
export function followAtStage(p: { night?: { follow?: { ratePct: number | null } | null } | null }) {
  return p.night?.follow?.ratePct ?? null
}

/** '과거 이 시간대 87%가 이 방향대로 열렸어요' (weekends say 주말·연휴) */
export function followText(p: { regime: string; night?: { follow?: { ratePct: number | null } | null } | null }) {
  const r = followAtStage(p)
  return r == null ? null : `과거 ${p.regime === 'weekend' ? '주말·연휴 ' : ''}이 시간대 ${Math.round(r)}%가 이 방향대로 열렸어요`
}

