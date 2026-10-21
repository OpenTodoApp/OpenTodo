import { DESKTOP_HEADER_QUERY, IconButton, PageActions, PageBarTitle, useMediaQuery, usePageBar, useOverlayDepth } from '../ui'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { User } from '../lib/types'
import { resolveStartView } from '../lib/views'
import { describeRejected } from '../lib/sharing'
import { dismissRejected, useSyncStatus } from '../lib/sync'
import { canonicalPath, navigate, parseRoute, useRoute } from './router'
import { SIDEBAR_COLLAPSED_REM, SIDEBAR_MAX_REM, SIDEBAR_MIN_REM, setSidebarCollapsed, setSidebarWidth, toggleSidebarCollapsed, useSidebarLayout } from './sidebarLayout'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { FilterView } from './FilterView'
import { LabelsView } from './LabelsView'
import { PlacesView } from './locations/PlacesView'
import { ProjectsView } from './ProjectsView'
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
import { WelcomeDialog } from './WelcomeDialog'
import { ArchivePrompt } from './ArchivePrompt'
import { sidebarFind, openTaskInList } from './signals'
import { hasScope, useShortcutDispatcher, useShortcutScope } from './shortcuts'
import { closePanelIfStale, openTaskPanel, panelTaskId, taskIdFromAddress, usePanel } from './panel'
import { AddButton, TAB_BAR_HEIGHT_REM, TabBar } from './TabBar'
import { onQuickAddSheetRequest, QuickAddSheet } from './QuickAddSheet'
import { PanelHost } from './PanelHost'
import { TaskPage } from './TaskPage'
import { getTask } from '../lib/localData'
import { watchViewerZone } from '../lib/dates'
import { UndoToast } from './bulk/UndoToast'
import { DailyCheckToast } from './method/DailyCheckToast'
import { PanelBoundary } from './PanelBoundary'
import { TemplateDialogHost } from './TemplateDialogs'
import { setCurrentUserId } from '../lib/sharing'
import { type HelpSection, ShortcutHelp } from './ShortcutHelp'
import { Spotlight } from './shortcuts/Spotlight'
import { useVimEnabled } from './vim/prefs'
import { closeHelp, useHelpRequest } from '../lib/helpRequest'
import { assistantStatus, openAssistant, refreshAssistantStatus, showLauncher, useAssistantOpen, useAssistantStatus } from '../lib/assistantStatus'
import { t } from '../lib/i18n'
import { useRunningRepair } from '../lib/timeEntries'
import { TrackingPill } from './TrackingIndicator'
import { BreakReminder } from './focus/BreakReminder'
import { SkipLink, usePageFocus } from './pageFocus'

