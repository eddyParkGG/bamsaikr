import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initFit } from './lib/fit'
import { initGa, trackPage } from './lib/ga'
import './styles.css'
import './app.css'

initGa()
initFit()
trackPage(location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
