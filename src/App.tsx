import { lazy, Suspense, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../shared/api'
import { ASSET_BY_ID, isAssetId } from '../shared/assets'
import { Header } from './components/Header'
import { Ticker } from './components/Ticker'
import { Watchlist } from './components/Watchlist'
import { usePrefs } from './lib/prefs'
import { useQuery } from './lib/query'
import { usePath } from './lib/router'
import EasyHome from './pages/EasyHome'
import EasyDetail from './pages/EasyDetail'

// 프로 모드·API 문서는 처음 들어올 때만 받음
const ProTerminal = lazy(() => import('./pages/ProTerminal'))
const Developers = lazy(() => import('./pages/Developers'))

export default function App() {
  const path = usePath()
  const mode = usePrefs((s) => s.mode)
  const theme = usePrefs((s) => s.theme)
  const sideOpen = usePrefs((s) => s.sideOpen)
  const arb = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const status = useQuery<Status>('/api/v1/status', 60_000)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const m = path.match(/^\/s\/([A-Za-z0-9]+)/)
  const id = m?.[1].toUpperCase()
  const asset = id && isAssetId(id) ? ASSET_BY_ID[id] : null

  let page
  if (path === '/developers') page = <Developers />
  else if (mode === 'pro') page = <ProTerminal asset={asset ?? ASSET_BY_ID.SKHX} />
  else if (asset) page = <EasyDetail asset={asset} />
  else page = <EasyHome />

  const activeId = mode === 'pro' && !asset && path !== '/developers' ? 'SKHX' : asset?.id

  return (
    <>
      <Header />
      <div className={`shell ${sideOpen ? '' : 'shell--collapsed'}`}>
        <main className="shell__main">
          <Suspense fallback={<div className="skeleton" style={{ height: 480, marginTop: 16 }} />}>{page}</Suspense>
        </main>
        <div className="shell__side">
          <Watchlist items={arb.data?.items} active={activeId} open={sideOpen} />
        </div>
      </div>
      <Ticker items={arb.data?.items} status={status.data} />
    </>
  )
}
