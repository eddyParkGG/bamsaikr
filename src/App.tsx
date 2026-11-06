import { pageMeta, SITE } from '../shared/pageMeta'
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

  // Per-route title, description and canonical (same source as the static per-page HTML, shared/pageMeta.ts)
  useEffect(() => {
    const m = pageMeta(asset ? `/s/${asset.id}` : path)
    document.title = m.title
    const set = (sel: string, attr: string, v: string) => document.querySelector(sel)?.setAttribute(attr, v)
    set('meta[name="description"]', 'content', m.description)
    set('link[rel="canonical"]', 'href', SITE + m.path)
    set('meta[property="og:url"]', 'content', SITE + m.path)
    set('meta[property="og:title"]', 'content', m.title)
    set('meta[property="og:description"]', 'content', m.description)
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
