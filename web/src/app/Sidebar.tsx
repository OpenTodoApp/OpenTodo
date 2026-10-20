import { Button, Icon, IconButton, type IconName, isIconName, MenuItem, MenuSeparator, ReadAs, SidebarGroup, SidebarGroupAction, SidebarItem, StatusDot, Menu, Tooltip, useMediaQuery, useScrollEdges } from '../ui'
import { keysOf, SHORTCUTS } from '../lib/shortcuts'
import { useShortcutHints } from './shortcuts/hints'

/** The `g` key of each destination, from the registry's `go.*` rows. */
const GO_KEYS: Record<string, string> = Object.fromEntries(SHORTCUTS.filter((s) => s.id.startsWith('go.')).map((s) => [s.id.slice(3), s.keys[0]]))
import { requestTemplateDialog } from './TemplateDialogs'
import { ProjectPickerField } from './ProjectPickerField'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { readAppearance, type Promotable } from '../lib/appearance'
import { useAssistantStatus } from '../lib/assistantStatus'
import { readCalendarMode } from '../lib/calendarMode'
import { allProjectRows, useMembershipMap, useProjects, useReviewRow, useUserPrefsRow } from '../lib/localData'
import { createProject } from '../lib/ops'
import { dailyDue, dayClosed, monthlyDue, reviewAgo, reviewDue } from '../lib/review'
import { formatInstant } from '../lib/dates'
import { readMethodMode, type MethodMode } from '../lib/method/mode'
import { SidebarFooter } from './SidebarFooter'
import { buildProjectTree, collapseAllProjects, expandAllProjects, expandAncestorsOf, openCountsByProject, readCollapsed, siblingEdges, toggleCollapsedProject, visibleProjects, type ProjectNode } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { Label, Project, Review, Task, User, View } from '../lib/types'
import { useTrackedTotals } from '../lib/timeEntries'
import { evaluateViews, inToday, isDashboard, openCount } from '../lib/views'
import { LabelRow, NewLabelForm, useLabelData, useLabelDrag } from './LabelsView'
import { ViewMenu, viewIcon } from './ViewsView'
import { FavouritesGroup } from './FavouritesGroup'
import { ProjectRowMenu } from './ProjectRowMenu'
import { useFavourites } from './useFavourites'
import { useToday, useViewerZone, useViews } from './useViews'
import { MAX_INDENT } from './TaskRow'
import { navigate, type Route } from './router'
import { useOpenTasks } from '../lib/liveTasks'
import { beginDrag } from '../lib/dnd'
import { moveProjectBy, moveProjectTo } from '../lib/move'
import { canEditProject, roleOf } from '../lib/sharing'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from './listDrop'
import { formatUnread, unreadCounts, type UnreadCounts } from '../lib/feed'
import { matchSidebar } from '../lib/sidebarFind'
import { sidebarFind } from './signals'
import { t } from '../lib/i18n'
import { act } from './actionError'


/**
 * From 768 px with a fine pointer, More is a menu after the primary destinations instead
 * of a group in the scroller (sidebar-compact-desktop): the projects keep their room.
 * Touch keeps the inline group, which scrolls with the rest (sidebar-drawer-scroll).
 */
export const MORE_MENU_QUERY = '(min-width: 768px) and (pointer: fine)'

/** Indentation per level in the sidebar; capped so a deep tree still fits a 360 px screen. */
const INDENT_REM = 0.75

/**
 * Whether a group is open on this device (app-shell "Sidebar structure"): More is closed
 * by default, Projects open, Labels and Filters closed until the device stores a state,
 * since their items can be pinned to Favourites (sidebar-favourites D5). Favourites
 * itself has no chevron and is always open.
 */
const MORE_KEY = 'ot.sidebar.more'
type GroupId = 'filters' | 'projects' | 'labels'
const groupKey = (id: GroupId) => `ot.sidebar.group.${id}`
function readOpen(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch { return fallback }
}
function writeOpen(key: string, open: boolean): void {
  try { localStorage.setItem(key, open ? '1' : '0') } catch { /* device state only */ }
}

/**
 * A count as words, the part of a sidebar row's accessible name that carries it
 * (quiet-sidebar D2). Project counts show on hover, and at all times where there is no
 * hover; filter and label rows show none. A `tip` on a destination (the Review entry's
 * rhythm text, weekly-review "Rhythm markers") is its tooltip.
 */
export const openTasksLabel = (n: number | undefined): string | undefined => (n ? t('{n, plural, one {# open task} other {# open tasks}}', { n }) : undefined)

/**
 * Every saved view with its live open-task count over the sidebar's open tasks, in
 * one pass; tracked time is part of the context so `tracked` views count too
 * (time-tracking D4).
 */
