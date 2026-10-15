import { DESKTOP_HEADER_QUERY, IconButton, PageActions, PageBarTitle, useMediaQuery, usePageBar } from '../ui'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { User } from '../lib/types'
import { resolveStartView } from '../lib/views'
import { describeRejected } from '../lib/sharing'
import { dismissRejected, useSyncStatus } from '../lib/sync'
import { canonicalPath, navigate, useRoute } from './router'
import { SIDEBAR_COLLAPSED_REM, SIDEBAR_MAX_REM, SIDEBAR_MIN_REM, setSidebarWidth, toggleSidebarCollapsed, useSidebarLayout } from './sidebarLayout'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { FilterView } from './FilterView'
import { LabelsView } from './LabelsView'
import { SavedViewRoute } from './SavedViewView'
import { ViewsView } from './ViewsView'
import { Sidebar } from './Sidebar'
import { TaskListView } from './TaskListView'
import { AskScreen } from './assistant/AskEntry'
import { TrashView } from './TrashView'
import { FeedView } from './FeedView'
import { ImportScreen } from './ImportScreen'
import { SettingsView } from './SettingsView'
import { ReminderToasts } from './ReminderToasts'
import { ArchivePrompt } from './ArchivePrompt'
import { isGPending, openTaskInList, setGPending } from './signals'
import { closePanelIfStale, openTaskPanel, panelTaskId, taskIdFromAddress } from './panel'
import { listState } from './listActions'
import { PanelHost } from './PanelHost'
import { TaskPage } from './TaskPage'
import { db } from '../lib/db'
import { watchViewerZone } from '../lib/dates'
import { UndoToast } from './bulk/UndoToast'
import { TemplateDialogHost } from './TemplateDialogs'
import { setCurrentUserId } from '../lib/sharing'
import { type HelpSection, ShortcutHelp } from './ShortcutHelp'
import { useVimEnabled } from './vim/prefs'
import { closeHelp, useHelpRequest } from './help/store'
import { assistantStatus, openAssistant, refreshAssistantStatus, showLauncher, useAssistantOpen, useAssistantStatus } from '../lib/assistantStatus'

