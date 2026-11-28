import { useFeatures } from '../lib/features'
import { removeItem } from '../lib/deviceStorage'
import { ROUTE_FEATURES } from './screens'
import { useHabitsEnabled } from '../lib/habitPrefs'
import { resettable } from '../lib/moduleState'
import { useHabitForm } from './habits/habitFormStore'
import { DESKTOP_HEADER_QUERY, IconButton, PageActions, PageBarTitle, Skeleton, TruncatedText, trapTab, useMediaQuery, useOverlay, pageBar, usePageBar, useOverlayDepth } from '../ui'
import { useCommandBar } from './palette/useCommandBar'
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { lazy, preloadable } from '../lib/lazy'
import type { User } from '../lib/types'
import { openStartView } from './startView'
import { describeRejected } from '../lib/sharing'
import { useSyncStatus } from '../lib/sync'
import { canonicalPath, navigate, offersQuickAdd, useRoute } from './router'
import { useProjectViewMode } from '../lib/liveData'
import type { ListRoute } from './task-list/useListModel'
import { SIDEBAR_COLLAPSED_REM, SIDEBAR_DEFAULT_REM, SIDEBAR_MAX_REM, SIDEBAR_MIN_REM, setSidebarCollapsed, setSidebarWidth } from './sidebarLayout'
import { LabelsView } from './LabelsView'
import { ViewsView } from './ViewsView'
import { Sidebar } from './Sidebar'
import { preloadTimeline, TaskListView } from './TaskListView'
import { AskScreen } from './assistant/AskEntry'
import { ReminderToasts } from './ReminderToasts'
import { WorkspaceHost } from './NewWorkspaceDialog'
import { AppLinkConfirm } from './AppLinkConfirm'
import { FramesHost } from './calendar/framesRequest'
import { FocusPickerHost } from './focus/focusRequest'
import { useConsentPending } from './OAuthConsentHost'
import { WelcomeDialog } from './WelcomeDialog'
import { ArchivePrompt } from './ArchivePrompt'
import { notificationsOpen, sidebarFind } from './signals'
import { hasScope, useShortcutDispatcher, useShortcutScope } from './shortcuts'
import { closePanelIfStale, panelTaskId, usePanel, usePanelCovering } from './panel'
import { currentAddress, openTaskPage, settleTrail } from './taskTrail'
import { AddButton, TAB_BAR_ROOM, TabBar } from './TabBar'
import { PHONE_BAR_FRAME, PHONE_BAR_LINE, hasPhoneChrome } from './phoneFrame'
import { usePhoneOwnBar } from '../phone/chrome'
import { usePhoneChrome } from './useScrollDirection'
import { onQuickAddSheetRequest, QuickAddSheet, requestQuickAddSheet } from './QuickAddSheet'
import { PanelHost } from './PanelHost'
import { useRoomFold } from './useRoomFold'
import { TaskPage } from './TaskPage'
import { logicalToday, watchViewerZone } from '../lib/dates'
import { useUserPrefsRow } from '../lib/localData'
import { ActionToasts } from './ActionToasts'
import { showActionToast } from './bulk/toastStore'
import { DailyCheckToast } from './method/DailyCheckToast'
import { PanelBoundary } from './PanelBoundary'
import { setCurrentUserId } from '../lib/sharing'
import type { HelpSection } from './ShortcutHelp'
import { TemplateDialogHost } from './TemplateDialogHost'
import { preloadProjectMenu } from './menus/useProjectMenu'
import { FeedbackHost } from './FeedbackHost'
import { openFeedback } from '../lib/feedbackRequest'
import { Spotlight } from './shortcuts/Spotlight'
import { useVimEnabled } from './vim/prefs'
import { closeHelp, useHelpRequest } from '../lib/helpRequest'
import { closeConnections, useConnectionsRequest } from './signals'
import { assistantStatus, openAssistant, refreshAssistantStatus, showLauncher, useAssistantOpen, useAssistantStatus } from '../lib/assistantStatus'
import { t } from '../lib/i18n'
import { handleShellUrl } from '../lib/shellActions'
import { useRunningRepair } from '../lib/timeEntries'
import { TrackingPill } from './TrackingIndicator'
import { BreakReminder } from './focus/BreakReminder'
import { SkipLink, usePageFocus } from './pageFocus'
import { useDuplicateCollapse } from '../lib/duplicateCollapse'
import { inlineDelta, inlineKey } from '../lib/direction'

