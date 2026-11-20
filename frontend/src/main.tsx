import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './i18n'
import { initAnalytics } from './utils/analytics'

if (!/^\/seguimiento\/visita\/?$/.test(window.location.pathname)) initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
