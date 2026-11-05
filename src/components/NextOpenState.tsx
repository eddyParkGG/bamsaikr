// Single source of truth for "is the next-open prediction meaningful right now?".
// Every surface (easy list, easy detail, pro mini panel, pro prediction tab) uses this, so the
// in-session behaviour and copy can never drift between modes.
import type { Prediction } from '../../shared/api'

/** During regular hours both markets trade and perp just tracks KRX, so there is no signal yet */
export const predictionReady = (p: Prediction | null | undefined) => !!p && p.status !== 'in-session'

export const IN_SESSION = {
  title: '지금은 국내 시장이 열려 있어요',
  short: '15:30 마감 후 예측',
  body: '두 시장이 같이 열려 있을 땐 해외 가격이 국내 주가를 바로 따라가서, 다음 시가를 미리 알려줄 정보가 거의 없어요. 15:30에 장이 끝나면 예측을 보여드려요.',
}

/** Notice shown wherever a prediction would be. `compact` for list rows and small panels */
export function InSessionNotice({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <p className="faint" style={{ fontSize: 13, fontWeight: 600 }} data-fit>
        {IN_SESSION.short}
      </p>
    )
  return (
    <div className="in-session">
      <p className="in-session__title">{IN_SESSION.title}</p>
      <p className="in-session__body">{IN_SESSION.body}</p>
    </div>
  )
}
