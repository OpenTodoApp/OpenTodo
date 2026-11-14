import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { watchVisualViewport } from './ui'
import { watchFocusClearance } from './lib/focusClearance'
import { bootLanguage, t } from './lib/i18n'
import { logUnhandledRejections, watchAppUpdates } from './lib/appUpdate'
import { installShellLinks } from './lib/shell'
import { startShellPublishers } from './lib/shellPublish'

// Bottom sheets sit above the on-screen keyboard; the focused field stays visible.
watchVisualViewport()
// A focused element never stays under a sticky or fixed bar (accessibility-aa, WCAG 2.2 2.4.11).
watchFocusClearance()
// On a touch device, shortcut hints show once a hardware keyboard is used (touch-keyboard-hints).
void import('./lib/keyboardSeen').then((m) => m.watchHardwareKeyboard())

// Open tabs recover after a server upgrade (client-sync-robustness): a missing
// chunk reloads, a new service worker or database version asks to reload.
watchAppUpdates()
// A rejected promise nobody handled leaves a trace instead of vanishing.
logUnhandledRejections()
// In a native shell, links to other origins open in the system browser (native-shells D5).
installShellLinks(document)
// A file that could not be saved says so (shell-repairs: saving a file from the app).
window.addEventListener('opentodo:save-failed', () => void import('./app/bulk/toastStore').then((m) => m.showActionToast(t('The file could not be saved.'))))
// In a native shell, reminders and the widgets' Today list are handed over as they change.
startShellPublishers()
// The page's icons and description follow the instance branding: the service
// worker serves the signed page unchanged (signed-web-app D7).
void import('./lib/pageBranding').then((m) => m.watchPageBranding())

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
