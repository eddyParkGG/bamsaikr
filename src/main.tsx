import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initGa, trackPage } from './lib/ga'
import './styles.css'
import './app.css'

initGa()
trackPage(location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
