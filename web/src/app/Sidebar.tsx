import { Button, Icon, IconButton, type IconName, isIconName, SidebarGroup, SidebarGroupAction, SidebarItem } from '../ui'
import { ProjectPickerField } from './ProjectPickerField'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { readAppearance, type Promotable } from '../lib/appearance'
import { useAssistantStatus } from '../lib/assistantStatus'
import { readCalendarMode } from '../lib/calendarMode'
import { db, getMeta } from '../lib/db'
import { todayISO } from '../lib/dates'
import { createProject } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { NotificationBell } from './NotificationBell'
import { SyncStatus } from './SyncStatus'
import { COLLAPSED_PROJECTS_KEY, buildProjectTree, expandAncestorsOf, openCountsByProject, toggleCollapsedProject, type ProjectNode } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { Project, User } from '../lib/types'
import { evaluateViews, inToday, isDashboard, openCount } from '../lib/views'
import { LabelRow, NewLabelForm, useLabelData, useLabelDrag } from './LabelsView'
import { ViewMenu, viewIcon } from './ViewsView'
import { useViewerZone, useViews } from './useViews'
import { MAX_INDENT } from './TaskRow'
import { navigate, type Route } from './router'
import { visibleTasks } from '../lib/trash'
import { beginDrag } from '../lib/dnd'
import { moveProjectBy, moveProjectTo } from '../lib/move'
import { canEditProject, roleOf } from '../lib/sharing'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from './listDrop'
import { formatUnread, unreadCounts, type UnreadCounts } from '../lib/feed'


/** Indentation per level in the sidebar; capped so a deep tree still fits a 360 px screen. */
const INDENT_REM = 0.75