function useViewCounts(views: View[], today: string, labels: Label[], projects: Project[], tasks: Task[]) {
  const tracked = useTrackedTotals()
  return useMemo(() => evaluateViews(views, { today, labels, projects, tasks, tracked }, 0), [views, today, labels, projects, tasks, tracked])
}

export function Sidebar({ route, user, onSearch, onShortcuts, onAssistant, onSignOut, collapsed = false, onToggleCollapse }: {
  route: Route
  user: User
  /** Opens the search and command palette (the footer's Search item). */
  onSearch?: () => void
  /** Opens the keyboard cheat sheet (`?`). */
  onShortcuts?: () => void
  /** Opens the assistant panel (Shift+I); absent when the assistant is not available. */
  onAssistant?: () => void
  /** Signs out of this device (the account menu, after its confirmation). */
  onSignOut?: () => void
  /** The icon rail (app-shell "Resizable sidebar"). */
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const hints = useShortcutHints()
  const assistant = useAssistantStatus()
  const moreAsMenu = useMediaQuery(MORE_MENU_QUERY)
  const projectCountMode = useMediaQuery('(pointer: coarse)') ? 'always' : 'hover'
  const scroller = useRef<HTMLDivElement>(null)
  useScrollEdges(scroller)
  // Promoted destinations (appearance preferences, synced): read with the rest of the row.
  const prefsRow = useUserPrefsRow()
  const review = useReviewRow()
  const appearance = useMemo(() => readAppearance(prefsRow), [prefsRow])
  const [moreOpen, setMoreOpenState] = useState(() => readOpen(MORE_KEY, false))
  const setMoreOpen = (open: boolean) => { setMoreOpenState(open); writeOpen(MORE_KEY, open) }
  // Every group folds and remembers it per device (sidebar-groups 1.2).
  const [groupOpen, setGroupOpenState] = useState<Record<GroupId, boolean>>(() => ({
    filters: readOpen(groupKey('filters'), false), projects: readOpen(groupKey('projects'), true), labels: readOpen(groupKey('labels'), false),
  }))
  const setGroupOpen = (id: GroupId, open: boolean) => { setGroupOpenState((s) => ({ ...s, [id]: open })); writeOpen(groupKey(id), open) }
  const toggleGroup = (id: GroupId) => setGroupOpen(id, !groupOpen[id])
  // Live projects (archived included) for saved views; the tree shows the visible ones.
  const allProjects = useProjects()
  const projects = useMemo(() => visibleProjects(allProjects), [allProjects])
  // Shared projects carry a badge (project-sharing); read from the cached memberships.
  const memberMap = useMembershipMap()
  const sharedIds = useMemo(() => new Set(memberMap.keys()), [memberMap])
  // Manual ordering (OpenSpec `manual-ordering`): a project's position is a project
  // field, so only its owner or an admin may move it (project-sharing roles).
  const movable = (id: string) => canEditProject(roleOf(id, memberMap))
  // Per-device collapse state lives in the local meta table (never synced); reading it
  // through a live query keeps every Sidebar instance in step.
  // A device that never stored a state reads every parent as collapsed (roots only).
  const collapsedLive = useLiveQuery(() => readCollapsed(projects), [projects])
  const collapsed_ = useMemo(() => collapsedLive ?? new Set<string>(), [collapsedLive])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  // Find in the sidebar (app-shell "Find in the sidebar"): a query narrows the three
  // groups without touching the stored collapse or group state.
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const findInput = useRef<HTMLInputElement>(null)
  const findOpener = useRef<HTMLButtonElement>(null)
  const searching = finding && query.trim() !== ''
  const rows = useMemo(() => flattenTree(tree.roots, (id) => !searching && collapsed_.has(id)), [tree, collapsed_, searching])

  // Unread activity in shared projects (activity-feed): a live query over the local
  // activity log and the synced seen markers, so it moves with every sync.
  const unread = useLiveQuery(() => unreadCounts(), [], { byProject: new Map(), total: 0 } as UnreadCounts)

  const openTasks = useOpenTasks()
  const zone = useViewerZone()
  // Re-read every minute, so the counts move to the new day at midnight.
  const today = useToday()
  const counts = useMemo(() => {
    let inbox = 0
    let due = 0
    let assigned = 0
    // Deferred and parked tasks are not counted (someday-and-evening D2).
    const active = openTasks.filter((tk) => openCount(tk, today))
    for (const task of active) {
      if (task.project_id === null) inbox++
      if (task.assignee_id === user.id) assigned++
    }
    for (const item of openTasks) if (inToday(item, today)) due++
    return { inbox, today: due, assigned, byProject: openCountsByProject(active, tree, collapsed_) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  }, [openTasks, tree, collapsed_, user.id, zone, today])

  // Navigating to a sub-project reveals it: its ancestors leave the collapsed set.
  // Only on a real route change, not on mount or on project edits, so a reload (or a
  // remote op) never undoes what the user collapsed on this device.
  const lastRoute = useRef<string | null>(null)
  useEffect(() => {
    const key = route.view === 'project' ? route.id : null
    const prev = lastRoute.current
    lastRoute.current = key ?? ''
    if (key === null || prev === null || prev === key) return
    void allProjectRows().then((all) => expandAncestorsOf(key, all))
  }, [route])

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { labels, counts: labelCounts, duplicates } = useLabelData()
  const labelDrag = useLabelDrag()

  // Every saved view with its live open-task count (the Filters group lists them all,
  // sidebar-favourites): each list view's compiled query runs over the open tasks this
  // sidebar already observes, in one pass.
  const views = useViews()
  const viewCounts = useViewCounts(views, today, labels, allProjects, openTasks)
  const favourites = useFavourites()
  const [addingLabel, setAddingLabel] = useState(false)
  const [parentId, setParentId] = useState('')

  const found = useMemo(() => (searching ? matchSidebar(query, {
    rows: rows.map((n) => ({ id: n.id, parent: n.parent, name: n.item.name })),
    labels: labels.map((l) => ({ id: l.id, name: l.name })),
    views: views.map((v) => ({ id: v.id, name: v.name })),
  }) : null), [searching, query, rows, labels, views])
  const shownRows = useMemo(() => (found ? rows.filter((n) => found.projects.has(n.id)) : rows), [found, rows])
  const shownLabels = useMemo(() => (found ? labels.filter((l) => found.labels.has(l.id)) : labels), [found, labels])
  const shownViews = useMemo(() => (found ? views.filter((v) => found.views.has(v.id)) : views), [found, views])
  const groupShown = (n: number) => (found ? n > 0 : true)
  // A group with nothing in it takes no room (sidebar-compact-desktop): Filters appears with
  // the first saved filter, Labels with the first label, Favourites with the first pin.
  const filtersShown = found ? shownViews.length > 0 : views.length > 0
  const labelsShown = found ? shownLabels.length > 0 : labels.length > 0 || addingLabel
  const isOpen = (id: GroupId) => (found ? true : groupOpen[id])
  const active = found?.order[Math.min(activeMatch, Math.max(0, (found?.order.length ?? 1) - 1))] ?? null
  const isActiveMatch = (kind: 'project' | 'label' | 'view', id: string) => active?.kind === kind && active.id === id
  useEffect(() => setActiveMatch(0), [query])
  const openMatch = (m: { kind: 'project' | 'label' | 'view'; id: string }) => {
    if (m.kind === 'project') navigate({ view: 'project', id: m.id })
    else if (m.kind === 'label') navigate({ view: 'label', id: m.id })
    else navigate({ view: 'view', id: m.id })
  }
  const refocusOpener = useRef(false)
  const closeFind = (refocus = true) => {
    refocusOpener.current = refocus
    setFinding(false)
    setQuery('')
  }
  const openFind = () => setFinding(true)
  // The field takes focus once it is rendered (also after the icon rail expands); closing it puts focus back on its opener.
  useEffect(() => {
    if (finding && !collapsed) findInput.current?.focus()
    else if (!finding && refocusOpener.current) { refocusOpener.current = false; findOpener.current?.focus() }
  }, [finding, collapsed])
  // `g /`, the palette command and the drawer open the field from outside.
  useEffect(() => {
    if (sidebarFind.take('open')) openFind()
    return sidebarFind.subscribe((id) => { if (id === 'open' && sidebarFind.take('open')) openFind() })
  }, [])
  const onFindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind() }
    else if (e.key === 'Enter' && active) { e.preventDefault(); openMatch(active); closeFind(false) }
    else if (e.key === 'ArrowDown' && found) { e.preventDefault(); setActiveMatch((i) => Math.min(i + 1, found.order.length - 1)) }
    else if (e.key === 'ArrowUp' && found) { e.preventDefault(); setActiveMatch((i) => Math.max(i - 1, 0)) }
  }

  function startAdding() {
    setParentId(route.view === 'project' && tree.nodes.has(route.id) ? route.id : '')
    setGroupOpen('projects', true)
    setAdding(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const id = await createProject({ name, parent_id: parentId || null })
    if (parentId) await toggleCollapsedProject(parentId, false)
    setName('')
    setAdding(false)
    navigate({ view: 'project', id })
  }

  const focusRow = (id: string | null) => {
    if (id) document.querySelector<HTMLElement>(`[data-project-id="${id}"]`)?.focus()
  }
  // A moved row is re-inserted in the DOM, which can drop focus: restore it once
  // the reordered tree renders.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    if (!refocus.current) return
    const id = refocus.current
    refocus.current = null
    if (document.activeElement?.getAttribute('data-project-id') !== id) focusRow(id)
  }, [rows])

  // Drag and drop of sidebar projects (lib/dnd): the top or bottom quarter of a row
  // places before / after it (among its siblings), the middle nests inside it
  // (project-hierarchy re-parenting). Keyboard alternatives: Alt+Up/Down, and `m`.
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  const treeRef = useRef(tree)
  treeRef.current = tree
  const collapsedRef = useRef(collapsed_)
  collapsedRef.current = collapsed_
  function startDrag(e: React.PointerEvent, n: ProjectNode) {
    if (!movable(n.id)) return
    const own = new Set(flattenTree([n]).map((x) => x.id))
    let current: DropAt | null = null
    const show = (d: DropAt | null) => {
      if (sameDrop(d, current)) return
      current = d
      setDropAt(d)
    }
    beginDrag(e, {
      label: n.item.name,
      onMove: (target, _x, y) => {
        const id = target?.startsWith('project:') ? target.slice('project:'.length) : null
        const zone = id && !own.has(id) ? zoneUnder('data-project-row', id, y, true) : null
        show(id && zone ? { id, zone } : null)
      },
      onDrop: () => {
        const d = current
        const row = d ? treeRef.current.nodes.get(d.id) : undefined
        if (!d || !row) return
        const entry = dropTarget({ id: row.id, parent: row.parent, expanded: row.children.length > 0 && !collapsedRef.current.has(row.id) }, d.zone)
        if (entry.parent_id) void toggleCollapsedProject(entry.parent_id, false)
        act(moveProjectTo(n.id, entry))
      },
      onEnd: () => show(null),
    })
  }

  /** Left collapses (or climbs to the parent), Right expands (or descends to the first child). Alt+Up/Down reorders. */
  function onRowKey(e: KeyboardEvent<HTMLButtonElement>, n: ProjectNode) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Keyboard move among siblings (manual-ordering); the row keeps focus.
      e.preventDefault()
      e.stopPropagation()
      const up = e.key === 'ArrowUp'
      refocus.current = n.id
      act(moveProjectBy(n.id, e.shiftKey ? (up ? 'top' : 'bottom') : up ? -1 : 1))
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const has = n.children.length > 0
    if (e.key === 'ArrowLeft') {
      if (has && !collapsed_.has(n.id)) void toggleCollapsedProject(n.id, true)
      else focusRow(n.parent)
    } else if (has && collapsed_.has(n.id)) void toggleCollapsedProject(n.id, false)
    else if (has) focusRow(n.children[0].id)
  }

  const item = (r: Route, label: string, icon: IconName, count?: number, badge?: ReactNode, tip?: string) => {
    // Day, Week, Month and Plan are one Calendar destination (ux-overhaul, planner-view).
    const calendar = (v: string) => v === 'day' || v === 'week' || v === 'month' || v === 'plan'
    const active = calendar(r.view) ? calendar(route.view) : JSON.stringify(r) === JSON.stringify(route)
    // With "Show shortcut hints" on, the destination prints its `g` key (keyboard-shortcuts "Hints preference").
    const go = hints && !collapsed && badge == null ? GO_KEYS[r.view] : undefined
    const node = <SidebarItem key={label} icon={icon} label={label} count={count} countLabel={openTasksLabel(count)} badge={go ? <kbd className="ui-kbd" data-go-hint>{go}</kbd> : badge} active={active} collapsed={collapsed} onClick={() => navigate(r)} data-destination={r.view} aria-description={tip && badge == null ? tip : undefined} />
    return tip && !collapsed ? <Tooltip key={label} label={tip} side="right">{node}</Tooltip> : node
  }

  // The More group (app-shell "Sidebar structure"): the less frequent destinations,
  // collapsed by default on this device; a promoted destination (appearance
  // preferences, synced) leaves it for the primary items.
  const promoted = appearance.sidebar ?? []
  const unreadBadge = unread.total > 0 ? <UnreadBadge n={unread.total} label={t('unread updates')} /> : undefined
  // The weekly review (stats-and-review): when the last one was, and a marker once it is due.
  const method = readMethodMode(prefsRow)
  const { due, text: reviewText, marker: reviewDot } = reviewMarker(review, method, today)
  // Each More destination once, as data: an item in the inline group, or a menu item
  // (with its badge as the item's description) in the desktop menu.
  const moreEntries: MoreEntry[] = [
    // The Open Loops views (open-loops-method D7, D9), in every mode.
    { id: 'loop', route: { view: 'loop' }, label: t('Loop home'), icon: 'rotate-ccw' },
    { id: 'next', route: { view: 'next' }, label: t('Next', { context: 'method' }), icon: 'arrow-right' },
    { id: 'waiting', route: { view: 'waiting' }, label: t('Waiting', { context: 'method' }), icon: 'hourglass' },
    { id: 'anytime', route: { view: 'anytime' }, label: t('Anytime'), icon: 'layers' },
    { id: 'someday', route: { view: 'someday' }, label: t('Someday'), icon: 'archive' },
    // Assigned to me only where tasks can be assigned: when the account shares a project.
    ...(sharedIds.size > 0 ? [{ id: 'assigned' as const, route: { view: 'assigned' } as Route, label: t('Assigned to me'), icon: 'user-check' as IconName }] : []),
    { id: 'completed', route: { view: 'completed' }, label: t('Completed'), icon: 'circle-check-big' },
    { id: 'review', route: { view: 'review' }, label: t('Review'), icon: 'clipboard-check', badge: reviewDot, note: reviewText, tip: reviewText },
    { id: 'stats', route: { view: 'stats' }, label: t('Statistics'), icon: 'chart-column' },
    ...(sharedIds.size > 0 ? [{ id: 'feed' as const, route: { view: 'feed' } as Route, label: t('Updates'), icon: 'newspaper' as IconName, badge: unreadBadge, note: unread.total > 0 ? `${formatUnread(unread.total)} ${t('unread updates')}` : undefined }] : []),
    { id: 'trash', route: { view: 'trash' }, label: t('Trash'), icon: 'trash-2' },
    { id: 'filter', route: { view: 'filter' }, label: t('Filter'), icon: 'filter' },
    ...(assistant?.available ? [{ id: 'ask' as const, route: { view: 'ask' } as Route, label: t('Ask'), icon: 'message-circle' as IconName }] : []),
  ]
  const first = method === 'first'
  const calendarMode = readCalendarMode()
  const moreList = first ? firstModeMore(moreEntries, calendarMode) : moreEntries
  const more = moreList.map((m) => ({ ...m, node: item(m.route, m.label, m.icon, undefined, m.badge, m.tip) }))
  const primaryExtra = first ? [] : more.filter((m) => m.id !== 'ask' && promoted.includes(m.id as Promotable))
  // A due review shows on the closed More heading too, so the marker is never hidden.
  // In Open Loops first the Review entry is a primary item, so More does not repeat its marker.
  const moreBadge = unreadBadge ?? (due && !first ? <Tooltip label={reviewText} side="right"><StatusDot label={reviewText} data-review-due-more /></Tooltip> : undefined)
  const rest = more.filter((m) => !primaryExtra.includes(m))

  return (
    // One scroller (ux-overhaul, app-shell "Sidebar structure"): the name and the
    // primary destinations stay at the top, Help and the account at the bottom, and
    // only the More group, filters, projects and labels between them scroll. More
    // scrolls too, so opening it on a short phone screen never leaves the scroller
    // without room (sidebar-drawer-scroll).
    <div className="flex h-full flex-col" data-sidebar-collapsed={collapsed || undefined}>
      <div className={`shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] ${collapsed ? 'px-1.5' : 'px-3'}`}>
        <div className={`mb-4 flex items-center gap-2 pointer-fine:mb-3 ${collapsed ? 'justify-center' : 'px-1'}`}>
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          {!collapsed && <span className="flex-1 font-semibold">{t('OpenTodo')}</span>}
          {/* Search and commands beside the name (sidebar-compact-desktop); the icon rail keeps it in the footer. */}
          {!collapsed && onSearch && (
            <IconButton icon="search" label={t('Search and commands')} shortcut={keysOf('global.palette')} size="sm" onClick={onSearch}
              aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-palette-button />
          )}
        </div>
        <nav className="space-y-0.5" aria-label={t('Primary')} data-sidebar-primary>
          {primaryDestinations(first, calendarMode, counts, reviewDot, reviewText).map((d) => item(d.route, d.label, d.icon, d.count, d.badge, d.tip))}
          {primaryExtra.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
          {moreAsMenu && rest.length > 0 && (
            <MoreMenu entries={rest} badge={moreBadge} collapsed={collapsed} hints={hints}
              active={rest.some((m) => m.route.view === route.view)} />
          )}
        </nav>
      </div>
      <div ref={scroller} className={`ui-scroller min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-scroll>
      {finding && !collapsed && (
        <div className="pt-3" data-sidebar-find>
          <input ref={findInput} className="ui-input py-1.5 text-body" type="search" placeholder={t('Find a project, label or filter…')} aria-label={t('Find in the sidebar')}
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onFindKey} enterKeyHint="go" autoComplete="off" />
          {found?.empty && <p className="px-2 pt-2 text-meta text-faint" role="status">{t('Nothing matches.')}</p>}
        </div>
      )}
      {!moreAsMenu && <SidebarGroup title={t('More')} collapsible open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} badge={moreBadge} collapsed={collapsed} tight testId="sidebar-more">
        {rest.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
      </SidebarGroup>}
      {/* Favourites first (sidebar-favourites D5); while finding, the matches show in their own groups. */}
      {!found && favourites.length > 0 && (
        <FavouritesGroup favourites={favourites} route={route} collapsed={collapsed} projects={projects}
          tree={tree} openTasks={openTasks} today={today} labelCounts={labelCounts} viewCounts={viewCounts} projectCountMode={projectCountMode} />
      )}
      {/* Projects stays while finding: its header holds the field's opener. */}
      {(finding || groupShown(shownRows.length)) && <SidebarGroup title={t('Projects')} collapsible open={isOpen('projects')} onToggle={() => toggleGroup('projects')} count={projects.length} collapsed={collapsed} actions={(<>
        <SidebarGroupAction active={route.view === 'projects'} onClick={() => navigate({ view: 'projects' })} aria-label={t('All projects')}>{t('All')}</SidebarGroupAction>
        <SidebarGroupAction ref={findOpener} onClick={() => (finding ? closeFind() : openFind())} aria-label={t('Find in the sidebar')} aria-pressed={finding} active={finding}><Icon name="search" size="xs" /></SidebarGroupAction>
        <Menu kind="menu" label={t('Add or fold projects')} title={t('Projects')} trigger={<Icon name="plus" size="xs" />}
          triggerClassName="rounded-chip px-1.5 py-0.5 text-hint font-medium normal-case text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised" width="sm:w-56">
          <MenuItem label={t('New project')} icon="plus" onSelect={startAdding} />
          <MenuItem label={t('From a template…')} icon="copy" onSelect={requestTemplateDialog} />
          <MenuSeparator />
          <MenuItem label={t('Collapse all')} icon="chevrons-down-up" onSelect={() => void collapseAllProjects(projects)} />
          <MenuItem label={t('Expand all')} icon="chevrons-up-down" onSelect={() => void expandAllProjects()} />
        </Menu>
      </>)}>
        <ul role="tree">
          {shownRows.map((n) => {
            const p = n.item
            const has = n.children.length > 0
            const isCollapsed = collapsed_.has(n.id)
            const count = counts.byProject.get(n.id)
            const drop = dropAt?.id === n.id ? dropAt.zone : null
            return (
              <li key={n.id} role="treeitem" aria-level={n.depth + 1} aria-expanded={has ? !isCollapsed : undefined}
                data-project-row={n.id} data-drop-target={`project:${n.id}`}
                onPointerDown={movable(n.id) ? (e) => startDrag(e, n) : undefined}
                className={`group relative flex items-center rounded-control ${drop === 'inside' ? 'ring-2 ring-accent' : ''}`} style={{ paddingLeft: collapsed ? 0 : `${Math.min(n.depth, MAX_INDENT) * INDENT_REM}rem` }}>
                {(drop === 'before' || drop === 'after') && (
                  <span aria-hidden="true" data-drop-indicator={drop}
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-control bg-accent ${drop === 'before' ? '-top-px' : '-bottom-px'}`} />
                )}
                {!collapsed && (
                  <span className="flex h-6 w-4 shrink-0 items-center justify-center">
                    {has && (
                      <button type="button" tabIndex={-1} aria-label={isCollapsed ? t('Expand {name}', { name: p.name }) : t('Collapse {name}', { name: p.name })}
                        onClick={() => void toggleCollapsedProject(n.id)}
                        className="flex h-5 w-4 items-center justify-center rounded-chip text-meta text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised pointer-coarse:-mx-3.5 pointer-coarse:-my-2.5 pointer-coarse:h-11 pointer-coarse:w-11">
                        <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${isCollapsed ? '' : 'rotate-90'}`} />
                      </button>
                    )}
                  </span>
                )}
                <SidebarItem
                  data-project-id={n.id}
                  data-find-active={isActiveMatch('project', n.id) || undefined}
                  className={isActiveMatch('project', n.id) ? 'ring-2 ring-focus' : found && !found.matched.has(n.id) ? 'text-faint' : undefined}
                  depth={n.depth}
                  active={route.view === 'project' && route.id === n.id}
                  collapsed={collapsed}
                  onClick={() => navigate({ view: 'project', id: n.id })}
                  onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => onRowKey(e, n)}
                  label={p.name}
                  leading={<ProjectMark project={p} />}
                  badge={<>
                    {sharedIds.has(n.id) && <span className="text-faint"><Icon name="users" size={14} /><span className="sr-only">{t('Shared project')}</span></span>}
                    {unread.byProject.get(n.id) ? <UnreadBadge n={unread.byProject.get(n.id) as number} label={t('unread changes')} /> : null}
                  </>}
                  count={count} countMode={projectCountMode} countLabel={openTasksLabel(count)}
                  aria-description={count && isCollapsed && has ? t('Open tasks including sub-projects') : undefined}
                />
                {!collapsed && <ProjectRowMenu project={p} movable={movable(n.id)} edges={siblingEdges(tree, n)} className="hover-reveal" />}
              </li>
            )
          })}
        </ul>
        {adding && !collapsed && (
          <form onSubmit={(e) => void submit(e)} className="space-y-1 px-1 pt-1">
            <input className="ui-input" autoFocus placeholder={t('Project name')} value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <ProjectPickerField label={t('Parent project')} projects={projects} value={parentId || null} onChange={(id) => setParentId(id ?? '')}
              rankContext="project.parent" inbox={false} noneLabel={t('Top level')} className="py-1 text-meta" />
            <div className="flex gap-1">
              <Button type="submit" variant="primary" size="sm" className="flex-1">{t('Create')}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>{t('Cancel')}</Button>
            </div>
          </form>
        )}
        {projects.length === 0 && !adding && !collapsed && <p className="px-2 py-1 text-meta text-faint">{t('No projects yet.')}</p>}
      </SidebarGroup>}
      {labelsShown && <SidebarGroup title={t('Labels')} collapsible open={isOpen('labels')} onToggle={() => toggleGroup('labels')} count={labels.length} collapsed={collapsed}
        actions={<>
          <SidebarGroupAction active={route.view === 'labels'} onClick={() => navigate({ view: 'labels' })} aria-label={t('All labels')}>{t('All')}</SidebarGroupAction>
          <SidebarGroupAction onClick={() => { setGroupOpen('labels', true); setAddingLabel(true) }} aria-label={t('New label')}><Icon name="plus" size="xs" /></SidebarGroupAction>
        </>}>
        {!collapsed && shownLabels.map((l) => <LabelRow key={l.id} quiet label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={labelDrag.drop} onDragStart={labelDrag.start} findActive={isActiveMatch('label', l.id)} />)}
        {addingLabel && !collapsed && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
      </SidebarGroup>}
      {filtersShown && <SidebarGroup title={t('Filters')} collapsible open={isOpen('filters')} onToggle={() => toggleGroup('filters')} count={views.length} collapsed={collapsed}
        actions={<SidebarGroupAction active={route.view === 'views'} onClick={() => navigate({ view: 'views' })} aria-label={t('All filters')}>{t('All')}</SidebarGroupAction>}>
        {shownViews.map((v) => {
          const active = route.view === 'view' && route.id === v.id
          const c = viewCounts.get(v.id)
          return (
            <div key={v.id} className="group flex items-center">
              <SidebarItem data-view-id={v.id} active={active} collapsed={collapsed} onClick={() => navigate({ view: 'view', id: v.id })} label={v.name}
                data-find-active={isActiveMatch('view', v.id) || undefined} className={isActiveMatch('view', v.id) ? 'ring-2 ring-focus' : undefined}
                leading={<span style={{ color: v.color }}><Icon name={viewIcon(v)} /></span>}
                count={!isDashboard(v) && c && c.ok ? c.count : undefined} countMode="hidden" countLabel={openTasksLabel(c && c.ok ? c.count : undefined)}
                badge={!isDashboard(v) && c && !c.ok ? <span className="text-meta text-danger"><ReadAs label={c.error}>!</ReadAs></span> : undefined} />
              {!collapsed && <ViewMenu view={v} className="hover-reveal" />}
            </div>
          )
        })}
      </SidebarGroup>}
      </div>
      <SidebarFooter route={route} user={user} collapsed={collapsed} onSearch={onSearch} onShortcuts={onShortcuts} onAssistant={onAssistant} onToggleCollapse={onToggleCollapse} onSignOut={onSignOut} />
    </div>
  )
}

/** A project's mark: its icon in its colour, or the colour dot (project-organization "Project icon"). */
export function ProjectMark({ project, size = 'sm' }: { project: Pick<Project, 'color' | 'icon'>; size?: 'sm' | 'md' }) {
  if (project.icon && isIconName(project.icon)) return <span style={{ color: project.color }} className="flex items-center"><Icon name={project.icon} size={size === 'md' ? 'md' : 'sm'} /></span>
  return <span className={`inline-block shrink-0 rounded-full ${size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'}`} style={{ backgroundColor: project.color }} />
}

/** Unread activity count (activity-feed): others' changes since the project's activity was last seen. */
function UnreadBadge({ n, label }: { n: number; label: string }) {
  const text = formatUnread(n)
  return (
    <span data-unread-count={n}
      className="rounded-full bg-accent px-1.5 text-hint font-semibold leading-4 text-on-accent"><ReadAs label={`${text} ${label}`}>{text}</ReadAs></span>
  )
}

/** More as a menu (sidebar-compact-desktop): one row after the primary destinations, its badge on the row, each destination a menu item. */
// Each More destination once, as data: an item in the inline group, or a menu item.
type MoreEntry = { id: Promotable | 'ask' | 'review' | 'stats' | 'upcoming' | 'calendar'; route: Route; label: string; icon: IconName; badge?: ReactNode; note?: string; tip?: string }

/**
 * The Review entry's marker (weekly-review "Rhythm markers", quiet-sidebar D4): the
 * weekly review in every mode, the Monthly look in Companion and Open Loops first, the
 * Daily check in Open Loops first. One accent dot while something is due, never a
 * badge; `text` names each due rhythm (or when the last review was) for the tooltip,
 * the accessible name and the More menu's description.
 */
function reviewMarker(review: Review | null | undefined, method: MethodMode, today: string): { due: boolean; text: string; marker: ReactNode } {
  const weeklyDue = reviewDue(review?.completed_at)
  const parts = [
    ...(weeklyDue ? [review?.completed_at ? t('last weekly review {ago}', { ago: reviewAgo(review.completed_at) }) : t('no weekly review yet')] : []),
    ...(method !== 'lists' && monthlyDue(review?.monthly_at) ? [t('the Monthly look is due')] : []),
    ...(method === 'first' && dailyDue(review?.daily_at, today) ? [t('the Daily check is due')] : []),
  ]
  const due = parts.length > 0
  // Close the day (close-the-day D7): "Day closed" for the rest of the local day; a due marker wins and its text names both.
  const closed = review && dayClosed(review.closed_at, today) ? formatInstant(review.closed_at, 'time') : null
  const text = due
    ? t('Review due · {details}', { details: parts.join('; ') }) + (closed ? `; ${t('the day is closed')}` : '')
    : closed ? t('Day closed, {time}', { time: closed }) : t('Last review {ago}', { ago: reviewAgo(review?.completed_at) })
  return { due, text, marker: due ? <StatusDot label={text} data-review-due /> : null }
}

/**
 * More in Open Loops first (open-loops-method D7, app-shell "Sidebar structure"): the
 * six primary destinations are fixed by the Places, so Upcoming and Calendar join More
 * and the method's own destinations leave it. Promotions are set aside, not cleared.
 */
function firstModeMore(entries: MoreEntry[], calendarMode: Route['view']): MoreEntry[] {
  const primary = new Set(['loop', 'next', 'waiting', 'review'])
  return [
    { id: 'upcoming', route: { view: 'upcoming' }, label: t('Upcoming'), icon: 'calendar-days' },
    { id: 'calendar', route: { view: calendarMode } as Route, label: t('Calendar'), icon: 'calendar-range' },
    ...entries.filter((m) => !primary.has(m.id)),
  ]
}

/** The primary destinations (app-shell "Sidebar structure"): by the Places in Open Loops first, else Inbox, Today, Upcoming and Calendar. */
function primaryDestinations(first: boolean, calendarMode: Route['view'], counts: { inbox?: number; today?: number }, reviewDot: ReactNode, reviewText: string): { route: Route; label: string; icon: IconName; count?: number; badge?: ReactNode; tip?: string }[] {
  const inbox = { route: { view: 'inbox' } as Route, label: t('Inbox'), icon: 'inbox' as IconName, count: counts.inbox }
  const today = { route: { view: 'today' } as Route, label: t('Today'), icon: 'calendar-check' as IconName, count: counts.today }
  return first
    ? [
        { route: { view: 'loop' }, label: t('Loop home'), icon: 'rotate-ccw' }, inbox, today,
        { route: { view: 'next' }, label: t('Next', { context: 'method' }), icon: 'arrow-right' },
        { route: { view: 'waiting' }, label: t('Waiting', { context: 'method' }), icon: 'hourglass' },
        { route: { view: 'review' }, label: t('Review'), icon: 'clipboard-check', badge: reviewDot, tip: reviewText },
      ]
    : [inbox, today, { route: { view: 'upcoming' }, label: t('Upcoming'), icon: 'calendar-days' }, { route: { view: calendarMode } as Route, label: t('Calendar'), icon: 'calendar-range' }]
}

function MoreMenu({ entries, badge, active, collapsed, hints }: {
  entries: { id: string; route: Route; label: string; icon: IconName; note?: string }[]
  badge?: ReactNode
  active: boolean
  collapsed: boolean
  hints: boolean
}) {
  return (
    <div data-sidebar-more-menu>
      <Menu kind="menu" label={t('More')} namedByContent={!collapsed} title={t('More')} align="start" width="sm:w-64"
        triggerClassName={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-control py-1.5 text-left text-body pointer-fine:min-h-8 pointer-fine:py-1 ${collapsed ? 'justify-center px-0' : 'px-2'} ${active ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised'}`}
        trigger={<>
          <span className="flex w-5 shrink-0 justify-center text-muted" aria-hidden="true"><Icon name="ellipsis" /></span>
          {!collapsed && <span className="min-w-0 flex-1 truncate">{t('More')}</span>}
          {!collapsed && badge}
          {!collapsed && <span className="text-faint" aria-hidden="true"><Icon name="chevron-right" size="xs" /></span>}
        </>}>
        {entries.map((m) => (
          <MenuItem key={m.id} icon={m.icon} label={m.label} description={m.note}
            shortcut={hints ? GO_KEYS[m.route.view] : undefined} onSelect={() => navigate(m.route)} />
        ))}
      </Menu>
    </div>
  )
}