// Optional Vim layer (vim-keybindings): its own chunk, fetched only while the
// per-device switch is on, so the default bundle carries just this boundary.
const VimLayer = lazy(() => import('./vim/VimLayer'))
// In-app Help (user-documentation): the view, the panel and the guide text are
// chunks of their own, fetched when Help first opens (and precached for offline).
const HelpView = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpView })))
const HelpPanel = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpPanel })))
// In-app assistant (in-app-assistant D9): its own chunk, fetched on first open;
// the main bundle carries only the launcher, the shortcut and the status.
const AssistantRoot = lazy(() => import('./assistant/AssistantRoot'))
// Command palette (search-and-command-palette D1): its own chunk, fetched on first open.
const CommandPalette = lazy(() => import('./palette/CommandPalette'))

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
    // `?task=<id>` (a notification click, a shared link, a reload with the panel
    // open): at the root, show the task in its own list instead of the start view;
    // on any other page, reopen it in the panel there (app-shell).
    // Old and alias addresses (/activity, /calendar, earlier settings ids) are replaced in place.
    const canonical = canonicalPath(location.pathname)
    if (canonical && canonical !== location.pathname) history.replaceState(null, '', `${canonical}${location.search}`)
    const taskParam = taskIdFromAddress()
    if (taskParam) {
      if (location.pathname === '/') {
        history.replaceState(null, '', location.pathname)
        void db.tasks.get(taskParam).then((t) => t && openTaskInList(t))
      } else openTaskPanel(taskParam)
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
    // The panel belongs to the page that opened it (app-shell D1).
    closePanelIfStale(location.pathname)
  }, [route])

  // Whether the owner turned the assistant on for this account (cached offline).
  const assistant = useAssistantStatus()
  const assistantOpen = useAssistantOpen()
  const [assistantLoaded, setAssistantLoaded] = useState(false)
  useEffect(() => { if (assistantOpen) setAssistantLoaded(true) }, [assistantOpen])
  useEffect(() => {
    void refreshAssistantStatus()
    const onOnline = () => void refreshAssistantStatus()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Assignment rules (task-assignment) need the account id offline too.
  useEffect(() => {
    void setCurrentUserId(user.id)
  }, [user.id])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteLoaded, setPaletteLoaded] = useState(false)
  useEffect(() => {
    // Ctrl/⌘+K opens the palette from everywhere, also while typing in a field,
    // except in the notes editor, where it inserts a link (search-and-command-palette D1).
    function onPaletteKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return
      if ((e.target as HTMLElement | null)?.closest?.('[data-notes-editor], .ProseMirror')) return
      e.preventDefault()
      setPaletteLoaded(true)
      setPaletteOpen(true)
    }
    window.addEventListener('keydown', onPaletteKey)
    return () => window.removeEventListener('keydown', onPaletteKey)
  }, [])

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
        if (e.key === 'o') navigate({ view: 'someday' })
        if (e.key === 'n') navigate({ view: 'anytime' })
        if (e.key === 'c') navigate({ view: 'completed' })
        if (e.key === 'a') navigate({ view: 'assigned' })
        if (e.key === 'l') navigate({ view: 'labels' })
        if (e.key === 'v') navigate({ view: 'views' })
        if (e.key === 'd') navigate({ view: 'day' })
        if (e.key === 'w') navigate({ view: 'week' })
        if (e.key === 'm') navigate({ view: 'month' })
        if (e.key === 'f') {
          // The Filter view focuses its input on mount; keep this "f" out of it.
          e.preventDefault()
          navigate({ view: 'filter' })
        }
        if (e.key === 's') navigate({ view: 'settings' })
        if (e.key === 'x') navigate({ view: 'trash' })
        // `g f` is the Filter view, so the activity feed is `g h` (activity-feed).
        if (e.key === 'h') navigate({ view: 'feed' })
        // `g k`: the Ask screen (assistant-skills; `g a` is Assigned to me).
        if (e.key === 'k') navigate({ view: 'ask' })
        // `g i` is the Inbox, so Import is `g` then Shift+I.
        if (e.key === 'I') navigate({ view: 'import' })
        // `g` then `?` opens the Help view (user-documentation); `?` alone stays the shortcut list.
        if (e.key === '?') { e.preventDefault(); navigate({ view: 'help' }) }
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
      }
      // `[` collapses the sidebar to icons from 1024 px (app-shell "Resizable sidebar");
      // the calendar keeps `[` / `]` for its range until the shortcut registry lands.
      if (e.key === '[' && !/^\/(day|week|month)/.test(location.pathname) && !document.querySelector('[data-timeline]') && window.matchMedia?.('(min-width: 1024px)').matches) {
        e.preventDefault()
        toggleSidebarCollapsed()
      }
      // Shift+I opens the assistant (`g` then Shift+I stays Import, handled above).
      if (e.key === 'I' && showLauncher(assistantStatus())) {
        e.preventDefault()
        openAssistant()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [showHelp, setShowHelp] = useState(false)
  const sidebar = useSidebarLayout()
  const openPalette = () => { setPaletteLoaded(true); setPaletteOpen(true) }
  const vim = useVimEnabled()
  const [vimHelp, setVimHelp] = useState<HelpSection | null>(null)
  const helpRequest = useHelpRequest()

  return (
    <div className="flex h-full">
      {sidebarOpen && <div className="fixed inset-0 z-[45] bg-scrim md:hidden" onClick={() => setSidebarOpen(false)} />}
      {/* The sidebar column: a drawer below 768 px, a column from there, resizable and collapsible from 1024 px (app-shell). */}
      <aside data-sidebar data-sidebar-width={sidebar.collapsed ? 'collapsed' : sidebar.width}
        style={{ '--sidebar-w': `${sidebar.collapsed ? SIDEBAR_COLLAPSED_REM : sidebar.width}rem` } as React.CSSProperties}
        className={`fixed inset-y-0 left-0 z-[45] flex w-64 max-w-[85vw] transform border-r border-default bg-canvas pl-[env(safe-area-inset-left)] transition-transform md:static md:w-(--sidebar-w) md:max-w-none md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="min-w-0 flex-1">
          <Sidebar route={route} user={user} onSearch={openPalette} onShortcuts={() => setShowHelp(true)} onAssistant={showLauncher(assistant) ? openAssistant : undefined} collapsed={sidebar.collapsed} onToggleCollapse={toggleSidebarCollapsed} />
        </div>
        {!sidebar.collapsed && <SidebarResizer width={sidebar.width} />}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Below 768 px: the bar with the menu button, the page's title and its actions (app-shell "No desktop top bar"). */}
        <PhoneBar onMenu={() => setSidebarOpen(true)} />
        {notice && (
          <div role="status" className="flex items-start gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-sm text-on-warning-soft md:px-6">
            <p className="flex-1">{notice}</p>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        {rejected && (
          <div role="alert" className="flex items-start gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-sm text-on-warning-soft md:px-6">
            <p className="flex-1">{describeRejected(rejected)}. The server's values are shown again.</p>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={dismissRejected}>Dismiss</button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {route.view === 'help' ? (
            <Suspense fallback={<p className="px-4 py-6 text-sm text-muted" role="status">Loading help…</p>}><HelpView page={route.page} q={route.q} /></Suspense>
          ) : route.view === 'settings' ? (
            <SettingsView user={user} onLogout={onLogout} section={route.section} />
          ) : route.view === 'import' ? (
            <ImportScreen />
          ) : route.view === 'labels' ? (
            <LabelsView route={route} />
          ) : route.view === 'filter' ? (
            <FilterView key={route.q ?? ''} initialQuery={route.q} />
          ) : route.view === 'views' ? (
            <ViewsView />
          ) : route.view === 'view' ? (
            <SavedViewRoute id={route.id} />
          ) : route.view === 'trash' ? (
            <TrashView />
          ) : route.view === 'task' ? (
            <TaskPage id={route.id} user={user} />
          ) : route.view === 'feed' ? (
            <FeedView />
          ) : route.view === 'ask' ? (
            <AskScreen role={user.role} />
          ) : route.view === 'day' || route.view === 'week' ? (
            <CalendarView mode={route.view} date={route.date} />
          ) : route.view === 'month' ? (
            <MonthView date={route.date} />
          ) : (
            // App renders the invite, reset and capture screens itself; a stray /invite, /reset or /share route inside the shell falls back to the Inbox.
            <TaskListView userId={user.id} userRole={user.role} route={route.view === 'invite' || route.view === 'project-invite' || route.view === 'reset' || route.view === 'share' ? { view: 'inbox' } : route} />
          )}
        </div>
        {vim && (
          <Suspense fallback={null}>
            <VimLayer userId={user.id} onHelp={() => setShowHelp(true)} onHelpTopic={(q) => navigate({ view: 'help', q })} onHelpSection={setVimHelp} />
          </Suspense>
        )}
      </main>
      <PanelHost user={user} />
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} extraSections={vim && vimHelp ? [vimHelp] : []}
        context={{ view: route.view, board: !!listState()?.columns() || !!document.querySelector('[data-timeline]'), panelOpen: !!panelTaskId() }} />}
      {helpRequest && <Suspense fallback={null}><HelpPanel key={helpRequest.screen} screen={helpRequest.screen} trigger={helpRequest.trigger} onClose={closeHelp} /></Suspense>}
      {assistantLoaded && <Suspense fallback={null}><AssistantRoot context={() => ({ view: route.view })} /></Suspense>}
      {paletteLoaded && paletteOpen && <Suspense fallback={null}><CommandPalette user={user} onClose={() => setPaletteOpen(false)} showShortcuts={() => setShowHelp(true)} /></Suspense>}
      <ReminderToasts />
      <UndoToast />
      <TemplateDialogHost />
      <ArchivePrompt />
    </div>
  )
}

/** The sidebar's drag edge (app-shell "Resizable sidebar"): 15 to 22.5 rem, per device; arrows resize it from the keyboard. */
function SidebarResizer({ width }: { width: number }) {
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null)
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={SIDEBAR_MIN_REM} aria-valuemax={SIDEBAR_MAX_REM} aria-valuenow={width}
      tabIndex={0} data-sidebar-resizer
      className="hidden w-1 shrink-0 cursor-col-resize self-stretch hover:bg-accent/40 focus-visible:bg-accent focus-visible:outline-none lg:block"
      onPointerDown={(e) => {
        dragging.current = { startX: e.clientX, startWidth: width }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = dragging.current
        if (d) setSidebarWidth(d.startWidth + (e.clientX - d.startX) / rem())
      }}
      onPointerUp={() => { dragging.current = null }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSidebarWidth(width + (e.key === 'ArrowRight' ? 0.5 : -0.5)) }
        if (e.key === 'Home') { e.preventDefault(); setSidebarWidth(SIDEBAR_MIN_REM) }
        if (e.key === 'End') { e.preventDefault(); setSidebarWidth(SIDEBAR_MAX_REM) }
      }} />
  )
}

/** Below 768 px: the menu button, the page's title and its actions (app-shell "No desktop top bar"), from the page-bar store. */
function PhoneBar({ onMenu }: { onMenu: () => void }) {
  const bar = usePageBar()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  if (desktop) return null
  return (
    <header className="flex min-h-12 items-center gap-1 border-b border-default px-2 pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] md:hidden" data-phone-bar>
      <IconButton icon="menu" label="Open menu" onClick={onMenu} className="touch-target" />
      {bar?.back && <IconButton icon="arrow-left" label={bar.back.label} onClick={bar.back.onClick} className="touch-target" data-page-back />}
      <PageBarTitle>{bar?.title}</PageBarTitle>
      <div className="flex shrink-0 items-center gap-1" data-page-actions>
        {bar && <PageActions overflow={bar.overflow} menu={bar.menu} help={bar.help} />}
      </div>
    </header>
  )
}
