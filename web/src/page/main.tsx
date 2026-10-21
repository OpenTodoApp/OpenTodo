// Entry of the task page document (/t/<secret>, OpenSpec task-pages design D8): no
// app shell, no local database, no service worker. The language follows the guest's
// browser and is not stored, so the page leaves nothing behind but the typed name.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { setDateLocale } from '../lib/dates'
import { applyCatalog, fetchCatalog } from '../lib/i18n/catalog'
import { intlLocale, resolveLanguage } from '../lib/i18n/locale'
import { secretFromPath } from '../lib/taskPageApi'
import { TaskPageScreen } from './TaskPageScreen'

async function boot(): Promise<void> {
  try {
    const code = resolveLanguage('system')
    const locale = intlLocale('system')
    if (code !== 'en') applyCatalog(code, locale, await fetchCatalog(code))
    setDateLocale(locale)
    document.documentElement.lang = code
  } catch {
    // English, the source text, when the catalog cannot be loaded.
  }
}

void boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TaskPageScreen secret={secretFromPath(window.location.pathname)} fragment={window.location.hash} />
    </StrictMode>,
  )
})