// A page of a feature the workspace has off (workspace-feature-switches D4), loaded when one is opened.
const FeatureOff = lazy(() => import('./FeatureOff'))
// Optional Vim layer (vim-keybindings): its own chunk, fetched only while the
// per-device switch is on, so the default bundle carries just this boundary.
const VimLayer = lazy(() => import('./vim/VimLayer'))
const WorkspaceActivity = lazy(() => import('./WorkspaceActivity'))
// The phone UI's screens (phone-ui-trial D2): their own chunks, fetched only below 768 px.
const PhoneChrome = lazy(() => import('../phone/PhoneChrome').then((m) => ({ default: m.PhoneChrome })))
const PhoneList = lazy(() => import('../phone/screens/PhoneList').then((m) => ({ default: m.PhoneList })))
const PhoneTaskPage = lazy(() => import('../phone/screens/PhoneTaskPage').then((m) => ({ default: m.PhoneTaskPage })))
// The Habits screen drawn for the phone (habits-complete D1): its chunk loads only below 768 px.
const PhoneHabits = lazy(() => import('../phone/screens/PhoneHabits').then((m) => ({ default: m.PhoneHabits })))
/** A task list: the phone UI's list below 768 px (phone-lists D7); a project in another layout keeps the present screen. */
function ListScreen({ route, user, phoneUi, onMenu }: { route: ListRoute; user: User; phoneUi: boolean; onMenu: () => void }) {
  const layout = useProjectViewMode(phoneUi && route.view === 'project' ? route.id : null)
  if (!phoneUi || layout !== 'list') return <TaskListView userId={user.id} userRole={user.role} route={route} />
  return <Suspense fallback={null}><PhoneList route={route} userId={user.id} userRole={user.role} onMenu={onMenu} /></Suspense>
}
/** The phone UI around the screens below 768 px (phone-all-screens): every page's header is the phone's. */
function PhoneOr({ on, onMenu, children }: { on: boolean; onMenu: () => void; children: ReactNode }) {
  // Its chunk is fetched only below 768 px; the screens mount once it is here.
  return on ? <Suspense fallback={null}><PhoneChrome onMenu={onMenu}>{children}</PhoneChrome></Suspense> : <>{children}</>
}
/** Whether the phone UI's screens are shown: the window is a phone's, narrower than 768 px (phone-ui-only). */
function usePhoneUi(): boolean {
  // What the "New phone screens" switch stored: the switch is gone and nothing reads it, so it leaves the device (phone-ui-only D2).
  useEffect(() => removeItem('opentodo.phoneUi'), [])
  return !useMediaQuery(DESKTOP_HEADER_QUERY)
}
// Pull to sync (pull-to-sync): the gesture and its mark load only on a touch device, where a pull is possible; a mouse
// or a trackpad never loads them, and a chunk that is gone just leaves the gesture out.
type Scroller = { scroller: RefObject<HTMLElement | null> }
const PullToSync = lazy((): Promise<{ default: ComponentType<Scroller> }> => import('./PullToSync').catch(() => ({ default: () => null })))
function PullHost({ scroller }: Scroller) {
  return useMediaQuery('(pointer: coarse)') ? <Suspense fallback={null}><PullToSync scroller={scroller} /></Suspense> : null
}
// Plan, the calendar's least used mode, loads on first use (multi-day-tasks kept the first load in its budget).
const PlanView = lazy(() => import('./PlanView').then((m) => ({ default: m.PlanView })))
// Month, Quarter and Year load on first use too (year-view, quarter-view-and-plan-spans): several months and the year's grids stay off the first load.
const MonthView = lazy(() => import('./MonthView').then((m) => ({ default: m.MonthView })))
const QuarterView = lazy(() => import('./QuarterView'))
const YearView = lazy(() => import('./YearView'))
const TriageView = lazy(() => import('./TriageView').then((m) => ({ default: m.TriageView })))
// In-app Help (user-documentation): the view, the panel and the guide text are
// chunks of their own, fetched when Help first opens (and precached for offline).
// Routines (routines-editor): the page, the editor and the runs are one chunk.
const ThemeEditorPage = lazy(() => import('./themes/ThemeEditor').then((m) => ({ default: m.ThemeEditorPage })))
const RoutinesView = lazy(() => import('./routines/RoutinesView').then((m) => ({ default: m.RoutinesView })))
// The routine editor page (routines-editor-page D1): /routines/new and /routines/<id>.
const RoutinePage = lazy(() => import('./routines/RoutinePage').then((m) => ({ default: m.RoutinePage })))
const HelpView = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpView })))
const HelpPanel = lazy(() => import('./help/HelpBundle').then((m) => ({ default: m.HelpPanel })))
// In-app assistant (in-app-assistant D9): its own chunk, fetched on first open;
// the main bundle carries only the launcher, the shortcut and the status.
const AssistantRoot = lazy(() => import('./assistant/AssistantRoot'))
// Command palette (search-and-command-palette D1): its own chunk, fetched on first open.
const CommandPalette = lazy(() => import('./palette/CommandPalette'))
// Its search index, prepared in idle moments before the first open (list-rendering-at-scale D6).
const PaletteWarmer = lazy(() => import('./palette/PaletteWarmer'))
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
// Notes (notes-overview D7): the page, its search and the note panel are one chunk, fetched on first visit.
const NotesPage = lazy(() => import('./notes/NotesPage'))
const LoopHome = lazy(() => import('./method/LoopHome').then((m) => ({ default: m.LoopHome })))
// The start guide (lean-chrome D5): its own chunk; it opens over the Inbox once per account, or from Settings.
const FirstRunGuide = lazy(() => import('./FirstRun').then((m) => ({ default: m.FirstRunGuide })))
// Habits (habits-home D9): the screen and the New habit form load on first use.
const HabitsScreen = lazy(() => import('./habits/HabitsScreen'))
const HabitFormHost = lazy(() => import('./habits/HabitForm'))
// Calendar, Settings and Import are not on the Inbox's first screen: each loads on first visit.
const CalendarView = lazy(() => import('./CalendarView').then((m) => ({ default: m.CalendarView })))
const SettingsView = lazy(() => import('./SettingsView').then((m) => ({ default: m.SettingsView })))
// Loaded once the app is idle, and then rendered without Suspense: a lazy component suspends on
// its first render even when its chunk is in, and React 19 holds a revealed boundary ~300 ms.
let savedViewModule: typeof import('./SavedViewView') | undefined
const loadSavedView = () => import('./SavedViewView').then((m) => (savedViewModule = m))
resettable('shell.savedView', () => { savedViewModule = undefined })
const LazySavedViewRoute = lazy(() => loadSavedView().then((m) => ({ default: m.SavedViewRoute })))
function SavedViewRoute({ id }: { id: string }) {
  const Loaded = savedViewModule?.SavedViewRoute
  return Loaded ? <Loaded id={id} /> : <Suspense fallback={SCREEN_LOADING}><LazySavedViewRoute id={id} /></Suspense>
}
/**
 * Runs `load` once the browser is idle after the shell mounts (within 5 s at the latest). A load
 * that fails (offline, a new release, the page leaving) is dropped: the route loads it again.
 */
