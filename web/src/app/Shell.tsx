import { lazy, Suspense, useEffect, useState } from 'react'
import type { User } from '../lib/types'
import { resolveStartView } from '../lib/views'
import { describeRejected } from '../lib/sharing'
import { dismissRejected, useSyncStatus } from '../lib/sync'
import { navigate, useRoute } from './router'
import { CalendarView } from './CalendarView'
import { FilterView } from './FilterView'
import { LabelsView } from './LabelsView'
import { SavedViewRoute } from './SavedViewView'
import { ViewsView } from './ViewsView'
import { Sidebar } from './Sidebar'
import { TaskListView } from './TaskListView'
import { TrashView } from './TrashView'
import { FeedView } from './FeedView'
import { ImportScreen } from './ImportScreen'
import { SettingsView } from './SettingsView'
import { SyncStatus } from './SyncStatus'
import { ReminderToasts } from './ReminderToasts'
import { ArchivePrompt } from './ArchivePrompt'
import { isGPending, openTaskInList, setGPending } from './signals'
import { db } from '../lib/db'
import { watchViewerZone } from '../lib/dates'
import { NotificationBell } from './NotificationBell'
import { setCurrentUserId } from '../lib/sharing'
import { type HelpSection, ShortcutHelp } from './ShortcutHelp'
import { useVimEnabled } from './vim/prefs'

// Optional Vim layer (vim-keybindings): its own chunk, fetched only while the
// per-device switch is on, so the default bundle carries just this boundary.
const VimLayer = lazy(() => import('./vim/VimLayer'))

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Changes the server refused after a role change (project-sharing).
  const { rejected } = useSyncStatus()

  // A travelling device: re-read the time zone whenever the app becomes visible
  // (absolute-datetimes), so zoned dues re-render in the new zone.
  useEffect(() => watchViewerZone(), [])

  // Start view (per device, OpenSpec `custom-views`): applied once per launch, and only
  // when the app opens at its root, so deep links and reloads keep their page.
  useEffect(() => {
    // A notification click opens /?task=<id>: show that task instead of the start view.
    const taskParam = new URLSearchParams(location.search).get('task')
    if (taskParam) {
      history.replaceState(null, '', location.pathname)
      void db.tasks.get(taskParam).then((t) => t && openTaskInList(t))
      return
    }
    if (location.pathname !== '/') return
    let cancelled = false
    void resolveStartView().then((start) => {
      if (cancelled || location.pathname !== '/') return
      if (start.kind === 'saved') navigate({ view: 'view', id: start.id }, { replace: true })
      else {
        if (start.view !== 'inbox') navigate({ view: start.view }, { replace: true })
        if (start.removed) setNotice('Your start view was deleted, so the Inbox opened instead.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [route])

  // Assignment rules (task-assignment) need the account id offline too.
  useEffect(() => {
    void setCurrentUserId(user.id)
  }, [user.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (typing) return
      // Pressing Shift on its own (for `g` then Shift+I) must not end the `g` sequence.
      if (e.key === 'Shift') return
      if (e.key === 'g') {
        setGPending(true)
        return
      }
      if (isGPending()) {
        // Cleared after this event: list and calendar handlers check the flag for the same key.
        setTimeout(() => setGPending(false), 0)
        if (e.key === 'i') navigate({ view: 'inbox' })
        if (e.key === 't') navigate({ view: 'today' })
        if (e.key === 'u') navigate({ view: 'upcoming' })
        if (e.key === 'c') navigate({ view: 'completed' })
        if (e.key === 'a') navigate({ view: 'assigned' })
        if (e.key === 'l') navigate({ view: 'labels' })
        if (e.key === 'v') navigate({ view: 'views' })
        if (e.key === 'd') navigate({ view: 'day' })
        if (e.key === 'w') navigate({ view: 'week' })
        if (e.key === 'f') {
          // The Filter view focuses its input on mount; keep this "f" out of it.
          e.preventDefault()
          navigate({ view: 'filter' })
        }
        if (e.key === 's') navigate({ view: 'settings' })
        if (e.key === 'x') navigate({ view: 'trash' })
        // `g f` is the Filter view, so the activity feed is `g h` (activity-feed).
        if (e.key === 'h') navigate({ view: 'feed' })
        // `g i` is the Inbox, so Import is `g` then Shift+I.
        if (e.key === 'I') navigate({ view: 'import' })
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [showHelp, setShowHelp] = useState(false)
  const vim = useVimEnabled()
  const [vimHelp, setVimHelp] = useState<HelpSection | null>(null)

  return (
    <div className="flex h-full">
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-slate-50 transition-transform dark:border-slate-800 dark:bg-slate-900 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar route={route} user={user} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800 md:px-6">
          <button className="btn-ghost md:hidden" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="flex-1" />
          <NotificationBell />
          <SyncStatus />
          <button className="btn-ghost text-xs" onClick={() => setShowHelp(true)} title="Keyboard shortcuts">
            <span className="kbd">?</span>
          </button>
        </header>
        {notice && (
          <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 md:px-6">
            <p className="flex-1">{notice}</p>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        {rejected && (
          <div role="alert" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100 md:px-6">
            <p className="flex-1">{describeRejected(rejected)}. The server's values are shown again.</p>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={dismissRejected}>Dismiss</button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {route.view === 'settings' ? (
            <SettingsView user={user} onLogout={onLogout} />
          ) : route.view === 'import' ? (
            <ImportScreen />
          ) : route.view === 'labels' ? (
            <LabelsView route={route} />
          ) : route.view === 'filter' ? (
            <FilterView />
          ) : route.view === 'views' ? (
            <ViewsView />
          ) : route.view === 'view' ? (
            <SavedViewRoute id={route.id} />
          ) : route.view === 'trash' ? (
            <TrashView />
          ) : route.view === 'feed' ? (
            <FeedView />
          ) : route.view === 'day' || route.view === 'week' ? (
            <CalendarView mode={route.view} date={route.date} />
          ) : (
            // App renders the invite, reset and capture screens itself; a stray /invite, /reset or /share route inside the shell falls back to the Inbox.
            <TaskListView userId={user.id} route={route.view === 'invite' || route.view === 'reset' || route.view === 'share' ? { view: 'inbox' } : route} />
          )}
        </div>
        {vim && (
          <Suspense fallback={null}>
            <VimLayer userId={user.id} onHelp={() => setShowHelp(true)} onHelpSection={setVimHelp} />
          </Suspense>
        )}
      </main>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} extraSections={vim && vimHelp ? [vimHelp] : []} />}
      <ReminderToasts />
      <ArchivePrompt />
    </div>
  )
}
