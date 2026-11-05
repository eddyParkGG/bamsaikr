// Single source of truth for "is the next-open prediction meaningful right now?".
// Every surface (home list, stock detail bars and tabs) uses this, so the in-session behaviour
// and copy can never drift between pages.
import type { Prediction } from '../../shared/api'
import { Help } from './Help'
import { useStatus } from '../lib/data'
import { kstDay, untilText } from '../lib/format'
import { SessionLine } from '../lib/market'

/** While KRX or NXT trades, the domestic price itself is the answer; the forecast starts after the 20:00 close */
export const predictionReady = (p: Prediction | null | undefined) => !!p && p.status !== 'in-session'

export const IN_SESSION = {
  title: '지금은 국내 시장이 열려 있어요',
  short: '저녁 8시 이후 예측',
  body: '국내 시장(넥스트레이드 포함)이 열려 있을 땐 지금 국내 가격이 곧 답이에요. 저녁 8시에 모두 닫히면 내일 아침 가격을 예측해 보여드려요.',
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

/** "When" line next to a forecast: time left to today's close during the regular session, else the next open */
export function NextOpenWhen({ at, long = false }: { at: number; long?: boolean }) {
  const status = useStatus().data
  // While the domestic market trades the forecast waits for the close; show that countdown
  if (status && status.session !== 'closed') return <SessionLine status={status} style="words" />
  return (
    <>
      {kstDay(at)} {long ? '오전 8시 개장' : '08:00'} · {untilText(at)}
    </>
  )
}

export const THIN_HELP =
  '밤사이 하이퍼리퀴드 거래가 100만 달러(약 13억 원)보다 적으면 몇 건의 주문에도 가격이 흔들려요. 이런 밤에는 하이퍼리퀴드 방향대로 시작한 비율이 낮았어요.'

/** Tag on a forecast when Hyperliquid trades too little at night for its price to mean much */
export function ThinTag({ p, help = true }: { p: Prediction; help?: boolean }) {
  if (!p.thin) return null
  return (
    <span className="thin-tag">
      거래 적어 덜 정확{help && <Help text={THIN_HELP} />}
    </span>
  )
}