function useIdleLoad(load: () => Promise<unknown>) {
  useEffect(() => {
    const run = () => { load().catch(() => {}) }
    if (typeof requestIdleCallback !== 'function') { const h = setTimeout(run, 2000); return () => clearTimeout(h) }
    const h = requestIdleCallback(run, { timeout: 5000 })
    return () => cancelIdleCallback(h)
  }, [load])
}
// Screens and dialogs off the Inbox's first screen: fetched once the app is idle, so a
// shortcut or a click opens them at once, with the rows skeleton until then.
const FilterView = preloadable(() => import('./FilterView').then((m) => ({ default: m.FilterView })))
const PlacesView = preloadable(() => import('./locations/PlacesView').then((m) => ({ default: m.PlacesView })))
const ProjectsView = preloadable(() => import('./ProjectsView').then((m) => ({ default: m.ProjectsView })))
const TrashView = preloadable(() => import('./TrashView').then((m) => ({ default: m.TrashView })))
const FeedView = preloadable(() => import('./FeedView').then((m) => ({ default: m.FeedView })))
const ShortcutHelp = preloadable(() => import('./ShortcutHelp').then((m) => ({ default: m.ShortcutHelp })))
const preloadScreens = () => Promise.all([loadSavedView(), FilterView.preload(), PlacesView.preload(), ProjectsView.preload(), TrashView.preload(), FeedView.preload(), ShortcutHelp.preload(), preloadProjectMenu(), preloadTimeline()])
const ImportScreen = lazy(() => import('./ImportScreen').then((m) => ({ default: m.ImportScreen })))

/** Shown while a screen's chunk is fetched: the page's rows, as the other screens do. */
const SCREEN_LOADING = <div className="px-4 py-6"><Skeleton shape="row" count={4} /></div>

/** Requests that need the sidebar on screen: the phone drawer opens, and for a find the icon rail expands. */
function useSidebarRequests(setSidebarOpen: (open: boolean) => void) {
  // A find request (the shortcut, the palette): the icon rail expands and the phone drawer opens.
  useEffect(() => sidebarFind.subscribe((id) => { if (id === 'open') { setSidebarCollapsed(false); setSidebarOpen(true) } }), [setSidebarOpen])
  // The briefing's replies open the bell's list (briefing-links D2): on a phone it sits in the drawer.
  useEffect(() => notificationsOpen.subscribe(() => { if (!window.matchMedia?.('(min-width: 48rem)').matches) setSidebarOpen(true) }), [setSidebarOpen])
}

/** The phone drawer (phone-v2): below 768 px it is an overlay when open and inert when closed; from there the sidebar is a column. */
function usePhoneDrawer(sidebarOpen: boolean) {
  const column = useMediaQuery(DESKTOP_HEADER_QUERY)
  const drawer = useRef<HTMLElement>(null)
  const open = sidebarOpen && !column, closed = !column && !sidebarOpen
  // The aside's own props: aria-hidden next to inert on purpose, so assistive technology without inert support
  // still skips the closed drawer; open, Tab stays inside it.
  const aside = {
    ref: drawer, inert: closed || undefined, 'aria-hidden': closed || undefined,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (open) trapTab(e, e.currentTarget) },
  }
  return { drawer, open, closed, aside }
}

/** The command bar when open, and its search index prepared before (list-rendering-at-scale D6). */
function CommandBar({ palette, user, showShortcuts }: { palette: ReturnType<typeof useCommandBar>; user: User; showShortcuts: () => void }) {
  return (
    <>
      {palette.warm && <PanelBoundary><Suspense fallback={null}><PaletteWarmer user={user} onDone={palette.warmed} /></Suspense></PanelBoundary>}
      {palette.loaded && palette.open && <PanelBoundary resetKey={palette.open}><Suspense fallback={null}><CommandPalette user={user} initialMode={palette.mode} logWin={palette.win} onClose={palette.close} showShortcuts={showShortcuts} /></Suspense></PanelBoundary>}
    </>
  )
}

