// 직접 확인한 주요 이슈 (출처 링크 포함). KIS 뉴스 API 에 없는 크립토/해외 쪽 이벤트 위주
// 하루에 종목당 1개만 노출
import type { AssetId } from '../../shared/assets.js'

export interface CuratedEvent {
  date: string // KST YYYY-MM-DD
  time?: string // KST HH:MM
  assets: AssetId[]
  title: string
  summary: string
  url: string
}

export const CURATED_EVENTS: CuratedEvent[] = []
