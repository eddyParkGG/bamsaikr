import { lazy, Suspense, useEffect } from 'react'
import { ASSET_BY_ID, isAssetId } from '../shared/assets'
import { Header } from './components/Header'
import { usePrefs } from './lib/prefs'
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const m = path.match(/^\/s\/([A-Za-z0-9]+)/)
  const id = m?.[1].toUpperCase()
  const asset = id && isAssetId(id) ? ASSET_BY_ID[id] : null

  let page
  if (path === '/developers') page = <Developers />
  else if (mode === 'pro') page = <ProTerminal asset={asset ?? ASSET_BY_ID.SMSN} />
  else if (asset) page = <EasyDetail asset={asset} />
  else page = <EasyHome />

  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 480 }} /></div>}>{page}</Suspense>
      </main>
    </>
  )
}
