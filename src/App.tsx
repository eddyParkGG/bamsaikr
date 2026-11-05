import { lazy, Suspense, useEffect } from 'react'
import type { ArbSnapshot, Status } from '../shared/api'
import { ASSET_BY_ID, isAssetId } from '../shared/assets'
import { Boundary } from './components/Boundary'
import { Header } from './components/Header'
import { IndicatorStrip } from './components/IndicatorStrip'
import { Ticker } from './components/Ticker'
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
  const arb = useQuery<{ items: ArbSnapshot[] }>('/api/v1/arb', 3000)
  const status = useQuery<Status>('/api/v1/status', 60_000)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const m = path.match(/^\/s\/([A-Za-z0-9]+)/)
  const id = m?.[1].toUpperCase()
  const asset = id && isAssetId(id) ? ASSET_BY_ID[id] : null
  const isDocs = path === '/developers'

  let page
  if (isDocs) page = <Developers />
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
    </>
  )
}