/** Whether the More group is open on this device (closed by default). */
const MORE_KEY = 'ot.sidebar.more'
function readMoreOpen(): boolean {
  try { return localStorage.getItem(MORE_KEY) === '1' } catch { return false }
}
function writeMoreOpen(open: boolean): void {
  try { localStorage.setItem(MORE_KEY, open ? '1' : '0') } catch { /* device state only */ }
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
  const assistant = useAssistantStatus()
  // Promoted destinations (appearance preferences, synced): read with the rest of the row.
  const prefsRow = useLiveQuery(() => db.userPrefs.get(USER_PREFS_ID), [])
  const appearance = useMemo(() => readAppearance(prefsRow), [prefsRow])
  const [moreOpen, setMoreOpenState] = useState(() => readMoreOpen())
  const setMoreOpen = (open: boolean) => { setMoreOpenState(open); writeMoreOpen(open) }
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
  const collapsedIds = useLiveQuery(() => getMeta<string[]>(COLLAPSED_PROJECTS_KEY, []), [], [] as string[])
  const collapsed_ = useMemo(() => new Set(collapsedIds), [collapsedIds])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const rows = useMemo(() => flattenTree(tree.roots, (id) => collapsed_.has(id)), [tree, collapsed_])

  // Unread activity in shared projects (activity-feed): a live query over the local
  // activity log and the synced seen markers, so it moves with every sync.
  const unread = useLiveQuery(() => unreadCounts(), [], { byProject: new Map(), total: 0 } as UnreadCounts)

  const openTasks = useLiveQuery(() => visibleTasks().then((l) => l.filter((t) => !t.completed_at)), [], [])
  const zone = useViewerZone()
  const counts = useMemo(() => {
    const today = todayISO()
    let inbox = 0
    let due = 0
    let assigned = 0
    // Deferred and parked tasks are not counted (someday-and-evening D2).
    const active = openTasks.filter((t) => openCount(t, today))
    for (const t of active) {
      if (t.project_id === null) inbox++
      if (t.assignee_id === user.id) assigned++
    }
    for (const t of openTasks) if (inToday(t, today)) due++
    return { inbox, today: due, assigned, byProject: openCountsByProject(active, tree, collapsed_) }
  }, [openTasks, tree, collapsed_, user.id, zone])

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
    () => evaluateViews(pinnedViews, { today: todayISO(), labels, projects: allProjects, tasks: openTasks }, 0),
    [pinnedViews, labels, allProjects, openTasks],
  )
  const [labelsOpen, setLabelsOpen] = useState(true)
  const [addingLabel, setAddingLabel] = useState(false)
  const [parentId, setParentId] = useState('')

  function startAdding() {
    setParentId(route.view === 'project' && tree.nodes.has(route.id) ? route.id : '')
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
        const t = dropTarget({ id: row.id, parent: row.parent, expanded: row.children.length > 0 && !collapsedRef.current.has(row.id) }, d.zone)
        if (t.parent_id) void toggleCollapsedProject(t.parent_id, false)
        void moveProjectTo(n.id, t)
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
      void moveProjectBy(n.id, e.shiftKey ? (up ? 'top' : 'bottom') : up ? -1 : 1)
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
    // Day and Week are one Calendar destination (ux-overhaul).
    const active = r.view === 'day' || r.view === 'week' ? route.view === 'day' || route.view === 'week' : JSON.stringify(r) === JSON.stringify(route)
    return <SidebarItem key={label} icon={icon} label={label} count={count} badge={badge} active={active} collapsed={collapsed} onClick={() => navigate(r)} data-destination={r.view} />
  }

  // The More group (app-shell "Sidebar structure"): the less frequent destinations,
  // collapsed by default on this device; a promoted destination (appearance
  // preferences, synced) leaves it for the primary items.
  const promoted = appearance.sidebar ?? []
  const unreadBadge = unread.total > 0 ? <UnreadBadge n={unread.total} label="unread updates" /> : undefined
  const more: { id: Promotable | 'ask'; node: ReactNode }[] = [
    { id: 'anytime', node: item({ view: 'anytime' }, 'Anytime', 'layers') },
    { id: 'someday', node: item({ view: 'someday' }, 'Someday', 'archive') },
    // Assigned to me only where tasks can be assigned: when the account shares a project.
    ...(sharedIds.size > 0 ? [{ id: 'assigned' as const, node: item({ view: 'assigned' }, 'Assigned to me', 'user-check') }] : []),
    { id: 'completed', node: item({ view: 'completed' }, 'Completed', 'circle-check-big') },
    ...(sharedIds.size > 0 ? [{ id: 'feed' as const, node: item({ view: 'feed' }, 'Updates', 'newspaper', undefined, unreadBadge) }] : []),
    { id: 'trash', node: item({ view: 'trash' }, 'Trash', 'trash-2') },
    { id: 'filter', node: item({ view: 'filter' }, 'Filter', 'filter') },
    ...(assistant?.available ? [{ id: 'ask' as const, node: item({ view: 'ask' }, 'Ask', 'message-circle') }] : []),
  ]
  const primaryExtra = more.filter((m) => m.id !== 'ask' && promoted.includes(m.id as Promotable))
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
          {!collapsed && <span className="font-semibold">OpenTodo</span>}
        </div>
        <nav className="space-y-0.5" aria-label="Primary" data-sidebar-primary>
          {item({ view: 'inbox' }, 'Inbox', 'inbox', counts.inbox)}
          {item({ view: 'today' }, 'Today', 'calendar-check', counts.today)}
          {item({ view: 'upcoming' }, 'Upcoming', 'calendar-days')}
          {item({ view: calendarMode }, 'Calendar', 'calendar-range')}
          {primaryExtra.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
        </nav>
        <SidebarGroup title="More" collapsible open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} badge={unreadBadge} collapsed={collapsed} tight testId="sidebar-more">
          {rest.map((m) => <Fragment key={m.id}>{m.node}</Fragment>)}
        </SidebarGroup>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-scroll>
      <SidebarGroup title="Filters" collapsed={collapsed} actions={<SidebarGroupAction active={route.view === 'views'} onClick={() => navigate({ view: 'views' })} aria-label="All filters">All</SidebarGroupAction>}>
        {pinnedViews.map((v) => {
          const active = route.view === 'view' && route.id === v.id
          const c = viewCounts.get(v.id)
          return (
            <div key={v.id} className="group flex items-center">
              <SidebarItem data-view-id={v.id} active={active} collapsed={collapsed} onClick={() => navigate({ view: 'view', id: v.id })} label={v.name}
                leading={<span style={{ color: v.color }}><Icon name={viewIcon(v)} /></span>}
                count={!isDashboard(v) && c && c.ok ? c.count : undefined}
                badge={!isDashboard(v) && c && !c.ok ? <span className="text-meta text-danger" aria-label={c.error}>!</span> : undefined} />
              {!collapsed && <ViewMenu view={v} className="hover-reveal" />}
            </div>
          )
        })}
        {pinnedViews.length === 0 && !collapsed && (
          <p className="px-2 py-1 text-meta text-faint">Save a filter with <span className="ui-kbd">s</span> to pin it here.</p>
        )}
      </SidebarGroup>
      <SidebarGroup title="Projects" collapsed={collapsed} actions={<SidebarGroupAction onClick={startAdding} aria-label="New project"><Icon name="plus" size="xs" /></SidebarGroupAction>}>
        <ul role="tree">
          {rows.map((n) => {
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
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-accent ${drop === 'before' ? '-top-px' : '-bottom-px'}`} />
                )}
                {!collapsed && (
                  <span className="flex h-6 w-4 shrink-0 items-center justify-center">
                    {has && (
                      <button type="button" tabIndex={-1} aria-label={isCollapsed ? `Expand ${p.name}` : `Collapse ${p.name}`}
                        onClick={() => void toggleCollapsedProject(n.id)}
                        className="flex h-5 w-4 items-center justify-center rounded-chip text-meta text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised">
                        <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${isCollapsed ? '' : 'rotate-90'}`} />
                      </button>
                    )}
                  </span>
                )}
                <SidebarItem
                  data-project-id={n.id}
                  depth={n.depth}
                  active={route.view === 'project' && route.id === n.id}
                  collapsed={collapsed}
                  onClick={() => navigate({ view: 'project', id: n.id })}
                  onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => onRowKey(e, n)}
                  label={p.name}
                  leading={<ProjectMark project={p} />}
                  badge={<>
                    {sharedIds.has(n.id) && <span className="text-faint" aria-label="Shared project"><Icon name="users" size={14} /></span>}
                    {unread.byProject.get(n.id) ? <UnreadBadge n={unread.byProject.get(n.id) as number} label="unread changes" /> : null}
                  </>}
                  count={count}
                  aria-description={count && isCollapsed && has ? 'Open tasks including sub-projects' : undefined}
                />
              </li>
            )
          })}
        </ul>
        {adding && !collapsed && (
          <form onSubmit={(e) => void submit(e)} className="space-y-1 px-1 pt-1">
            <input className="ui-input" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <ProjectPickerField label="Parent project" projects={projects} value={parentId || null} onChange={(id) => setParentId(id ?? '')}
              rankContext="project.parent" inbox={false} noneLabel="Top level" className="py-1 text-meta" />
            <div className="flex gap-1">
              <Button type="submit" variant="primary" size="sm" className="flex-1">Create</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {projects.length === 0 && !adding && !collapsed && <p className="px-2 py-1 text-meta text-faint">No projects yet.</p>}
      </SidebarGroup>
      <SidebarGroup title="Labels" collapsible open={labelsOpen} onToggle={() => setLabelsOpen((v) => !v)} collapsed={collapsed}
        actions={<>
          <SidebarGroupAction active={route.view === 'labels'} onClick={() => navigate({ view: 'labels' })} aria-label="All labels">All</SidebarGroupAction>
          <SidebarGroupAction onClick={() => { setLabelsOpen(true); setAddingLabel(true) }} aria-label="New label"><Icon name="plus" size="xs" /></SidebarGroupAction>
        </>}>
        {!collapsed && labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={labelDrag.drop} onDragStart={labelDrag.start} />)}
        {addingLabel && !collapsed && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
        {labels.length === 0 && !addingLabel && !collapsed && <p className="px-2 py-1 text-meta text-faint">No labels yet.</p>}
      </SidebarGroup>
      </div>
      {/* Pinned footer (app-shell "No desktop top bar"): Help, search, notifications, the sync dot, the account, collapse. */}
      <div className={`flex shrink-0 flex-col gap-0.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 ${collapsed ? 'px-1.5' : 'px-3'}`} data-sidebar-footer>
        <SidebarItem icon="circle-help" label="Help" active={route.view === 'help'} collapsed={collapsed} onClick={() => navigate({ view: 'help' })} />
        {onSearch && <SidebarItem icon="search" label="Search and commands" collapsed={collapsed} onClick={onSearch} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" data-palette-button />}
        <div className={`flex items-center gap-0.5 ${collapsed ? 'flex-col' : ''}`}>
          <NotificationBell compact={collapsed} />
          {onAssistant && <IconButton icon="message-circle" label="Assistant" shortcut="Shift+I" size="sm" onClick={onAssistant} aria-haspopup="dialog" data-assistant-launcher />}
          {onShortcuts && <IconButton icon="keyboard" label="Keyboard shortcuts" shortcut="?" size="sm" onClick={onShortcuts} aria-haspopup="dialog" data-shortcuts-button />}
          <SyncStatus compact={collapsed} />
          {!collapsed && <span className="flex-1" />}
          {onToggleCollapse && (
            <IconButton icon={collapsed ? 'panel-left-open' : 'panel-left-close'} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} shortcut="[" size="sm"
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
    <span data-unread-count={n} title={`${text} ${label}`} aria-label={`${text} ${label}`}
      className="rounded-full bg-accent px-1.5 text-hint font-semibold leading-4 text-on-accent">{text}</span>
  )
}
