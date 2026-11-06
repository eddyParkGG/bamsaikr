import { lazy, Suspense, useEffect } from 'react'
import { ASSET_BY_ID, isAssetId } from '../shared/assets'
import { Splash } from './components/Brand'
import { Boundary } from './components/Boundary'
import { Header } from './components/Header'
import { Ticker } from './components/Ticker'
import { Toaster } from './components/Toast'
import { LaunchNotify } from './components/LaunchNotify'
import { usePrefs } from './lib/prefs'
import { useArb, useStatus } from './lib/data'
import { usePath } from './lib/router'
import { useMarketRollover } from './lib/market'
import EasyHome from './pages/EasyHome'

// Pro mode and API docs are loaded lazily on first visit
const ProTerminal = lazy(() => import('./pages/ProTerminal'))
const Developers = lazy(() => import('./pages/Developers'))
const About = lazy(() => import('./pages/About'))

export default function App() {
  const path = usePath()
  const theme = usePrefs((s) => s.theme)
  const arb = useArb()
  const status = useStatus()
  useMarketRollover()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const m = path.match(/^\/s\/([A-Za-z0-9]+)/)
  const id = m?.[1].toUpperCase()
  const asset = id && isAssetId(id) ? ASSET_BY_ID[id] : null
  const isDocs = path === '/developers' || path === '/about'

  // Keep the address honest: unknown or lower-case asset ids (and /market) show the asset actually rendered
  useEffect(() => {
    const onMarketPath = path.startsWith('/s/') || path === '/market'
    if (!onMarketPath) return
    const want = `/s/${(asset ?? ASSET_BY_ID.SKHX).id}`
    if (path !== want) history.replaceState(history.state, '', want + location.search)
  }, [path, asset])

  // Per-route title and description (SEO / link previews)
  useEffect(() => {
    const base = '밤사이'
    const t =
      path === '/about'
        ? `소개 · ${base}`
        : path === '/developers'
          ? `API · MCP · ${base}`
          : asset
            ? `${asset.name} 밤사이 시세 · 내일 장 시작 가격 예측 | ${base}`
            : `${base} · 국장이 닫힌 사이, 내일 가격을 먼저 보는 곳`
    document.title = t
    const d = asset
      ? `${asset.name}의 하이퍼리퀴드 가격을 원화로 바꿔 국내 가격과 비교하고, 다음 날 장 시작 가격과 시세차익 기회를 보여드려요.`
      : path === '/about'
        ? '밤사이가 밤사이 해외 가격, 시간대별 적중률, 시세차익 기회를 어떻게 계산하는지 예시와 함께 설명해요.'
        : path === '/developers'
          ? '밤사이 데이터를 REST API, OpenAPI, MCP로 가져다 쓰는 방법이에요.'
          : '국내 주식시장이 닫힌 밤과 주말에도 하이퍼리퀴드에서 거래되는 한국 주식 가격으로 다음 날 장 시작 가격과 시세차익 기회를 보여드려요.'
    document.querySelector('meta[name="description"]')?.setAttribute('content', d)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://bamsai.kr${path}`)
  }, [path, asset])

  let page
  if (path === '/developers') page = <Developers />
  else if (path === '/about') page = <About />
  else if (path.startsWith('/s/') || path === '/market') page = <ProTerminal asset={asset ?? ASSET_BY_ID.SKHX} />
  else page = <EasyHome />
  const isMarket = !isDocs && path !== '/'

  return (
    <>
      <Header />
      <main className={`shell ${isMarket ? 'shell--pro' : ''}`}>
        <Boundary key={path}>
          <Suspense fallback={<Splash />}>{page}</Suspense>
        </Boundary>
      </main>
      <Ticker items={arb.data?.items} status={status.data} />
      <Toaster />
      <LaunchNotify />
    </>
  )
}
