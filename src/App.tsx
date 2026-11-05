import { lazy, Suspense, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../shared/api'
import { ASSET_BY_ID, isAssetId } from '../shared/assets'
import { Boundary } from './components/Boundary'
import { Header } from './components/Header'
import { IndicatorStrip } from './components/IndicatorStrip'
import { Ticker } from './components/Ticker'
import { Toaster } from './components/Toast'
import { usePrefs } from './lib/prefs'
import { useQuery } from './lib/query'
import { usePath } from './lib/router'
import EasyHome from './pages/EasyHome'
import EasyDetail from './pages/EasyDetail'

// Pro mode and API docs are loaded lazily on first visit
const ProTerminal = lazy(() => import('./pages/ProTerminal'))
const Developers = lazy(() => import('./pages/Developers'))
const About = lazy(() => import('./pages/About'))

export default function App() {
  const path = usePath()
  const mode = usePrefs((s) => s.mode)
  const theme = usePrefs((s) => s.theme)
  const arb = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const status = useQuery<Status>('/api/v1/status', 60_000)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const m = path.match(/^\/s\/([A-Za-z0-9]+)/)
  const id = m?.[1].toUpperCase()
  const asset = id && isAssetId(id) ? ASSET_BY_ID[id] : null
  const isDocs = path === '/developers' || path === '/about'

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
      : '국내 주식시장이 닫힌 밤과 주말에도 하이퍼리퀴드에서 거래되는 한국 주식 가격으로 다음 날 장 시작 가격과 시세차익 기회를 보여드려요.'
    document.querySelector('meta[name="description"]')?.setAttribute('content', d)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://bamsai.vercel.app${path}`)
  }, [path, asset])

  let page
  if (path === '/developers') page = <Developers />
  else if (path === '/about') page = <About />
  else if (mode === 'pro') page = <ProTerminal asset={asset ?? ASSET_BY_ID.SKHX} />
  else if (asset) page = <EasyDetail asset={asset} />
  else page = <EasyHome />

  return (
    <>
      <Header />
      <main className={`shell ${mode === 'pro' && !isDocs ? 'shell--pro' : ''}`}>
        {mode === 'pro' && !isDocs && (
          <Boundary fallback={null}>
            <IndicatorStrip />
          </Boundary>
        )}
        <Boundary key={path + mode}>
          <Suspense fallback={<div className="skeleton" style={{ height: 480, marginTop: 16 }} />}>{page}</Suspense>
        </Boundary>
      </main>
      <Ticker items={arb.data?.items} status={status.data} />
      <Toaster />
    </>
  )
}
