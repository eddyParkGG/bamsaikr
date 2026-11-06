// Per-page title, description and a short crawler summary. One source for the app (document.title etc.)
// and for the build step that writes a static HTML file per page (scripts/prerender.ts), so search engines
// and AI crawlers that do not run JavaScript still see each page's own content and canonical URL
import { ASSETS, ASSET_BY_ID, canPredict, hasKrx, type Asset } from './assets'

export const SITE = 'https://bamsai.kr'
const BASE = '밤사이'

export interface PageMeta {
  path: string
  title: string
  description: string
  /** Visible to crawlers only (sr-only block in the static HTML) */
  h1: string
  body: string[]
}

const stockBody = (a: Asset) =>
  canPredict(a)
    ? [
        `${a.name}(${a.krxCode})은 국내 시장(정규장·넥스트레이드)이 닫힌 저녁 8시부터 다음 날 아침 8시까지도 하이퍼리퀴드(trade.xyz)에서 거래돼요. 이 가격을 업비트 원/USDC로 바꿔 국내 가격과 한 차트에 겹쳐 보여드려요.`,
        '국내 장중에는 국내 지금 가격과 미국장이 닫힌 뒤 국내 개장 직전 하이퍼리퀴드 가격을, 장 마감 후에는 국내 종가와 지금 하이퍼리퀴드 가격을 비교해요.',
        '미국장 전·중·후 단계별로 과거에 국내 시장이 하이퍼리퀴드 방향대로 열린 비율, 보통 시작하는 범위(10번 중 8번), 지난 개장 기록, 호가, 투자자 동향, 비용을 뺀 시세차익을 함께 볼 수 있어요.',
      ]
    : [`${a.name}의 하이퍼리퀴드 가격을 원화로 바꿔 보여드려요. ${a.note ?? ''}`.trim(), hasKrx(a) ? '국내 보통주와의 가격 차이와 비용을 뺀 시세차익도 계산해요.' : '국내에 같은 가격의 상품이 없어서 가격과 차트만 제공해요.']

export function pageMeta(path: string): PageMeta {
  if (path === '/about')
    return {
      path,
      title: `소개 · ${BASE}`,
      description: '밤사이가 밤사이 해외 가격, 미국장 시간대별 적중률, 시세차익 기회를 어떻게 계산하는지 예시와 함께 설명해요.',
      h1: '밤사이는 이렇게 계산해요',
      body: [
        '하이퍼리퀴드 가격은 업비트 원/USDC 호가로 원화로 바꿔요. 국내 시장은 정규장과 넥스트레이드를 합친 08:00~20:00이고, 저녁 8시 마지막 가격과 다음 날 08:00~08:10 평균 가격을 비교해요.',
        '저녁 9시에 본 하이퍼리퀴드 가격은 다음 날 방향이 49% 맞았지만, 미국장이 닫힌 새벽 6시 가격은 86~87% 맞았어요(2026-04-13 이후 평일 밤). 그래서 지금이 미국장 전·중·후 중 어디인지에 맞는 과거 비율을 보여줘요.',
        '시세차익은 두 시장 가격 차이가 최근 5거래일 평소 차이보다 더 벌어진 만큼에서 수수료·세금·환전 비용·펀딩비를 뺀 금액이에요.',
      ],
    }
  if (path === '/developers')
    return {
      path,
      title: `API · MCP · ${BASE}`,
      description: '밤사이 데이터를 REST API, OpenAPI, MCP로 가져다 쓰는 방법이에요. 조회는 키 없이 IP당 1분 300번까지 쓸 수 있어요.',
      h1: '밤사이 API · MCP',
      body: [
        'REST API(/api/v1)로 두 시장 가격 차이, 밤사이 하이퍼리퀴드 가격과 미국장 단계별 적중률, 지난 개장 기록, 차트용 캔들, 호가, 뉴스, 투자자 동향을 조회할 수 있어요. OpenAPI 문서는 /api/openapi.json에 있어요.',
        '자동매매 봇·AI 에이전트가 붙여 쓰는 MCP 서버(/api/mcp)는 Claude, ChatGPT, Cursor 같은 에이전트에서 get_arbitrage, predict_open, get_convergence_history, get_news, preview_pair_order 도구로 바로 쓸 수 있어요.',
        'bamsai.kr은 실제 주문을 보내지 않고 미리보기만 돌려줘요.',
      ],
    }
  const asset = path.startsWith('/s/') ? ASSET_BY_ID[path.slice(3) as keyof typeof ASSET_BY_ID] : undefined
  if (asset)
    return {
      path,
      title: `${asset.name} 밤사이 시세 · 장 시작 전 해외 가격 | ${BASE}`,
      description: canPredict(asset)
        ? `${asset.name}의 하이퍼리퀴드 가격을 원화로 바꿔 국내 가격과 비교해요. 미국장 마감 뒤 가격, 과거에 국내 시장이 그 방향대로 열린 비율, 비용을 뺀 시세차익까지.`
        : `${asset.name}의 하이퍼리퀴드 가격을 원화로 바꿔 차트와 호가로 보여드려요.`,
      h1: `${asset.name} 밤사이 시세`,
      body: stockBody(asset),
    }
  return {
    path: '/',
    title: `${BASE} · 국장 시작 전, 가격을 먼저 가늠해 보세요`,
    description:
      '국내 주식시장이 닫힌 밤과 주말에도 하이퍼리퀴드에서 거래되는 삼성전자·SK하이닉스·현대차 가격을 원화로 바꿔, 미국장 마감 뒤 가격과 과거에 국내 시장이 그 방향대로 열린 비율, 비용을 뺀 시세차익을 보여드려요.',
    h1: '국장 시작 전, 가격을 먼저 가늠해 보세요',
    body: [
      '국내 시장은 넥스트레이드까지 합쳐도 일주일 168시간 중 약 59시간만 열려요. 밤사이는 나머지 시간에도 하이퍼리퀴드(trade.xyz)에서 거래되는 삼성전자·SK하이닉스·현대차 가격을 업비트 원/USDC로 바꿔 보여드려요.',
      '미국장이 닫힌 뒤(겨울 새벽 6시, 여름 새벽 5시) 가격이 다음 날 국내 시작 가격과 가장 가까워요. 지금 시간대에 과거 국내 시장이 그 방향대로 열린 비율을 함께 보여드리고, 장 시작 가격은 직접 가늠하시면 돼요.',
      '수수료·세금·환전 비용·펀딩비를 뺀 두 시장 사이 시세차익 기회도 계산해요.',
    ],
  }
}

/** Every page worth indexing, for the static build and the sitemap */
export const INDEXED_PATHS = ['/', '/about', '/developers', ...ASSETS.map((a) => `/s/${a.id}`)]
