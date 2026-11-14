// Entry of the task page document (/t/<secret>, OpenSpec task-pages design D8, and a
// note page's /n/<secret>, note-public-links), also
// served for a routine email's stop link (/routine-emails/<secret>,
// routines-shared-email D5): no app shell, no local database, no service worker. The language follows the guest's
// browser and is not stored, so the page leaves nothing behind but the typed name.
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { setDateLocale } from '../lib/dates'
import { applyCatalog, fetchCatalog } from '../lib/i18n/catalog'
import { intlLocale, resolveLanguage } from '../lib/i18n/locale'
import { secretFromPath } from '../lib/taskPageApi'
import { RoutineEmailStopScreen } from './RoutineEmailStopScreen'
import { TaskPageScreen } from './TaskPageScreen'

// A note page (/n/<secret>, note-public-links D1): its own chunk.
const NotePageScreen = lazy(() => import('./NotePageScreen'))

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

const stop = /^\/routine-emails\/([^/]+)/.exec(window.location.pathname)?.[1]
const note = window.location.pathname.startsWith('/n/')

void boot().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {stop
        ? <RoutineEmailStopScreen token={stop} />
        : note
        ? <Suspense fallback={null}><NotePageScreen secret={secretFromPath(window.location.pathname)} fragment={window.location.hash} /></Suspense>
        : <TaskPageScreen secret={secretFromPath(window.location.pathname)} fragment={window.location.hash} />}
    </StrictMode>,
  )
})