/**
 * `?task=`, `?note=` and `?project=<id>` in the address (a notification, a link in a
 * note, note-links D7): the item opens and the parameter goes. True when one did.
 */
function openAddressItem(): boolean {
  const params = new URLSearchParams(location.search)
  for (const kind of ['task', 'note', 'project'] as const) {
    const id = params.get(kind)
    if (!id) continue
    params.delete(kind)
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''))
    if (kind === 'task') openTaskPage(id)
    else navigate(kind === 'note' ? { view: 'notes', id } : { view: 'project', id }, { replace: true })
    return true
  }
  return false
}

/** Below 768 px the floating tab bar's room is the scroller's own padding, not the frame's, so the list runs on under the bar (phone-modern-look D1). */
function scrollerRoom(phoneChrome: boolean, addRoom: boolean): CSSProperties | undefined {
  return phoneChrome ? { paddingBottom: addRoom ? `calc(${TAB_BAR_ROOM} + var(--add-room))` : TAB_BAR_ROOM } : undefined
}

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const route = useRoute()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const drawer = usePhoneDrawer(sidebarOpen)
  useSidebarRequests(setSidebarOpen)
  useIdleLoad(preloadScreens)
  // A right swipe from the left edge opens the closed phone menu, unless a dialog is open (edge-swipe-menu).
  const drawerClosed = useRef(drawer.closed)
  drawerClosed.current = drawer.closed
  // A page with Back goes back, at any width (swipe-back-follows: a tablet too), a top-level page below 768 px opens the menu (edge-swipe-back); the installed web app on iOS keeps the system's swipe. Loaded after the first paint.
  useEffect(() => {
    let stop: (() => void) | undefined, gone = false
    void import('./edgeWatch').then(({ watchEdge, headerBack }) => {
      const back = () => pageBar()?.back?.onClick ?? headerBack() // from 768 px, the header's Back
      if (!gone) stop = watchEdge(back, () => setSidebarOpen(true), () => !document.querySelector('[aria-modal="true"]') && (drawerClosed.current || (!!back() && !!window.matchMedia?.(DESKTOP_HEADER_QUERY).matches)))
    })
    return () => { gone = true; stop?.() }
  }, [])
  // Changes the server refused after a role change (project-sharing): a toast, which never moves the page (app-shell "Notices are toasts").
  const { rejected } = useSyncStatus()
  useEffect(() => {
    if (!rejected) return
    showActionToast(t('{rejected}. The server\'s values are shown again.', { rejected: describeRejected(rejected) }))
  }, [rejected])
  // A travelling device: re-read the time zone whenever the app becomes visible
  // (absolute-datetimes), so zoned dues re-render in the new zone.
  useEffect(() => watchViewerZone(), [])
  // Offline doubles converge: one running time entry (time-tracking D2), one item per title in a reusable list (reusable-lists D4).
  useRunningRepair(); useDuplicateCollapse()
  // Start view (per device, OpenSpec `custom-views`): applied once per launch, and only
  // when the app opens at its root, so deep links and reloads keep their page.
  useEffect(() => {
    // `?task=<id>` (a notification click, an older shared link, a link in a note):
    // the task opens as its page over the page in the address, so Esc returns there
    // (task-full-page D4). Old and alias addresses (/activity, /calendar, earlier
    // settings ids) are replaced in place.
    const canonical = canonicalPath(location.pathname)
    if (canonical && canonical !== location.pathname) history.replaceState(null, '', `${canonical}${location.search}`)
    if (openAddressItem()) return
    if (location.pathname !== '/') return
    let cancelled = false
    void openStartView({ replace: true, still: () => !cancelled && location.pathname === '/' })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
    // The panel belongs to the page that opened it (app-shell D1); a return from the task page restores its list's scroll.
    closePanelIfStale(location.pathname)
    settleTrail(currentAddress())
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

  const palette = useCommandBar()
  const [showHelp, setShowHelp] = useState(false)
  const consentPending = useConsentPending()
  // Phone navigation (app-shell): the tab bar and the add button hide while a sheet or the panel is open, and on the task page (its own bar).
  const [addOpen, setAddOpen] = useState(false)
  useEffect(() => { const off = onQuickAddSheetRequest(() => setAddOpen(true)); void handleShellUrl(requestQuickAddSheet); return off }, []) // and a native shell's address actions (native-shells)
  const addButton = useRef<HTMLButtonElement>(null)
  const sheetOpen = useOverlayDepth() > 0
  const [panelOpen, panelCoversPage] = [!!usePanel(), usePanelCovering()]
  const phoneChrome = !sheetOpen && !panelOpen && hasPhoneChrome(route)
  // The add button's room at the end of the page: only where the button is.
  const addRoom = phoneChrome && offersQuickAdd(route)
  // The one keydown listener (keyboard-shortcuts "One shortcut registry with
  // scopes"); the shell owns the `global` scope: the palette, `g` navigation, the
  // cheat sheet, the sidebar toggle and the assistant.
  useShortcutDispatcher()
  const frame = useRef<HTMLElement>(null)
  // Folded to icons while a docked panel needs the room (tablet-layouts D2).
  const { sidebar, toggle: toggleSidebar } = useRoomFold(frame)
  const on = useFeatures(), go = (r: Parameters<typeof navigate>[0]) => () => (on(ROUTE_FEATURES[r.view]) ? navigate(r) : false) // off in the workspace: the key does nothing (workspace-feature-switches D4)
  // Off means off (habits-home D2, daily-notes D5): `g Shift+H` and `g j` do nothing unless Habits or Daily notes is on.
  const habitsOn = useHabitsEnabled(), dailyOn = useUserPrefsRow()?.daily_notes === true
  const habitForm = useHabitForm()
  useShortcutScope('global', {
    'go.inbox': go({ view: 'inbox' }), 'go.today': go({ view: 'today' }), 'go.upcoming': go({ view: 'upcoming' }), 'go.someday': go({ view: 'someday' }),
    'go.anytime': go({ view: 'anytime' }), 'go.completed': go({ view: 'completed' }), 'go.assigned': go({ view: 'assigned' }), 'go.labels': go({ view: 'labels' }), 'go.projects': go({ view: 'projects' }),
    'go.views': go({ view: 'views' }), 'go.day': go({ view: 'day' }), 'go.week': go({ view: 'week' }), 'go.month': go({ view: 'month' }), 'go.quarter': go({ view: 'quarter' }), 'go.plan': go({ view: 'plan' }), 'go.year': go({ view: 'year' }), 'go.filter': go({ view: 'filter' }), 'go.settings': go({ view: 'settings' }),
    'go.trash': go({ view: 'trash' }), 'go.triage': go({ view: 'triage' }), 'go.feed': go({ view: 'feed' }), 'go.ask': go({ view: 'ask' }), 'go.import': go({ view: 'import' }), 'go.help': go({ view: 'help' }),
    // Weekly review and Statistics (stats-and-review).
    'go.review': go({ view: 'review' }), 'go.stats': go({ view: 'stats' }), 'go.next': go({ view: 'next' }), 'go.waiting': go({ view: 'waiting' }), 'go.daily': go({ view: 'review', step: 'daily' }), 'go.loop': go({ view: 'loop' }),
    'go.focus': go({ view: 'focus' }), 'go.notes': go({ view: 'notes' }), 'go.close': go({ view: 'review', step: 'close' }),
    'go.habits': () => (habitsOn ? navigate({ view: 'habits' }) : false), 'go.dailyNote': () => (dailyOn && on('notes') ? navigate({ view: 'notes', day: logicalToday() }) : false),
    // `g /` (sidebar-groups): the sidebar's find field; the rail expands and the drawer opens first.
    'go.find': () => sidebarFind.request('open'),
    'global.help': () => setShowHelp((v) => !v),
    // `[` collapses the sidebar to icons from 1024 px (app-shell "Resizable sidebar"); the calendar's and the timeline's own `[` win there.
    'global.sidebar': () => {
      if (!window.matchMedia?.('(min-width: 64rem)').matches) return false
      toggleSidebar()
    },
    'global.assistant': () => {
      if (!showLauncher(assistantStatus())) return false
      openAssistant()
    },
  })

  const openPalette = palette.openSearch
  const vim = useVimEnabled(), phoneUi = usePhoneUi()
  const [vimHelp, setVimHelp] = useState<HelpSection | null>(null)
  const helpRequest = useHelpRequest()
  const connections = useConnectionsRequest()
  // Page changes are announced (assistive-tech-semantics): the tab title names the
  // page and a navigation moves focus to its heading; the skip link jumps there too.
  const content = useRef<HTMLDivElement>(null), openDrawer = useCallback(() => setSidebarOpen(true), [setSidebarOpen])
  usePageFocus(route, frame, content)
  // The phone's bottom chrome: the tab bar minimises while scrolling down, the toast sits above it (phone-v2 D5, D6).
  const minimised = usePhoneChrome(content, phoneChrome, sidebarOpen)

  return (
    <div className="flex h-full bg-canvas px-safe">
      <SkipLink frame={frame} content={content} />
      {/* The sidebar column: a drawer below 768 px, a column from there, resizable and collapsible from 1024 px (app-shell); its colour, shared by the sticky group headers, is --sidebar-bg: the surface in the drawer, the canvas as a column (precision-tokens D1), where it sits beside the inset content surface without an edge (precision-shell D1). */}
      {drawer.open && <DrawerOverlay panel={drawer.drawer} onClose={() => setSidebarOpen(false)} />}
      <aside {...drawer.aside} data-sidebar data-sidebar-width={sidebar.collapsed ? 'collapsed' : sidebar.width}
        style={{ '--sidebar-w': `${sidebar.collapsed ? SIDEBAR_COLLAPSED_REM : sidebar.width}rem` } as React.CSSProperties}
        className={`fixed inset-y-0 inset-s-0 z-[45] flex w-80 max-w-[85vw] max-md:[&_[data-sidebar-item]]:min-h-12 transform max-md:border-e max-md:border-default bg-(--sidebar-bg) [--sidebar-bg:var(--color-surface)] md:[--sidebar-bg:var(--color-canvas)] md:pointer-fine:[--sidebar-bg:var(--color-sidebar)] max-md:ps-safe transition-transform md:static md:h-full md:min-h-0 md:w-(--sidebar-w) md:max-w-none md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full max-md:rtl:translate-x-full'}`}
      >
        <div className="min-w-0 flex-1">
          <Sidebar route={route} user={user} onSearch={openPalette} onAddTask={palette.quickAdd} onShortcuts={() => setShowHelp(true)} onFeedback={() => { setSidebarOpen(false); openFeedback() }} onSignOut={onLogout} onAssistant={showLauncher(assistant) ? openAssistant : undefined} collapsed={sidebar.collapsed} onToggleCollapse={toggleSidebar} />
        </div>
        {!sidebar.collapsed && <SidebarResizer width={sidebar.width} />}
      </aside>
      {/* From 768 px the page is one inset content surface on the canvas: 8 px from the window, the surface radius, one hairline (precision-shell D1). */}
      <main ref={frame} className="flex min-w-0 flex-1 flex-col md:!pb-0 md:mt-[max(0.5rem,var(--safe-top))] md:mb-2 md:me-2 md:overflow-hidden md:rounded-surface md:border md:border-default md:bg-surface" data-app-frame data-phone-chrome={phoneChrome || undefined} inert={drawer.open || panelCoversPage || undefined}
>
        {/* Below 768 px: the bar with the menu button, the page's title and its actions (app-shell "No desktop top bar"). */}
        <PhoneBar onMenu={() => setSidebarOpen(true)} /><PullHost scroller={content} />
        {/* relative: the containing block of absolutely positioned content (every
            .sr-only label), which would otherwise be the page and stretch the
            document below the frame (issue #95). */}
        {/* Below 768 px the add button's footprint is reserved at the end of every page that shows it, so it never covers the last row
            (phone-v2 D2, phone-fab-scroll-room; a page with its own scroller: `.page-fill` in index.css); the room under the selection bar is in index.css (no-layout-jump). */}
        <div ref={content} id="content" data-main-scroller data-add-room={addRoom || undefined} style={scrollerRoom(phoneChrome && phoneUi, addRoom)}
          className={`relative min-h-0 flex-1 overflow-y-auto scroll-pb-(--list-scroll-pad) ${addRoom && !phoneChrome ? 'max-md:pb-(--add-room)' : ''} ${sidebarOpen ? 'max-md:overflow-hidden' : ''}`}>
          {/* One screen failing (a render bug, a chunk gone after an upgrade) leaves the shell usable (client-sync-robustness). */}
          <PanelBoundary resetKey={route}><PhoneOr on={phoneUi} onMenu={openDrawer}>
          {!on(ROUTE_FEATURES[route.view]) ? <Suspense fallback={null}><FeatureOff id={ROUTE_FEATURES[route.view]!} /></Suspense> : route.view === 'help' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading help…')}</p>}><HelpView page={route.page} q={route.q} /></Suspense>
          ) : route.view === 'settings' ? (
            <Suspense fallback={SCREEN_LOADING}><SettingsView user={user} onLogout={onLogout} section={route.section} page={route.page} anchor={route.anchor} /></Suspense>
          ) : route.view === 'theme-editor' ? <Suspense fallback={null}><ThemeEditorPage id={route.id} /></Suspense> : route.view === 'import' ? (
            <Suspense fallback={SCREEN_LOADING}><ImportScreen /></Suspense>
          ) : route.view === 'labels' ? (
            <LabelsView route={route} />
          ) : route.view === 'places' ? (
            <Suspense fallback={SCREEN_LOADING}><PlacesView /></Suspense>
          ) : route.view === 'rules' ? (
            <Suspense fallback={null}>{route.id || route.create ? <RoutinePage route={route} /> : <RoutinesView route={route} />}</Suspense>
          ) : route.view === 'projects' ? (
            <Suspense fallback={SCREEN_LOADING}><ProjectsView archived={route.archived} /></Suspense>
          ) : route.view === 'filter' ? (
            <Suspense fallback={SCREEN_LOADING}><FilterView key={route.q ?? ''} initialQuery={route.q} /></Suspense>
          ) : route.view === 'views' ? (
            <ViewsView />
          ) : route.view === 'view' ? (
            <SavedViewRoute id={route.id} />
          ) : route.view === 'trash' ? (
            <Suspense fallback={SCREEN_LOADING}><TrashView /></Suspense>
          ) : route.view === 'task' ? (
            <Suspense fallback={null}><TaskPage id={route.id} user={user} asTask={route.asTask} View={phoneUi ? PhoneTaskPage : undefined} /></Suspense>
          ) : route.view === 'review' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading the review…')}</p>}>
              {route.step === 'daily' ? <DailyCheck /> : route.step === 'monthly' ? <MonthlyLook /> : route.step === 'close' ? <CloseDay /> : <ReviewView key={route.step ?? ''} userId={user.id} step={route.step} />}
            </Suspense>
          ) : route.view === 'next' ? (
            <Suspense fallback={null}><NextView /></Suspense>
          ) : route.view === 'waiting' ? (
            <Suspense fallback={null}><WaitingView /></Suspense>
          ) : route.view === 'loop' ? (
            <Suspense fallback={null}><LoopHome move={route.move} /></Suspense>
          ) : route.view === 'habits' ? (
            <Suspense fallback={null}>{phoneUi ? <PhoneHabits id={route.id} /> : <HabitsScreen id={route.id} />}</Suspense>
          ) : route.view === 'stats' ? (
            <Suspense fallback={<p className="px-4 py-6 text-body text-muted" role="status">{t('Loading statistics…')}</p>}><StatsView /></Suspense>
          ) : route.view === 'focus' ? (
            <Suspense fallback={null}><FocusView id={route.id} /></Suspense>
          ) : route.view === 'notes' ? <Suspense fallback={null}><NotesPage id={route.id} day={route.day} /></Suspense> : route.view === 'triage' ? (
            <Suspense fallback={null}><TriageView /></Suspense>
          ) : route.view === 'feed' ? <Suspense fallback={SCREEN_LOADING}><FeedView /></Suspense> : route.view === 'workspace-activity' ? (
            <Suspense fallback={SCREEN_LOADING}><WorkspaceActivity id={route.id} /></Suspense>
          ) : route.view === 'ask' ? (
            <AskScreen role={user.role} name={user.name} />
          ) : route.view === 'day' || route.view === 'week' ? (
            <Suspense fallback={SCREEN_LOADING}><CalendarView mode={route.view} date={route.date} /></Suspense>
          ) : route.view === 'month' || route.view === 'quarter' || route.view === 'plan' || route.view === 'year' ? (
            <Suspense fallback={null}>{route.view === 'month' ? <MonthView date={route.date} /> : route.view === 'quarter' ? <QuarterView date={route.date} /> : route.view === 'plan' ? <PlanView date={route.date} /> : <YearView date={route.date} />}</Suspense>
          ) : (
            // App renders the invite, reset, capture and display screens itself; a stray /invite, /reset, /share or /display route inside the shell falls back to the Inbox.
            <ListScreen route={route.view === 'invite' || route.view === 'project-invite' || route.view === 'workspace-invite' || route.view === 'reset' || route.view === 'confirm-email' || route.view === 'forgot' || route.view === 'verify' || route.view === 'public' || route.view === 'share' || route.view === 'display' ? { view: 'inbox' } : route} user={user} phoneUi={phoneUi} onMenu={openDrawer} />
          )}
          </PhoneOr></PanelBoundary>
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
      {phoneChrome && <TabBar route={route} onSearch={openPalette} minimised={minimised} withAdd={addRoom || addOpen} />}
      {(addRoom || addOpen) && <AddButton ref={addButton} open={addOpen} away={minimised && !addOpen} note={route.view === 'notes' && !addOpen}
        onClick={() => (route.view === 'notes' && !addOpen ? navigate({ view: 'notes', create: true }) : setAddOpen((v) => !v))} />}
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} anchor={addButton} route={route} userId={user.id} />
      {showHelp && <PanelBoundary><Suspense fallback={null}><ShortcutHelp onClose={() => setShowHelp(false)} vim={vim} extraSections={vim && vimHelp ? [vimHelp] : []}
        context={{ view: route.view, board: hasScope('board') || hasScope('timeline'), panelOpen: hasScope('panel') || !!panelTaskId() }} /></Suspense></PanelBoundary>}
      {helpRequest && <PanelBoundary><Suspense fallback={null}><HelpPanel key={helpRequest.screen} screen={helpRequest.screen} trigger={helpRequest.trigger} onClose={closeHelp} /></Suspense></PanelBoundary>}
      {/* The Connections dialog (notes-graph D6), its chunk loaded by openConnections. */}
      {connections && <PanelBoundary><connections.Dialog key={`${connections.kind}:${connections.id}`} kind={connections.kind} id={connections.id} onClose={closeConnections} /></PanelBoundary>}
      {assistantLoaded && <PanelBoundary><Suspense fallback={null}><AssistantRoot name={user.name} onPage={route.view === 'ask'} context={() => ({ view: route.view, projectId: route.view === 'project' ? route.id : undefined })} /></Suspense></PanelBoundary>}
      <CommandBar palette={palette} user={user} showShortcuts={() => setShowHelp(true)} />
      {/* The owner's one-time thank-you on a new server (welcome-note); after a consent or app sign-in confirmation that is waiting, never on top of it. */}
      {!consentPending && <WelcomeDialog user={user} />}<FeedbackHost />
      {/* The start guide after it (first-run "Three-step first run"); never a row of the list. */}
      {!consentPending && <PanelBoundary><Suspense fallback={null}><FirstRunGuide user={user} /></Suspense></PanelBoundary>}
      {habitForm && <PanelBoundary><Suspense fallback={null}><HabitFormHost /></Suspense></PanelBoundary>}
      {/* The g … spotlight (shortcut-spotlight): shown after a hesitation, never focused. */}
      <Spotlight />
      <ReminderToasts />
      <BreakReminder />
      <ActionToasts />
      <DailyCheckToast />
      <TemplateDialogHost />
      <ArchivePrompt /><WorkspaceHost route={route} panelTask={panelTaskId()} /><AppLinkConfirm />
      <FramesHost /><FocusPickerHost />
    </div>
  )
}

