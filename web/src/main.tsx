import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { watchVisualViewport } from './app/overlay'
import { bootLanguage } from './lib/i18n'

// Bottom sheets sit above the on-screen keyboard; the focused field stays visible.
watchVisualViewport()

// The last language applied on this device (else the browser's) is loaded before
// the first render, so there is no flash of English (app-localization D3).
void bootLanguage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
