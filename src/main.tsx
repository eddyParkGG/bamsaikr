import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initFit } from './lib/fit'
import { initGa, trackPage } from './lib/ga'
import { reloadForNewBuild } from './components/Boundary'
import './styles.css'
import './app.css'

// Vite reports a chunk it could not preload (page opened before a deploy): reload for the new build
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewBuild()) e.preventDefault()
})

initGa()
initFit()
trackPage(location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
