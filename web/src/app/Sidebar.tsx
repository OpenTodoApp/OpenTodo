import { Badge, Button, Icon, IconButton, type IconName, isIconName, MenuItem, MenuSeparator, ReadAs, SidebarGroup, SidebarGroupAction, SidebarItem } from '../ui'
import { keysOf, SHORTCUTS } from '../lib/shortcuts'
import { useShortcutHints } from './shortcuts/hints'

/** The `g` key of each destination, from the registry's `go.*` rows. */
const GO_KEYS: Record<string, string> = Object.fromEntries(SHORTCUTS.filter((s) => s.id.startsWith('go.')).map((s) => [s.id.slice(3), s.keys[0]]))
import { Menu } from './overlay/Menu'
import { requestTemplateDialog } from './TemplateDialogs'
import { ProjectPickerField } from './ProjectPickerField'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { readAppearance, type Promotable } from '../lib/appearance'
import { useAssistantStatus } from '../lib/assistantStatus'
import { readCalendarMode } from '../lib/calendarMode'
import { db } from '../lib/db'
import { createProject } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { REVIEW_ID, reviewAgo, reviewDue } from '../lib/review'
import { NotificationBell } from './NotificationBell'
import { SyncStatus } from './SyncStatus'
import { buildProjectTree, collapseAllProjects, expandAllProjects, expandAncestorsOf, openCountsByProject, readCollapsed, toggleCollapsedProject, type ProjectNode } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { Project, User } from '../lib/types'
import { evaluateViews, inToday, isDashboard, openCount } from '../lib/views'
import { LabelRow, NewLabelForm, useLabelData, useLabelDrag } from './LabelsView'
import { ViewMenu, viewIcon } from './ViewsView'
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


/** Indentation per level in the sidebar; capped so a deep tree still fits a 360 px screen. */
const INDENT_REM = 0.75

/** Whether a group is open on this device: More is closed by default, Filters, Projects and Labels open (app-shell "Sidebar structure"). */
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

