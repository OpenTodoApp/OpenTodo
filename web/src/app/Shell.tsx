import { useEffect, useState } from 'react'
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
import { ImportScreen } from './ImportScreen'
import { SettingsView } from './SettingsView'
import { SyncStatus } from './SyncStatus'
import { isGPending, setGPending } from './signals'
import { NotificationBell } from './NotificationBell'
import { setCurrentUserId } from '../lib/sharing'

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Changes the server refused after a role change (project-sharing).
  const { rejected } = useSyncStatus()

  // Start view (per device, OpenSpec `custom-views`): applied once per launch, and only
  // when the app opens at its root, so deep links and reloads keep their page.
  useEffect(() => {
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
          ) : route.view === 'day' || route.view === 'week' ? (
            <CalendarView mode={route.view} date={route.date} />
          ) : (
            // App renders the invite and capture screens itself; a stray /invite or /share route inside the shell falls back to the Inbox.
            <TaskListView userId={user.id} route={route.view === 'invite' || route.view === 'share' ? { view: 'inbox' } : route} />
          )}
        </div>
      </main>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const rows: [string, string][] = [
    ['q', 'Quick add a task'],
    ['j / k', 'Move selection down / up'],
    ['Enter', 'Open selected task; accept "complete parent too?"'],
    ['c', 'Complete / reopen selected task (and its subtasks)'],
    ['a', 'Add a subtask to the selected task'],
    ['Shift+A', 'Assign the selected task (type to find a member, Enter assigns)'],
    ['Tab / Shift+Tab', 'Indent under previous sibling / outdent'],
    ['← / →', 'Collapse / expand subtasks of the selected task, or sub-projects of the focused sidebar project'],
    ['m', 'Move the current project under another project or to the top level'],
    ['Shift+S', 'Share the current project: add members by email, change roles, remove, leave, transfer'],
    ['1 – 4', 'Set priority of selected task'],
    ['L', 'Labels of selected task (type to find, Enter adds or creates)'],
    ['e', 'Edit the estimate of the selected task (type 20, 45m, 1h30; Enter)'],
    ['s', 'Schedule the selected task: Day view in placement mode'],
    ['Shift+S', 'Skip the current occurrence of a recurring task'],
    ['Shift+O', 'Recurring task: this occurrence only (standalone copy, series moves on)'],
    ['Delete', 'Delete selected task (and its subtasks)'],
    ['g then i / t / u / c / l / f / v / s', 'Go to Inbox / Today / Upcoming / Completed / Labels / Filter / Views / Settings'],
    ['g then a', 'Go to Assigned to me'],
    ['g then Shift+I', 'Go to Settings → Import data'],
    ['g then d / w', 'Go to the Day / Week calendar'],
    ['j / k (calendar)', 'Select the next / previous task (lane, then blocks)'],
    ['↑ / ↓ (calendar)', 'Move the selected task 15 minutes (a lane task gets a time)'],
    ['← / → (calendar)', 'Move the selected task one day'],
    ['Shift+↑ / Shift+↓ (calendar)', 'Shorten / lengthen the estimate by 15 minutes'],
    ['u / p (calendar)', 'Unschedule (keep the date) / placement mode for the selected task'],
    ['Enter / Esc (placing)', 'Place the task at the ghost / cancel without changes'],
    ['[ / ] / t (calendar)', 'Previous / next day or week, back to today'],
    ['Enter / Esc (in Filter)', 'Jump from the query to the first result / back to the query'],
    ['s (in Filter results)', 'Save the query as a view, pinned to the sidebar'],
    ['/ (in a saved view)', 'Edit the query; Enter saves it, Esc discards'],
    ['Tab / Shift+Tab (on a dashboard)', 'Move between panels; j / k inside a panel, Enter opens, o opens the view'],
    ['↑ / ↓ (in the filter query)', 'Recall recent queries on this device'],
    ['Enter (on an invitation)', 'Settings → Members: copy the invite link created in this session'],
    ['Delete (on an invitation)', 'Settings → Members: revoke a pending invitation'],
    ['g then s, Tab', 'Settings → Security: add, rename (Enter saves, Esc cancels) or delete passkeys'],
    ['Esc', 'Close panel, clear selection'],
    ['?', 'Toggle this help'],
  ]
  const quickAdd: [string, string][] = [
    ['tomorrow · next Wed · 3 Feb · at 3pm', 'Due date and time (6 languages)'],
    ['#project @label p1 +30m', 'Project, label, priority, estimate'],
    ['"quoted text"', 'Keep text literally'],
    ['Backspace ×2 (end of line)', 'Highlight, then dismiss the last chip'],
  ]
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">Keyboard shortcuts</h2>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, d]) => (
              <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-4"><span className="kbd">{k}</span></td>
                <td className="py-1.5 text-slate-600 dark:text-slate-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mb-2 mt-4 text-sm font-semibold">Quick add syntax</h3>
        <table className="w-full text-sm">
          <tbody>
            {quickAdd.map(([k, d]) => (
              <tr key={k} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-4"><code className="text-xs">{k}</code></td>
                <td className="py-1.5 text-slate-600 dark:text-slate-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a className="mt-2 block text-xs text-slate-500 underline" href="https://github.com/pixari/opentodo/blob/main/docs/quick-add.md" target="_blank" rel="noreferrer">
          Full syntax reference (docs/quick-add.md)
        </a>
        <button className="btn-ghost mt-4 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