// Optional Vim layer (vim-keybindings): its own chunk, fetched only while the
// per-device switch is on, so the default bundle carries just this boundary.
const VimLayer = lazy(() => import('./vim/VimLayer'))
const TriageView = lazy(() => import('./TriageView').then((m) => ({ default: m.TriageView })))
// In-app Help (user-documentation): the view, the panel and the guide text are
// chunks of their own, fetched when Help first opens (and precached for offline).
const HelpView = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpView })))
const HelpPanel = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpPanel })))
// In-app assistant (in-app-assistant D9): its own chunk, fetched on first open;
// the main bundle carries only the launcher, the shortcut and the status.
const AssistantRoot = lazy(() => import('./assistant/AssistantRoot'))
// Command palette (search-and-command-palette D1): its own chunk, fetched on first open.
const CommandPalette = lazy(() => import('./palette/CommandPalette'))
// Weekly review and Statistics (stats-and-review D8): one chunk, fetched on first open.
const ReviewView = lazy(() => import('./review/ReviewBundle').then((m) => ({ default: m.ReviewView })))
const StatsView = lazy(() => import('./review/ReviewBundle').then((m) => ({ default: m.StatsView })))
const DailyCheck = lazy(() => import('./review/ReviewBundle').then((m) => ({ default: m.DailyCheck })))
const MonthlyLook = lazy(() => import('./review/ReviewBundle').then((m) => ({ default: m.MonthlyLook })))
const CloseDay = lazy(() => import('./review/ReviewBundle').then((m) => ({ default: m.CloseDay })))
const NextView = lazy(() => import('./method/MethodListView').then((m) => ({ default: m.NextView })))
const WaitingView = lazy(() => import('./method/MethodListView').then((m) => ({ default: m.WaitingView })))
// Focus (focus-mode D6): its own chunk; the engine that ends a session on time is the break reminder, always mounted.
const FocusView = lazy(() => import('./focus/FocusView').then((m) => ({ default: m.FocusView })))
const LoopHome = lazy(() => import('./method/LoopHome').then((m) => ({ default: m.LoopHome })))
// The start guide (lean-chrome D5): its own chunk; it opens over the Inbox once per account, or from Settings.
const FirstRunGuide = lazy(() => import('./FirstRun').then((m) => ({ default: m.FirstRunGuide })))

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // A find request (the shortcut, the palette) needs the sidebar on screen: the icon rail expands and the phone drawer opens.
  useEffect(() => sidebarFind.subscribe((id) => { if (id === 'open') { setSidebarCollapsed(false); setSidebarOpen(true) } }), [])
  const [notice, setNotice] = useState<string | null>(null)
  // Changes the server refused after a role change (project-sharing).
  const { rejected } = useSyncStatus()

  // A travelling device: re-read the time zone whenever the app becomes visible
  // (absolute-datetimes), so zoned dues re-render in the new zone.
  useEffect(() => watchViewerZone(), [])
  // Two devices started tracking while offline: keep one running entry (time-tracking D2).
  useRunningRepair()

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
        void getTask(taskParam).then((task) => task && openTaskInList(task))
      } else openTaskPanel(taskParam)
      return
    }
    if (location.pathname !== '/') return
    let cancelled = false
    void resolveStartView().then((start) => {
      if (cancelled || location.pathname !== '/') return
      if (start.kind === 'saved') navigate({ view: 'view', id: start.id }, { replace: true })
      // A display start view (display-mode D6): the app renders the display instead of the shell.
      else if (start.kind === 'display') navigate(parseRoute(start.path), { replace: true })
      else {
        if (start.view !== 'inbox') navigate({ view: start.view }, { replace: true })
        if (start.removed) setNotice(t('Your start view was deleted, so the Inbox opened instead.'))
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
  const [showHelp, setShowHelp] = useState(false)
  // Phone navigation (app-shell): the tab bar and the add button hide while a sheet or the panel is open.
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => onQuickAddSheetRequest(() => setAddOpen(true)), [])
  const addButton = useRef<HTMLButtonElement>(null)
  const sheetOpen = useOverlayDepth() > 0
  const panelOpen = !!usePanel()
  const phoneChrome = !sheetOpen && !panelOpen && !['share', 'invite', 'project-invite', 'reset'].includes(route.view)
  // The one keydown listener (keyboard-shortcuts "One shortcut registry with
  // scopes"); the shell owns the `global` scope: the palette, `g` navigation, the
  // cheat sheet, the sidebar toggle and the assistant.
  useShortcutDispatcher()
  const go = (r: Parameters<typeof navigate>[0]) => () => navigate(r)
  useShortcutScope('global', {
    'global.palette': (e) => {
      // Ctrl/⌘+K opens the palette from everywhere, also while typing in a field,
      // except in the notes editor, where it inserts a link (search-and-command-palette D1).
      if ((e.target as HTMLElement | null)?.closest?.('[data-notes-editor], .ProseMirror')) return false
      setPaletteLoaded(true)
      setPaletteOpen(true)
    },
    'go.inbox': go({ view: 'inbox' }), 'go.today': go({ view: 'today' }), 'go.upcoming': go({ view: 'upcoming' }), 'go.someday': go({ view: 'someday' }),
    'go.anytime': go({ view: 'anytime' }), 'go.completed': go({ view: 'completed' }), 'go.assigned': go({ view: 'assigned' }), 'go.labels': go({ view: 'labels' }), 'go.projects': go({ view: 'projects' }),
    'go.views': go({ view: 'views' }), 'go.day': go({ view: 'day' }), 'go.week': go({ view: 'week' }), 'go.month': go({ view: 'month' }), 'go.plan': go({ view: 'plan' }), 'go.filter': go({ view: 'filter' }), 'go.settings': go({ view: 'settings' }),
    'go.trash': go({ view: 'trash' }), 'go.triage': go({ view: 'triage' }), 'go.feed': go({ view: 'feed' }), 'go.ask': go({ view: 'ask' }), 'go.import': go({ view: 'import' }), 'go.help': go({ view: 'help' }),
    // Weekly review and Statistics (stats-and-review).
    'go.review': go({ view: 'review' }), 'go.stats': go({ view: 'stats' }), 'go.next': go({ view: 'next' }), 'go.waiting': go({ view: 'waiting' }), 'go.daily': go({ view: 'review', step: 'daily' }), 'go.loop': go({ view: 'loop' }),
    'go.focus': go({ view: 'focus' }), 'go.close': go({ view: 'review', step: 'close' }),
    // `g /` (sidebar-groups): the sidebar's find field; the rail expands and the drawer opens first.
    'go.find': () => sidebarFind.request('open'),
    'global.help': () => setShowHelp((v) => !v),
    // `[` collapses the sidebar to icons from 1024 px (app-shell "Resizable sidebar"); the calendar's and the timeline's own `[` win there.
    'global.sidebar': () => {
      if (!window.matchMedia?.('(min-width: 1024px)').matches) return false
      toggleSidebarCollapsed()
    },
    'global.assistant': () => {
      if (!showLauncher(assistantStatus())) return false
      openAssistant()
    },
  })

  const sidebar = useSidebarLayout()
  const openPalette = () => { setPaletteLoaded(true); setPaletteOpen(true) }
  const vim = useVimEnabled()
  const [vimHelp, setVimHelp] = useState<HelpSection | null>(null)
  const helpRequest = useHelpRequest()
  // Page changes are announced (assistive-tech-semantics): the tab title names the
  // page and a navigation moves focus to its heading; the skip link jumps there too.
  const frame = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  usePageFocus(route, frame, content)

  return (
    <div className="flex h-full">
      <SkipLink frame={frame} content={content} />
      {/* touch-none: a swipe on the scrim does not scroll the page behind the open drawer (sidebar-drawer-scroll). */}
      {sidebarOpen && <div className="fixed inset-0 z-[45] touch-none bg-scrim md:hidden" onClick={() => setSidebarOpen(false)} />}
      {/* The sidebar column: a drawer below 768 px, a column from there, resizable and collapsible from 1024 px (app-shell). */}
      <aside data-sidebar data-sidebar-width={sidebar.collapsed ? 'collapsed' : sidebar.width}
        style={{ '--sidebar-w': `${sidebar.collapsed ? SIDEBAR_COLLAPSED_REM : sidebar.width}rem` } as React.CSSProperties}
        className={`fixed inset-y-0 left-0 z-[45] flex w-64 max-w-[85vw] transform border-r border-default bg-canvas pl-[env(safe-area-inset-left)] transition-transform md:static md:w-(--sidebar-w) md:max-w-none md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="min-w-0 flex-1">
          <Sidebar route={route} user={user} onSearch={openPalette} onShortcuts={() => setShowHelp(true)} onSignOut={onLogout} onAssistant={showLauncher(assistant) ? openAssistant : undefined} collapsed={sidebar.collapsed} onToggleCollapse={toggleSidebarCollapsed} />
        </div>
        {!sidebar.collapsed && <SidebarResizer width={sidebar.width} />}
      </aside>
      <main ref={frame} className="flex min-w-0 flex-1 flex-col md:!pb-0" data-app-frame data-phone-chrome={phoneChrome || undefined}
        style={phoneChrome ? { paddingBottom: `calc(${TAB_BAR_HEIGHT_REM}rem + env(safe-area-inset-bottom))` } : undefined}>
        {/* Below 768 px: the bar with the menu button, the page's title and its actions (app-shell "No desktop top bar"). */}
        <PhoneBar onMenu={() => setSidebarOpen(true)} />
        {notice && (
          <div role="status" className="flex items-start gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft md:px-6">
            <p className="flex-1">{notice}</p>
            <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => setNotice(null)}>{t('Dismiss')}</button>
          </div>
        )}
        {rejected && (
          <div role="alert" className="flex items-start gap-2 border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft md:px-6">
            <p className="flex-1">{t('{rejected}. The server\'s values are shown again.', { rejected: describeRejected(rejected) })}</p>
            <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={dismissRejected}>{t('Dismiss')}</button>
          </div>
        )}
        {/* relative: the containing block of absolutely positioned content (every
            .sr-only label), which would otherwise be the page and stretch the
            document below the frame (issue #95). */}
        <div ref={content} id="content" className={`relative min-h-0 flex-1 overflow-y-auto ${sidebarOpen ? 'max-md:overflow-hidden' : ''}`}>
          {/* One screen failing (a render bug, a chunk gone after an upgrade) leaves the shell usable (client-sync-robustness). */}
          <PanelBoundary resetKey={route}>
          {route.view === 'help' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading help…')}</p>}><HelpView page={route.page} q={route.q} /></Suspense>
          ) : route.view === 'settings' ? (
            <SettingsView user={user} onLogout={onLogout} section={route.section} anchor={route.anchor} />
          ) : route.view === 'import' ? (
            <ImportScreen />
          ) : route.view === 'labels' ? (
            <LabelsView route={route} />
          ) : route.view === 'places' ? (
            <PlacesView />
          ) : route.view === 'projects' ? (
            <ProjectsView archived={route.archived} />
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
          ) : route.view === 'review' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading the review…')}</p>}>
              {route.step === 'daily' ? <DailyCheck /> : route.step === 'monthly' ? <MonthlyLook /> : route.step === 'close' ? <CloseDay /> : <ReviewView key={route.step ?? ''} userId={user.id} step={route.step} />}
            </Suspense>
          ) : route.view === 'next' ? (
            <Suspense fallback={null}><NextView /></Suspense>
          ) : route.view === 'waiting' ? (
            <Suspense fallback={null}><WaitingView /></Suspense>
          ) : route.view === 'loop' ? (
            <Suspense fallback={null}><LoopHome /></Suspense>
          ) : route.view === 'stats' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading statistics…')}</p>}><StatsView /></Suspense>
          ) : route.view === 'focus' ? (
            <Suspense fallback={null}><FocusView id={route.id} /></Suspense>
          ) : route.view === 'triage' ? (
            <Suspense fallback={null}><TriageView /></Suspense>
          ) : route.view === 'feed' ? (
            <FeedView />
          ) : route.view === 'ask' ? (
            <AskScreen role={user.role} />
          ) : route.view === 'day' || route.view === 'week' ? (
            <CalendarView mode={route.view} date={route.date} />
          ) : route.view === 'month' ? (
            <MonthView date={route.date} />
          ) : route.view === 'plan' ? (
            <PlanView date={route.date} />
          ) : (
            // App renders the invite, reset, capture and display screens itself; a stray /invite, /reset, /share or /display route inside the shell falls back to the Inbox.
            <TaskListView userId={user.id} userRole={user.role} route={route.view === 'invite' || route.view === 'project-invite' || route.view === 'reset' || route.view === 'forgot' || route.view === 'verify' || route.view === 'public' || route.view === 'share' || route.view === 'display' ? { view: 'inbox' } : route} />
          )}
          </PanelBoundary>
        </div>
        {vim && (
          <PanelBoundary>
            <Suspense fallback={null}>
              <VimLayer userId={user.id} onHelp={() => setShowHelp(true)} onHelpTopic={(q) => navigate({ view: 'help', q })} onHelpSection={setVimHelp} />
            </Suspense>
          </PanelBoundary>
        )}
      </main>
      <PanelBoundary><PanelHost user={user} /></PanelBoundary>
      {phoneChrome && <TabBar route={route} onSearch={openPalette} onMore={() => setSidebarOpen(true)} moreOpen={sidebarOpen} />}
      {(phoneChrome || addOpen) && <AddButton ref={addButton} open={addOpen} onClick={() => setAddOpen((v) => !v)} />}
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} anchor={addButton} route={route} userId={user.id} />
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} vim={vim} extraSections={vim && vimHelp ? [vimHelp] : []}
        context={{ view: route.view, board: hasScope('board') || hasScope('timeline'), panelOpen: hasScope('panel') || !!panelTaskId() }} />}
      {helpRequest && <PanelBoundary><Suspense fallback={null}><HelpPanel key={helpRequest.screen} screen={helpRequest.screen} trigger={helpRequest.trigger} onClose={closeHelp} /></Suspense></PanelBoundary>}
      {assistantLoaded && <PanelBoundary><Suspense fallback={null}><AssistantRoot context={() => ({ view: route.view })} /></Suspense></PanelBoundary>}
      {paletteLoaded && paletteOpen && <PanelBoundary resetKey={paletteOpen}><Suspense fallback={null}><CommandPalette user={user} onClose={() => setPaletteOpen(false)} showShortcuts={() => setShowHelp(true)} /></Suspense></PanelBoundary>}
      {/* The owner's one-time thank-you on a new server (welcome-note). */}
      <WelcomeDialog user={user} />
      {/* The start guide after it (first-run "Three-step first run"); never a row of the list. */}
      <PanelBoundary><Suspense fallback={null}><FirstRunGuide user={user} /></Suspense></PanelBoundary>
      {/* The g … spotlight (shortcut-spotlight): shown after a hesitation, never focused. */}
      <Spotlight />
      <ReminderToasts />
      <BreakReminder />
      <UndoToast />
      <DailyCheckToast />
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
    <div role="separator" aria-orientation="vertical" aria-label={t('Resize sidebar')} aria-valuemin={SIDEBAR_MIN_REM} aria-valuemax={SIDEBAR_MAX_REM} aria-valuenow={width}
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
      <IconButton icon="menu" label={t('Open menu')} onClick={onMenu} className="touch-target" />
      {bar?.back && <IconButton icon="arrow-left" label={bar.back.label} onClick={bar.back.onClick} className="touch-target" data-page-back />}
      <div className="min-w-0 flex-1">
        <PageBarTitle>{bar?.title}</PageBarTitle>
        {bar?.subtitle && <p className="truncate text-meta text-muted" data-phone-subtitle>{bar.subtitle}</p>}
      </div>
      <TrackingPill />
      <div className="flex shrink-0 items-center gap-1" data-page-actions>
        {bar && <PageActions overflow={bar.overflow} menu={bar.menu} help={bar.help} />}
      </div>
    </header>
  )
}