/** The open phone drawer as an overlay: its scrim (a swipe on it does not scroll the page behind, sidebar-drawer-scroll), Escape and Back through the stack, focus moved in and back to the menu button on close, and the tab bar and add button out of the page (they hide while an overlay is open). */
function DrawerOverlay({ panel, onClose }: { panel: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  useOverlay({ panel, onClose })
  return <div className="fixed inset-0 z-[45] touch-none bg-scrim md:hidden" onClick={onClose} />
}

/**
 * The sidebar's drag edge (app-shell "Resizable sidebar"): 15 to 22.5 rem, per device; arrows resize it
 * from the keyboard, and a click without dragging switches between the widest and the default width
 * (accessibility-aa D3, WCAG 2.2 2.5.7).
 */
function SidebarResizer({ width }: { width: number }) {
  const dragging = useRef<{ startX: number; startWidth: number; moved: boolean } | null>(null)
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return (
    <div role="separator" aria-orientation="vertical" aria-label={t('Resize sidebar')} aria-valuemin={SIDEBAR_MIN_REM} aria-valuemax={SIDEBAR_MAX_REM} aria-valuenow={width}
      tabIndex={0} data-sidebar-resizer data-drag-id="sidebar-resizer"
      className="hidden w-1 shrink-0 cursor-col-resize self-stretch hover:bg-accent/40 focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus lg:block"
      onPointerDown={(e) => {
        dragging.current = { startX: e.clientX, startWidth: width, moved: false }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = dragging.current
        if (!d || (!d.moved && Math.abs(e.clientX - d.startX) < 4)) return
        d.moved = true
        setSidebarWidth(d.startWidth + inlineDelta(e.clientX - d.startX) / rem())
      }}
      onPointerUp={() => {
        const d = dragging.current
        dragging.current = null
        if (d && !d.moved) setSidebarWidth(width >= SIDEBAR_MAX_REM ? SIDEBAR_DEFAULT_REM : SIDEBAR_MAX_REM)
      }}
      onKeyDown={(e) => {
        if (inlineKey(e) === 'ArrowLeft' || inlineKey(e) === 'ArrowRight') { e.preventDefault(); setSidebarWidth(width + (inlineKey(e) === 'ArrowRight' ? 0.5 : -0.5)) }
        if (e.key === 'Home') { e.preventDefault(); setSidebarWidth(SIDEBAR_MIN_REM) }
        if (e.key === 'End') { e.preventDefault(); setSidebarWidth(SIDEBAR_MAX_REM) }
      }} />
  )
}

/**
 * Below 768 px: the menu button, the page's title and its actions (app-shell "No
 * desktop top bar"), from the page-bar store. A day page keeps its title in the page,
 * so its bar holds only the menu button and the actions, without a hairline; a page
 * with Back (a task, a nested page) puts Back where the menu button is (precision-phone D1).
 */
function PhoneBar({ onMenu }: { onMenu: () => void }) {
  const bar = usePageBar()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  // A phone UI screen draws its own bar (phone-ui-trial D2).
  const own = usePhoneOwnBar()
  if (desktop || own) return null
  const day = !!bar?.day
  return (
    <header className={`${PHONE_BAR_FRAME} ${day ? '' : PHONE_BAR_LINE}`} data-phone-bar data-phone-bar-day={day || undefined}>
      {bar?.back
        ? <IconButton icon="chevron-left" label={bar.back.label} onClick={bar.back.onClick} className="touch-target" data-page-back />
        : <IconButton icon="menu" label={t('Open menu')} onClick={onMenu} className="touch-target" />}
      <div className="min-w-0 flex-1">
        {!day && <PageBarTitle>{bar?.title}</PageBarTitle>}
        {/* One line, so the bar keeps its height (audit M12): a plain subtitle keeps its full text reachable when cut; controls (a project's members) cut themselves and are named by their content (ux-fixes-phone D2). */}
        {!day && bar?.subtitle && (typeof bar.subtitle === 'string'
          ? <TruncatedText as="p" text={bar.subtitle} className="block text-meta text-muted" data-phone-subtitle="" />
          : <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-meta text-muted" data-phone-subtitle>{bar.subtitle}</div>)}
      </div>
      <TrackingPill />
      <div className="flex shrink-0 items-center gap-1" data-page-actions>
        {bar && <PageActions actions={bar.actions} overflow={bar.overflow} menu={bar.menu} help={bar.help} helpInMenu />}
      </div>
    </header>
  )
}

