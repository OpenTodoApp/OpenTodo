import { useEffect, useState } from 'react'
import type { User } from '../lib/types'
import { navigate, useRoute } from './router'
import { FilterView } from './FilterView'
import { LabelsView } from './LabelsView'
import { Sidebar } from './Sidebar'
import { TaskListView } from './TaskListView'
import { ImportScreen } from './ImportScreen'
import { SettingsView } from './SettingsView'
import { SyncStatus } from './SyncStatus'

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [route])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (typing) return
      // Pressing Shift on its own (for `g` then Shift+I) must not end the `g` sequence.
      if (e.key === 'Shift') return
      if (e.key === 'g') {
        pendingG = true
        setTimeout(() => (pendingG = false), 800)
        return
      }
      if (pendingG) {
        pendingG = false
        if (e.key === 'i') navigate({ view: 'inbox' })
        if (e.key === 't') navigate({ view: 'today' })
        if (e.key === 'u') navigate({ view: 'upcoming' })
        if (e.key === 'c') navigate({ view: 'completed' })
        if (e.key === 'l') navigate({ view: 'labels' })
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
          <SyncStatus />
          <button className="btn-ghost text-xs" onClick={() => setShowHelp(true)} title="Keyboard shortcuts">
            <span className="kbd">?</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {route.view === 'settings' ? (
            <SettingsView user={user} onLogout={onLogout} />
          ) : route.view === 'import' ? (
            <ImportScreen />
          ) : route.view === 'labels' ? (
            <LabelsView route={route} />
          ) : route.view === 'filter' ? (
            <FilterView />
          ) : (
            // App renders the invite screen itself; a stray /invite route inside the shell falls back to the Inbox.
            <TaskListView route={route.view === 'invite' ? { view: 'inbox' } : route} />
          )}
        </div>
      </main>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

let pendingG = false

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
    ['Tab / Shift+Tab', 'Indent under previous sibling / outdent'],
    ['← / →', 'Collapse / expand subtasks of the selected task, or sub-projects of the focused sidebar project'],
    ['m', 'Move the current project under another project or to the top level'],
    ['1 – 4', 'Set priority of selected task'],
    ['L', 'Labels of selected task (type to find, Enter adds or creates)'],
    ['Delete', 'Delete selected task (and its subtasks)'],
    ['g then i / t / u / c / l / f / s', 'Go to Inbox / Today / Upcoming / Completed / Labels / Filter / Settings'],
    ['g then Shift+I', 'Go to Settings → Import data'],
    ['Enter / Esc (in Filter)', 'Jump from the query to the first result / back to the query'],
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
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
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