export function Sidebar({ route, user, onSearch, onShortcuts, onAssistant, collapsed = false, onToggleCollapse }: {
  route: Route
  user: User
  /** Opens the search and command palette (the footer's Search item). */
  onSearch?: () => void
  /** Opens the keyboard cheat sheet (`?`). */
  onShortcuts?: () => void
  /** Opens the assistant panel (Shift+I); absent when the assistant is not available. */
  onAssistant?: () => void
  /** The icon rail (app-shell "Resizable sidebar"). */
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const hints = useShortcutHints()
  const assistant = useAssistantStatus()
  // Promoted destinations (appearance preferences, synced): read with the rest of the row.
  const prefsRow = useLiveQuery(() => db.userPrefs.get(USER_PREFS_ID), [])
  const review = useLiveQuery(() => db.review.get(REVIEW_ID), [])
  const appearance = useMemo(() => readAppearance(prefsRow), [prefsRow])
  const [moreOpen, setMoreOpenState] = useState(() => readOpen(MORE_KEY, false))
  const setMoreOpen = (open: boolean) => { setMoreOpenState(open); writeOpen(MORE_KEY, open) }
  // Every group folds and remembers it per device (sidebar-groups 1.2).
  const [groupOpen, setGroupOpenState] = useState<Record<GroupId, boolean>>(() => ({
    filters: readOpen(groupKey('filters'), true), projects: readOpen(groupKey('projects'), true), labels: readOpen(groupKey('labels'), true),
  }))
  const setGroupOpen = (id: GroupId, open: boolean) => { setGroupOpenState((s) => ({ ...s, [id]: open })); writeOpen(groupKey(id), open) }
  const toggleGroup = (id: GroupId) => setGroupOpen(id, !groupOpen[id])
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at && !p.archived).toArray(), [], [])
  // Shared projects carry a badge (project-sharing); read from the cached memberships.
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
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
    void db.projects.toArray().then((all) => expandAncestorsOf(key, all))
  }, [route])

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { labels, counts: labelCounts, duplicates } = useLabelData()
  const labelDrag = useLabelDrag()

  // Pinned saved views with live open-task counts: every pinned list view's compiled
  // query runs over the open tasks this sidebar already observes, in one pass.
  const views = useViews()
  const pinnedViews = useMemo(() => views.filter((v) => v.pinned), [views])
  const allProjects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [])
  const viewCounts = useMemo(
    () => evaluateViews(pinnedViews, { today, labels, projects: allProjects, tasks: openTasks }, 0),
    [pinnedViews, labels, allProjects, openTasks, today],
  )
  const [addingLabel, setAddingLabel] = useState(false)
  const [parentId, setParentId] = useState('')

  const found = useMemo(() => (searching ? matchSidebar(query, {
    rows: rows.map((n) => ({ id: n.id, parent: n.parent, name: n.item.name })),
    labels: labels.map((l) => ({ id: l.id, name: l.name })),
    views: pinnedViews.map((v) => ({ id: v.id, name: v.name })),
  }) : null), [searching, query, rows, labels, pinnedViews])
  const shownRows = useMemo(() => (found ? rows.filter((n) => found.projects.has(n.id)) : rows), [found, rows])
  const shownLabels = useMemo(() => (found ? labels.filter((l) => found.labels.has(l.id)) : labels), [found, labels])
  const shownViews = useMemo(() => (found ? pinnedViews.filter((v) => found.views.has(v.id)) : pinnedViews), [found, pinnedViews])
  const groupShown = (n: number) => (found ? n > 0 : true)
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

  const item = (r: Route, label: string, icon: IconName, count?: number, badge?: ReactNode) => {
    // Day, Week and Month are one Calendar destination (ux-overhaul).
    const calendar = (v: string) => v === 'day' || v === 'week' || v === 'month'
    const active = calendar(r.view) ? calendar(route.view) : JSON.stringify(r) === JSON.stringify(route)
    // With "Show shortcut hints" on, the destination prints its `g` key (keyboard-shortcuts "Hints preference").
    const go = hints && !collapsed && badge === undefined ? GO_KEYS[r.view] : undefined
    return <SidebarItem key={label} icon={icon} label={label} count={count} badge={go ? <kbd className="ui-kbd" data-go-hint>{go}</kbd> : badge} active={active} collapsed={collapsed} onClick={() => navigate(r)} data-destination={r.view} />
  }

  // The More group (app-shell "Sidebar structure"): the less frequent destinations,
  // collapsed by default on this device; a promoted destination (appearance
  // preferences, synced) leaves it for the primary items.
  const promoted = appearance.sidebar ?? []
  const unreadBadge = unread.total > 0 ? <UnreadBadge n={unread.total} label={t('unread updates')} /> : undefined
  // The weekly review (stats-and-review): when the last one was, and a marker once it is due.
  const due = reviewDue(review?.completed_at)
  const reviewBadge = due
    ? <span data-review-due><Badge hue="orange">{t('Due')}</Badge><span className="sr-only">{`: ${t('the last weekly review was {ago}', { ago: reviewAgo(review?.completed_at) })}`}</span></span>
    : <span className="text-hint text-faint" data-review-ago>{reviewAgo(review?.completed_at)}</span>
  const more: { id: Promotable | 'ask' | 'review' | 'stats'; node: ReactNode }[] = [
    { id: 'anytime', node: item({ view: 'anytime' }, t('Anytime'), 'layers') },
    { id: 'someday', node: item({ view: 'someday' }, t('Someday'), 'archive') },
    // Assigned to me only where tasks can be assigned: when the account shares a project.
    ...(sharedIds.size > 0 ? [{ id: 'assigned' as const, node: item({ view: 'assigned' }, t('Assigned to me'), 'user-check') }] : []),
    { id: 'completed', node: item({ view: 'completed' }, t('Completed'), 'circle-check-big') },
    { id: 'review', node: item({ view: 'review' }, t('Review'), 'clipboard-check', undefined, reviewBadge) },
    { id: 'stats', node: item({ view: 'stats' }, t('Statistics'), 'chart-column') },
    ...(sharedIds.size > 0 ? [{ id: 'feed' as const, node: item({ view: 'feed' }, t('Updates'), 'newspaper', undefined, unreadBadge) }] : []),
    { id: 'trash', node: item({ view: 'trash' }, t('Trash'), 'trash-2') },
    { id: 'filter', node: item({ view: 'filter' }, t('Filter'), 'filter') },
    ...(assistant?.available ? [{ id: 'ask' as const, node: item({ view: 'ask' }, t('Ask'), 'message-circle') }] : []),
  ]
  const primaryExtra = more.filter((m) => m.id !== 'ask' && promoted.includes(m.id as Promotable))
  // A due review shows on the closed More heading too, so the marker is never hidden.
  const moreBadge = unreadBadge ?? (due ? <span data-review-due-more><Badge hue="orange">{t('Review due')}</Badge></span> : undefined)
  const rest = more.filter((m) => !primaryExtra.includes(m))
  const calendarMode = readCalendarMode()

  return (
    // One scroller (ux-overhaul, app-shell "Sidebar structure"): the name and the
    // primary destinations stay at the top, Help and the account at the bottom, and
    // only the filters, projects and labels between them scroll.
    <div className="flex h-full flex-col" data-sidebar-collapsed={collapsed || undefined}>
      <div className={`shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] ${collapsed ? 'px-1.5' : 'px-3'}`}>
        <div className={`mb-4 flex items-center gap-2 ${collapsed ? 'justify-center' : 'px-1'}`}>
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          {!collapsed && <span className="font-semibold">{t('OpenTodo')}</span>}
        </div>
        <nav className="space-y-0.5" aria-label={t('Primary')} data-sidebar-primary>
          {item({ view: 'inbox' }, t('Inbox'), 'inbox', counts.inbox)}
          {item({ view: 'today' }, t('Today'), 'calendar-check', counts.today)}
          {item({ view: 'upcoming' }, t('Upcoming'), 'calendar-days')}
          {item({ view: calendarMode }, t('Calendar'), 'calendar-range')}
          {primaryExtra.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
        </nav>
        <SidebarGroup title={t('More')} collapsible open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} badge={moreBadge} collapsed={collapsed} tight testId="sidebar-more">
          {rest.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
        </SidebarGroup>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-scroll>
      {finding && !collapsed && (
        <div className="pt-3" data-sidebar-find>
          <input ref={findInput} className="ui-input py-1.5 text-body" type="search" placeholder={t('Find a project, label or filter…')} aria-label={t('Find in the sidebar')}
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onFindKey} enterKeyHint="go" autoComplete="off" />
          {found?.empty && <p className="px-2 pt-2 text-meta text-faint" role="status">{t('Nothing matches.')}</p>}
        </div>
      )}
      {groupShown(shownViews.length) && <SidebarGroup title={t('Filters')} collapsible open={isOpen('filters')} onToggle={() => toggleGroup('filters')} count={pinnedViews.length} collapsed={collapsed}
        actions={<SidebarGroupAction active={route.view === 'views'} onClick={() => navigate({ view: 'views' })} aria-label={t('All filters')}>{t('All')}</SidebarGroupAction>}>
        {shownViews.map((v) => {
          const active = route.view === 'view' && route.id === v.id
          const c = viewCounts.get(v.id)
          return (
            <div key={v.id} className="group flex items-center">
              <SidebarItem data-view-id={v.id} active={active} collapsed={collapsed} onClick={() => navigate({ view: 'view', id: v.id })} label={v.name}
                data-find-active={isActiveMatch('view', v.id) || undefined} className={isActiveMatch('view', v.id) ? 'ring-2 ring-focus' : undefined}
                leading={<span style={{ color: v.color }}><Icon name={viewIcon(v)} /></span>}
                count={!isDashboard(v) && c && c.ok ? c.count : undefined}
                badge={!isDashboard(v) && c && !c.ok ? <span className="text-meta text-danger"><ReadAs label={c.error}>!</ReadAs></span> : undefined} />
              {!collapsed && <ViewMenu view={v} className="hover-reveal" />}
            </div>
          )
        })}
        {pinnedViews.length === 0 && !collapsed && !found && (
          <p className="px-2 py-1 text-meta text-faint">{t('Save a filter to pin it here.')}</p>
        )}
      </SidebarGroup>}
      {/* Projects stays while finding: its header holds the field's opener. */}
      {(finding || groupShown(shownRows.length)) && <SidebarGroup title={t('Projects')} collapsible open={isOpen('projects')} onToggle={() => toggleGroup('projects')} count={projects.length} collapsed={collapsed} actions={(<>
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
                className={`relative flex items-center rounded-control ${drop === 'inside' ? 'ring-2 ring-accent' : ''}`} style={{ paddingLeft: collapsed ? 0 : `${Math.min(n.depth, MAX_INDENT) * INDENT_REM}rem` }}>
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
                  count={count}
                  aria-description={count && isCollapsed && has ? t('Open tasks including sub-projects') : undefined}
                />
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
      {groupShown(shownLabels.length) && <SidebarGroup title={t('Labels')} collapsible open={isOpen('labels')} onToggle={() => toggleGroup('labels')} count={labels.length} collapsed={collapsed}
        actions={<>
          <SidebarGroupAction active={route.view === 'labels'} onClick={() => navigate({ view: 'labels' })} aria-label={t('All labels')}>{t('All')}</SidebarGroupAction>
          <SidebarGroupAction onClick={() => { setGroupOpen('labels', true); setAddingLabel(true) }} aria-label={t('New label')}><Icon name="plus" size="xs" /></SidebarGroupAction>
        </>}>
        {!collapsed && shownLabels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={labelDrag.drop} onDragStart={labelDrag.start} findActive={isActiveMatch('label', l.id)} />)}
        {addingLabel && !collapsed && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
        {labels.length === 0 && !addingLabel && !collapsed && !found && <p className="px-2 py-1 text-meta text-faint">{t('No labels yet.')}</p>}
      </SidebarGroup>}
      </div>
      {/* Pinned footer (app-shell "No desktop top bar"): Help, search, notifications, the sync dot, the account, collapse. */}
      <div className={`flex shrink-0 flex-col gap-0.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-footer>
        <SidebarItem icon="circle-help" label={t('Help')} active={route.view === 'help'} collapsed={collapsed} onClick={() => navigate({ view: 'help' })} />
        {onSearch && <SidebarItem icon="search" label={t('Search and commands')} collapsed={collapsed} onClick={onSearch} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-palette-button />}
        <div className={`flex items-center gap-0.5 ${collapsed ? 'flex-col' : ''}`}>
          <NotificationBell compact={collapsed} />
          {onAssistant && <IconButton icon="message-circle" label={t('Assistant')} shortcut={keysOf('global.assistant')} size="sm" onClick={onAssistant} aria-haspopup="dialog" data-assistant-launcher />}
          {onShortcuts && <IconButton icon="keyboard" label={t('Keyboard shortcuts')} shortcut={keysOf('global.help')} size="sm" onClick={onShortcuts} aria-haspopup="dialog" data-shortcuts-button />}
          <SyncStatus compact={collapsed} />
          {!collapsed && <span className="flex-1" />}
          {onToggleCollapse && (
            <IconButton icon={collapsed ? 'panel-left-open' : 'panel-left-close'} label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')} shortcut={keysOf('global.sidebar')} size="sm"
              className="hidden lg:inline-flex" onClick={onToggleCollapse} data-sidebar-collapse aria-pressed={collapsed} />
          )}
        </div>
        <SidebarItem active={route.view === 'settings' || route.view === 'import'} collapsed={collapsed} onClick={() => navigate({ view: 'settings' })}
          leading={<span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-hint font-semibold text-on-accent">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>}
          label={user.name || user.email} badge={<span className="text-faint" aria-hidden="true"><Icon name="settings" /></span>} />
      </div>
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
