import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { excludeTeamBrowser, startHeartbeat, watchUsage } from './lib/analytics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Runs before the deferred Umami script reads the flag, so even this first visit is not counted.
excludeTeamBrowser(window.location.search)
watchUsage()
startHeartbeat()

// Caches the NASA data for return visits (production only: in dev it would serve stale files).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((err: unknown) => console.warn('Offline cache unavailable', err))
}
