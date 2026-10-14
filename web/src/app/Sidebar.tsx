import { Icon, type IconName } from '../ui/Icon'
import { ProjectPickerField } from './ProjectPickerField'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { db, getMeta } from '../lib/db'
import { localDueOf, todayISO } from '../lib/dates'
import { createProject } from '../lib/ops'
import { COLLAPSED_PROJECTS_KEY, buildProjectTree, expandAncestorsOf, openCountsByProject, toggleCollapsedProject, type ProjectNode } from '../lib/projects'
import { flattenTree } from '../lib/tree'
import type { User } from '../lib/types'
import { evaluateViews, isDashboard } from '../lib/views'
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

const ACTIVE = 'bg-accent-soft font-medium text-on-accent-soft'
const IDLE = 'text-muted hover:bg-sunken dark:hover:bg-raised'

/** Indentation per level in the sidebar; capped so a deep tree still fits a 360 px screen. */
const INDENT_REM = 0.75

export function Sidebar({ route, user }: { route: Route; user: User }) {
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
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds])
  const tree = useMemo(() => buildProjectTree(projects), [projects])
  const rows = useMemo(() => flattenTree(tree.roots, (id) => collapsed.has(id)), [tree, collapsed])

  // Unread activity in shared projects (activity-feed): a live query over the local
  // activity log and the synced seen markers, so it moves with every sync.
  const unread = useLiveQuery(() => unreadCounts(), [], { byProject: new Map(), total: 0 } as UnreadCounts)

  // Trash count (trash-and-history): deleted tasks and projects known locally.
  const trashCount = useLiveQuery(async () => (await db.tasks.filter((t) => !!t.deleted_at).count()) + (await db.projects.filter((p) => !!p.deleted_at).count()), [], 0)
  const openTasks = useLiveQuery(() => visibleTasks().then((l) => l.filter((t) => !t.completed_at)), [], [])
  const zone = useViewerZone()
  const counts = useMemo(() => {
    const today = todayISO()
    let inbox = 0
    let due = 0
    let assigned = 0
    for (const t of openTasks) {
      if (t.project_id === null) inbox++
      if (t.due && localDueOf(t.due).date <= today) due++
      if (t.assignee_id === user.id) assigned++
    }
    return { inbox, today: due, assigned, byProject: openCountsByProject(openTasks, tree, collapsed) }
  }, [openTasks, tree, collapsed, user.id, zone])

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
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed
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
      if (has && !collapsed.has(n.id)) void toggleCollapsedProject(n.id, true)
      else focusRow(n.parent)
    } else if (has && collapsed.has(n.id)) void toggleCollapsedProject(n.id, false)
    else if (has) focusRow(n.children[0].id)
  }

  const item = (r: Route, label: string, icon: IconName, count?: number) => {
    // Day and Week stay highlighted whatever date they show.
    const active = r.view === 'day' || r.view === 'week' ? route.view === r.view : JSON.stringify(r) === JSON.stringify(route)
    return (
      <button key={label} onClick={() => navigate(r)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? ACTIVE : IDLE}`}>
        <span className="flex w-5 justify-center text-muted"><Icon name={icon} /></span>
        <span className="flex-1 truncate">{label}</span>
        {count ? <span className="text-xs text-faint">{count}</span> : null}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mb-4 flex items-center gap-2 px-1">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="font-semibold">OpenTodo</span>
      </div>
      <nav className="space-y-0.5">
        {item({ view: 'inbox' }, 'Inbox', 'inbox', counts.inbox)}
        {item({ view: 'today' }, 'Today', 'calendar-check', counts.today)}
        {item({ view: 'upcoming' }, 'Upcoming', 'calendar-days')}
        {item({ view: 'assigned' }, 'Assigned to me', 'user-check', counts.assigned)}
        {item({ view: 'day' }, 'Day', 'clock')}
        {item({ view: 'week' }, 'Week', 'calendar-range')}
        {item({ view: 'completed' }, 'Completed', 'circle-check-big')}
        {item({ view: 'filter' }, 'Filter', 'filter')}
        {item({ view: 'trash' }, 'Trash', 'trash-2', trashCount)}
        {sharedIds.size > 0 && (
          <button onClick={() => navigate({ view: 'feed' })} title='Activity in shared projects (g h)'
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'feed' ? ACTIVE : IDLE}`}>
            <span className="flex w-5 justify-center text-muted"><Icon name="newspaper" /></span>
            <span className="flex-1 truncate">Activity</span>
            {unread.total > 0 && <UnreadBadge n={unread.total} label="unread in shared projects" />}
          </button>
        )}
      </nav>
      <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-faint">
        Views
        <button className={`rounded px-1 text-[10px] normal-case hover:bg-sunken dark:hover:bg-raised ${route.view === 'views' ? 'text-accent' : ''}`}
          onClick={() => navigate({ view: 'views' })} title="All views (g v)">All</button>
      </div>
      <nav className="space-y-0.5" aria-label="Views">
        {pinnedViews.map((v) => {
          const active = route.view === 'view' && route.id === v.id
          const c = viewCounts.get(v.id)
          return (
            <div key={v.id} className={`group flex items-center rounded-md ${active ? ACTIVE : IDLE}`}>
              <button data-view-id={v.id} onClick={() => navigate({ view: 'view', id: v.id })} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                <span className="flex w-5 justify-center" style={{ color: v.color }}><Icon name={viewIcon(v)} /></span>
                <span className="flex-1 truncate">{v.name}</span>
                {!isDashboard(v) && c && (c.ok ? (c.count ? <span className="text-xs text-faint">{c.count}</span> : null) : <span className="text-xs text-danger" title={c.error}>!</span>)}
              </button>
              <ViewMenu view={v} className="hover-reveal" />
            </div>
          )
        })}
        {pinnedViews.length === 0 && (
          <p className="px-2 py-1 text-xs text-faint">Save a filter with <span className="kbd">s</span> to pin it here.</p>
        )}
      </nav>
      <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-faint">
        Projects
        <button className="rounded px-1 text-base leading-none hover:bg-sunken dark:hover:bg-raised" onClick={startAdding} title="New project">+</button>
      </div>
      <nav className="min-h-48 flex-1 space-y-0.5 overflow-y-auto" aria-label="Projects">
        <ul role="tree">
          {rows.map((n) => {
            const p = n.item
            const has = n.children.length > 0
            const isCollapsed = collapsed.has(n.id)
            const count = counts.byProject.get(n.id)
            const drop = dropAt?.id === n.id ? dropAt.zone : null
            return (
              <li key={n.id} role="treeitem" aria-level={n.depth + 1} aria-expanded={has ? !isCollapsed : undefined}
                data-project-row={n.id} data-drop-target={`project:${n.id}`}
                onPointerDown={movable(n.id) ? (e) => startDrag(e, n) : undefined}
                className={`relative flex items-center rounded-md ${drop === 'inside' ? 'ring-2 ring-accent' : ''}`} style={{ paddingLeft: `${Math.min(n.depth, MAX_INDENT) * INDENT_REM}rem` }}>
                {(drop === 'before' || drop === 'after') && (
                  <span aria-hidden="true" data-drop-indicator={drop}
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-accent ${drop === 'before' ? '-top-px' : '-bottom-px'}`} />
                )}
                <span className="flex h-6 w-4 shrink-0 items-center justify-center">
                  {has && (
                    <button type="button" tabIndex={-1} aria-label={isCollapsed ? `Expand ${p.name}` : `Collapse ${p.name}`}
                      onClick={() => void toggleCollapsedProject(n.id)}
                      className="flex h-5 w-4 items-center justify-center rounded text-xs text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised">
                      <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${isCollapsed ? '' : 'rotate-90'}`} />
                    </button>
                  )}
                </span>
                <button
                  data-project-id={n.id}
                  onClick={() => navigate({ view: 'project', id: n.id })}
                  onKeyDown={(e) => onRowKey(e, n)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'project' && route.id === n.id ? ACTIVE : IDLE}`}
                >
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {sharedIds.has(n.id) && (
                    <span className="text-faint" title="Shared project" aria-label="Shared">
                      <Icon name="users" size={14} />
                    </span>
                  )}
                  {unread.byProject.get(n.id) ? <UnreadBadge n={unread.byProject.get(n.id) as number} label="unread changes" /> : null}
                  {count ? <span className="text-xs text-faint" title={isCollapsed && has ? 'Open tasks including sub-projects' : 'Open tasks'}>{count}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        {adding && (
          <form onSubmit={(e) => void submit(e)} className="space-y-1 px-1 pt-1">
            <input className="input" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            <ProjectPickerField label="Parent project" projects={projects} value={parentId || null} onChange={(id) => setParentId(id ?? '')}
              rankContext="project.parent" inbox={false} noneLabel="Top level" className="py-1 text-xs" />
            <div className="flex gap-1">
              <button type="submit" className="btn-primary flex-1 text-xs">Create</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </form>
        )}
        {projects.length === 0 && !adding && <p className="px-2 py-1 text-xs text-faint">No projects yet.</p>}

        <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-faint">
          <button className="flex items-center gap-1 uppercase hover:text-muted" onClick={() => setLabelsOpen((v) => !v)} aria-expanded={labelsOpen}>
            <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${labelsOpen ? 'rotate-90' : ''}`} />Labels
          </button>
          <span className="flex items-center gap-1">
            <button className={`rounded px-1 text-[10px] normal-case hover:bg-sunken dark:hover:bg-raised ${route.view === 'labels' ? 'text-accent' : ''}`} onClick={() => navigate({ view: 'labels' })} title="All labels (g l)">All</button>
            <button className="rounded px-1 text-base leading-none hover:bg-sunken dark:hover:bg-raised" onClick={() => { setLabelsOpen(true); setAddingLabel(true) }} title="New label" aria-label="New label"><Icon name="plus" size="xs" /></button>
          </span>
        </div>
        {labelsOpen && (
          <div className="space-y-0.5">
            {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} drop={labelDrag.drop} onDragStart={labelDrag.start} />)}
            {addingLabel && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
            {labels.length === 0 && !addingLabel && <p className="px-2 py-1 text-xs text-faint">No labels yet.</p>}
          </div>
        )}
      </nav>
      <button onClick={() => navigate({ view: 'help' })} title="Help and guides (g then ?)"
        className={`mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'help' ? 'bg-accent-soft text-on-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}>
        <span className="flex h-6 w-6 items-center justify-center text-muted"><Icon name="circle-help" /></span>
        <span className="flex-1 text-muted">Help</span>
      </button>
      <button onClick={() => navigate({ view: 'settings' })}
        className={`mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'settings' || route.view === 'import' ? 'bg-accent-soft text-on-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
          {(user.name || user.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-muted">{user.name || user.email}</span>
        <span className="text-faint"><Icon name="settings" /></span>
      </button>
    </div>
  )
}

/** Unread activity count (activity-feed): others' changes since the project's activity was last seen. */
function UnreadBadge({ n, label }: { n: number; label: string }) {
  const text = formatUnread(n)
  return (
    <span data-unread-count={n} title={`${text} ${label}`} aria-label={`${text} ${label}`}
      className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-on-accent">{text}</span>
  )
}
