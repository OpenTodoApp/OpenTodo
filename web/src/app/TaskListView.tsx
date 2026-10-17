import { Button, EmptyState as EmptyStatePattern, Icon, IconButton, type IconName } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blockedMap } from '../lib/dependencies'
import { duplicateTask } from '../lib/templates'
import { db } from '../lib/db'
import { formatDateHeading, todayISO } from '../lib/dates'
import { inAnytime, inLater, isSomeday } from '../lib/views'
import { groupToday, groupUpcoming, projectOpenList, todayList, upcomingList, withoutArchived } from '../lib/dayLists'
import { byPosition, compareByPosition, compareDueThenPriority } from '../lib/ordering'
import { resolveLabels } from '../lib/labels'
import { createSubtask, createTask, detachOccurrence, setTaskParent, skipOccurrence, unparkTask, updateTask } from '../lib/ops'
import { breadcrumbOf, buildTaskTree, parentReadyToComplete, progressMap } from '../lib/subtasks'
import { habitStatsMap } from '../lib/habits'
import { DURATION_FILTERS, durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from '../lib/filters'
import { canEditTasks, memberName, roleOf } from '../lib/sharing'
import { flattenTree, type Tree, type TreeNode } from '../lib/tree'
import type { AccountRole, Label, Priority, Project, Section, Task } from '../lib/types'
import { TodayAskAction } from './assistant/AskEntry'
import { beginDrag } from '../lib/dnd'
import { moveTask, moveTaskBy, type Step } from '../lib/move'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from './listDrop'
import { ProjectNote } from './ProjectNote'
import { effectiveSection, groupBySection, loadCollapsedSections, loadListColumns, loadViewMode, moveTaskToSection, nextViewMode, saveListColumns, saveViewMode, setSectionCollapsed, type ProjectViewMode } from '../lib/sections'
import { liveFields } from '../lib/fields'
import { useFieldDefs } from './useFields'
import { FieldColumnsRow, FieldColumnsTable } from './FieldColumns'
import { TimelineView } from './TimelineView'
import { BoardView, sectionTarget, type BoardColumn } from './BoardView'
import { AddSection, SectionHeader, SectionQuickAdd } from './Sections'
import { LabelPicker } from './LabelPicker'
import { AssigneePicker } from './AssigneePicker'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { registerPanelHandlers, setPanelTaskId as setOpenId, usePanelTaskId } from './panel'
import { completeWithUndo, deleteWithUndo, parkWithUndo } from './undoable'
import { MAX_INDENT, TaskRow, type TaskRowProps } from './TaskRow'
import { navigate, type Route } from './router'
import { DEFAULT_DISPLAY_OPTIONS } from './display/displayOptions'
import { ProjectHeader } from './ProjectHeader'
import { offerArchiveAfterCompletion } from './ArchivePrompt'
import { SubProjects } from './SubProjects'
import { blockedByFocus, deadlineFocus, deferFocus, estimateFocus, openTask, placeInDay, selectTask } from './signals'
import { isActivationTarget, isTypingTarget, useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { keysOf } from '../lib/shortcuts'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { appendTo, groupBy } from '../lib/collections'
import { LOGBOOK_PAGE, logbookGroups, logbookHeading } from '../lib/logbook'
import { useViewerZone } from './useViews'
import { registerListState, taskDefaults } from './listActions'
import { useSelection } from './selection'
import { BulkActionsMenu, runBulk, SelectionBar } from './bulk/BulkActions'
import { Dialog, useFinePointer } from './overlay'
import { FirstRunCard, useFirstRun } from './FirstRun'
import { Menu } from './overlay/Menu'
import { DESKTOP_HEADER_QUERY, ListGroupHeader, MenuItem, MenuSeparator, PageHeader, Tooltip, useMediaQuery } from '../ui'
import { groupKey, setGroupCollapsed, useCollapsedGroups } from './collapsedGroups'

/** The guide section of each list page (user-documentation "Contextual help"); projects use their header's. */
const HELP_SCREENS: Partial<Record<Route['view'], string>> = {
  inbox: 'inbox', today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', completed: 'completed', assigned: 'assigned', label: 'label',
}
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap } from '../lib/i18n'
import { act } from './actionError'

type ListRoute = Exclude<Route, { view: 'trash' } | { view: 'feed' } | { view: 'settings' } | { view: 'import' } | { view: 'invite' } | { view: 'project-invite' } | { view: 'reset' } | { view: 'triage' } | { view: 'public' } | { view: 'labels' } | { view: 'filter' } | { view: 'share' } | { view: 'views' } | { view: 'view' } | { view: 'day' } | { view: 'week' } | { view: 'month' } | { view: 'help' } | { view: 'ask' } | { view: 'task' } | { view: 'forgot' } | { view: 'verify' } | { view: 'display' } | { view: 'review' } | { view: 'stats' }>

/** One rendered line: a task with its place in the (possibly flat) tree. */
/** The project layouts, in `v` order (month-and-timeline-views). */
const LAYOUT_LABEL = translatedMap<ProjectViewMode>({ list: msg('List'), board: msg('Board'), timeline: msg('Timeline') })

interface Row {
  task: Task
  depth: number
  /** Effective tree parent in this view; null at the top level. */
  parent: string | null
  hasChildren: boolean
  collapsed: boolean
  breadcrumb: string | null
}

interface Group {
  key: string
  heading: string | null
  rows: Row[]
  /** Project list grouped by section (board-view): the section (null = "No section"). */
  section?: Section | null
  /** Open tasks under the heading, also while it is collapsed. */
  count?: number
  sectionCollapsed?: boolean
  /** Today's Blocked group (task-dependencies): folded unless opened on this device. */
  folded?: boolean
  /** Always-visible trailing text of the header (the logbook's "3 done"). */
  note?: string
}

/** Set in the per-device collapse set when Today's Blocked group is open (it starts folded). */
export const BLOCKED_OPEN_KEY = 'today:blocked:open'

const COLLAPSE_KEY = 'opentodo.collapsed'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]))
  } catch {
    // Per-device convenience only; losing it is harmless.
  }
}

export function TaskListView({ route, userId, userRole }: { route: ListRoute; userId?: string; userRole?: AccountRole }) {
  const dt = useDateTimeFormat()
  const today = todayISO()
  // Zoned dues (absolute-datetimes) are grouped in the viewer zone; re-group when it changes.
  const zone = useViewerZone()
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const currentProject = route.view === 'project' ? projectMap.get(route.id) : undefined
  const treeView = route.view === 'project' || route.view === 'inbox'
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  // Cached memberships (project-sharing): viewers get a read-only project, also offline.
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const isReadOnly = useCallback((tk: Task | undefined) => !!tk && roleOf(tk.project_id, memberMap) === 'viewer', [memberMap])
  const projectReadOnly = route.view === 'project' && roleOf(route.id, memberMap) === 'viewer'
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const currentLabel = route.view === 'label' ? labelMap.get(route.id) : undefined

  // Every live task once; views, breadcrumbs and progress badges derive from this set,
  // so a remote op that lands in IndexedDB updates all of them without a reload. The
  // snapshot is shared with the sidebar and the panel (large-list-performance D2).
  const allTasks = useLiveTasks() ?? NO_TASKS
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks])
  const progress = useMemo(() => progressMap(allTasks), [allTasks])
  const blocked = useMemo(() => blockedMap(allTasks), [allTasks])
  // Streaks of habits (OpenSpec habits D5): once per list, from the rows it holds.
  const habits = useMemo(() => habitStatsMap(allTasks, today), [allTasks, today])

  // Duration filter chips (OpenSpec `time-blocking`): per view, per device.
  const filterKey = durationFilterKey(route)
  const [duration, setDuration] = useState<DurationFilter | null>(() => (filterKey ? loadDurationFilter(filterKey) : null))
  useEffect(() => {
    setDuration(filterKey ? loadDurationFilter(filterKey) : null)
  }, [filterKey])
  const chooseDuration = useCallback((kind: DurationFilter | null) => {
    if (!filterKey) return
    setDuration(kind)
    saveDurationFilter(filterKey, kind)
  }, [filterKey])

  const viewTasks = useMemo(() => {
    // Tasks of archived projects stay out of the cross-project views (lib/dayLists, shared with the display).
    const all = withoutArchived(allTasks, projects, route.view === 'project' ? route.id : undefined)
    switch (route.view) {
      case 'inbox':
        return all.filter((task) => !task.completed_at && task.project_id === null)
      case 'today':
        return todayList(all, today)
      case 'upcoming':
        return upcomingList(all, today)
      // Someday and Anytime (someday-and-evening D5), grouped by project below.
      case 'someday':
        return all.filter((task) => !task.completed_at && isSomeday(task)).sort(byPosition)
      case 'anytime':
        return all.filter((task) => inAnytime(task, today)).sort(byPosition)
      case 'completed':
        // The logbook pages through every completion (completed-date-filters D4);
        // a habit's skipped occurrence record is not a completion (habits D6).
        return all.filter((task) => task.completed_at && !task.skipped).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
      case 'project':
        return projectOpenList(all, route.id)
      case 'label':
        return all.filter((task) => !task.completed_at && task.labels.includes(route.id)).sort(byPosition)
      case 'assigned':
        return all.filter((task) => !task.completed_at && !!userId && task.assignee_id === userId).sort(compareDueThenPriority)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  }, [allTasks, projects, route, today, zone, userId])

  const tasks = useMemo(() => {
    if (!duration || !filterKey) return viewTasks
    const keep = durationPredicate(duration)
    return viewTasks.filter(keep)
  }, [viewTasks, duration, filterKey])

  // Completed renders a page of the logbook at a time; a new route starts again.
  const [logbookLimit, setLogbookLimit] = useState(LOGBOOK_PAGE)
  useEffect(() => setLogbookLimit(LOGBOOK_PAGE), [route.view])
  const logbook = useMemo(() => (route.view === 'completed' ? logbookGroups(tasks, logbookLimit) : null), [route.view, tasks, logbookLimit])

  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const toggleCollapsed = useCallback((id: string, force?: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      const want = force ?? !next.has(id)
      if (want) next.add(id)
      else next.delete(id)
      saveCollapsed(next)
      return next
    })
  }, [])

  // Project and Inbox lists keep deferred and parked tasks in a Later group at the
  // end (someday-and-evening D2); the board keeps every card in its column.
  const boardMode = useLiveQuery(() => (route.view === 'project' ? loadViewMode(route.id) : Promise.resolve('list' as const)), [route], 'list') === 'board'
  const laterTasks = useMemo(() => (treeView && !boardMode ? tasks.filter((task) => inLater(task, today)) : []), [treeView, boardMode, tasks, today])
  const treeTasks = useMemo(() => (laterTasks.length ? tasks.filter((task) => !inLater(task, today)) : tasks), [laterTasks, tasks, today])
  const tree = useMemo<Tree<Task> | null>(() => (treeView ? buildTaskTree(treeTasks) : null), [treeView, treeTasks])

  // Sections and the board (OpenSpec `board-view`). View mode and collapsed sections
  // are per-device preferences in the local meta table, never synced.
  const projectId = route.view === 'project' ? route.id : null
  const sections = useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).toArray() : Promise.resolve([] as Section[])), [projectId], [] as Section[],
  )
  const liveSections = useMemo(() => sections.filter((s) => !s.deleted_at), [sections])
  const viewMode = useLiveQuery(() => (projectId ? loadViewMode(projectId) : Promise.resolve('list' as const)), [projectId], 'list')
  const collapsedSections = useLiveQuery(
    () => (projectId ? loadCollapsedSections(projectId) : Promise.resolve([] as string[])), [projectId], [] as string[],
  )
  const board = !!projectId && viewMode === 'board'
  const timeline = !!projectId && viewMode === 'timeline'
  // Custom fields (custom-fields): the list's columns layout, offered on wide
  // screens when the project defines fields; below 768 px rows show badges.
  const fieldDefs = useFieldDefs()
  const projectFieldDefs = useMemo(() => liveFields(projectId, fieldDefs), [projectId, fieldDefs])
  const wideScreen = useMediaQuery(DESKTOP_HEADER_QUERY)
  const columnsPref = useLiveQuery(() => (projectId ? loadListColumns(projectId) : Promise.resolve(false)), [projectId], false)
  const offerColumns = !!projectId && viewMode === 'list' && wideScreen && projectFieldDefs.length > 0
  const fieldColumns = offerColumns && columnsPref
  const projectEditable = !!projectId && canEditTasks(roleOf(projectId, memberMap))
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  /** Top-level tasks of the project bucketed by section: list headings and board columns. */
  const sectionGroups = useMemo(() => {
    if (!projectId || !tree) return null
    const byId = new Map(tree.roots.map((n) => [n.id, n]))
    return groupBySection(projectId, tree.roots.map((n) => n.item), sections).map((g) => ({
      ...g, roots: g.tasks.map((task) => byId.get(task.id) as TreeNode<Task>),
    }))
  }, [projectId, tree, sections])
  // "No section" is a column only while it has open tasks (sections-and-boards).
  const columns = useMemo<BoardColumn[]>(
    () => (sectionGroups ?? []).filter((g) => g.key !== '' || g.tasks.length > 0).map((g) => ({ key: g.key, section: g.section, cards: g.tasks })), [sectionGroups],
  )
  const [currentColumn, setCurrentColumn] = useState<string | null>(null)
  // The row being dragged lifts (task-list-presentation "Drag feedback").
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const groups = useMemo<Group[]>(() => {
    const later: Group[] = laterTasks.length
      ? [{ key: 'later', heading: t('Later'), rows: laterTasks.map((task) => ({ task: task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: task.parent_id ? breadcrumbOf(task, taskMap) : null })) }]
      : []
    const toRow = (n: TreeNode<Task>): Row => ({
      task: n.item,
      depth: n.depth,
      parent: n.parent,
      hasChildren: n.children.length > 0,
      collapsed: collapsed.has(n.id),
      // A top-level task that still points at a parent (completed, deleted, missing) names it.
      breadcrumb: n.parent === null && n.item.parent_id ? breadcrumbOf(n.item, taskMap) : null,
    })
    if (board) {
      // Board: cards are top-level tasks, column by column (keyboard order).
      return columns.map((c) => ({
        key: c.key, heading: null, rows: c.cards.map((task) => ({ task: task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: null })),
      }))
    }
    if (sectionGroups && liveSections.length > 0) {
      // Project list with sections: "No section" first, then each section by position.
      const folded = new Set(collapsedSections)
      const bySection: Group[] = sectionGroups.filter((g) => g.section || g.roots.length > 0).map((g) => ({
        key: `section:${g.key}`,
        heading: g.section ? g.section.name : t('No section'),
        section: g.section,
        sectionCollapsed: folded.has(g.key),
        count: flattenTree(g.roots).length,
        rows: folded.has(g.key) ? [] : flattenTree(g.roots, (id) => collapsed.has(id)).map(toRow),
      }))
      return [...bySection, ...later]
    }
    if (tree) {
      // Project and Inbox: one depth-first pass over the built tree (linear in task count).
      return [{ key: 'all', heading: null, rows: flattenTree(tree.roots, (id) => collapsed.has(id)).map(toRow) }, ...later]
    }
    // Cross-project and date views: flat, each matching task once, with its parent named.
    const flatRow = (task: Task): Row => ({
      task: task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: task.parent_id ? breadcrumbOf(task, taskMap) : null,
    })
    if (route.view === 'today') {
      // Blocked tasks wait in their own group at the end (task-dependencies D7);
      // This Evening below the day's tasks (someday-and-evening).
      const { overdue, day, evening, blocked: waiting } = groupToday(tasks, today, blocked)
      const g: Group[] = []
      if (overdue.length) g.push({ key: 'overdue', heading: t('Overdue'), rows: overdue.map(flatRow) })
      g.push({ key: 'today', heading: overdue.length || evening.length ? t('Today') : null, rows: day.map(flatRow) })
      if (evening.length) g.push({ key: 'evening', heading: t('This Evening'), rows: evening.map(flatRow) })
      if (waiting.length) {
        const folded = !collapsed.has(BLOCKED_OPEN_KEY)
        g.push({ key: 'blocked', heading: t('Blocked'), count: waiting.length, folded, rows: folded ? [] : waiting.map(flatRow) })
      }
      return g
    }
    if (logbook) {
      // Completed as a logbook: one group per local completion day, newest first.
      return logbook.groups.map((g) => ({
        key: g.date, heading: logbookHeading(g.date, today, dt.resolved), note: `${g.tasks.length} done`, rows: g.tasks.map(flatRow),
      }))
    }
    if (route.view === 'upcoming') {
      return groupUpcoming(tasks).map(({ date, tasks: list }) => ({ key: date, heading: formatDateHeading(date, today, dt.resolved), rows: list.map(flatRow) }))
    }
    if (route.view === 'label' || route.view === 'assigned' || route.view === 'someday' || route.view === 'anytime') {
      // Grouped by project: Inbox first, then projects in sidebar order; flat rows with breadcrumbs.
      const byProject = groupBy(tasks, (tk) => tk.project_id ?? '')
      const order = ['', ...projects.slice().sort(compareByPosition).map((p) => p.id)]
      return order.filter((id) => byProject.has(id)).map((id) => ({
        key: id || 'inbox', heading: id ? projectMap.get(id)?.name ?? t('Project') : t('Inbox'), rows: byProject.get(id)!.map(flatRow),
      }))
    }
    return [{ key: 'all', heading: null, rows: tasks.map(flatRow) }]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  }, [dt.resolved, tree, tasks, laterTasks, route.view, today, zone, collapsed, blocked, taskMap, projects, projectMap, board, columns, sectionGroups, liveSections, collapsedSections, logbook])

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  // Each row's place among its visible siblings (assistive-tech-semantics): the tree's
  // aria-level, aria-posinset and aria-setsize, so a subtask is announced as one.
  const siblingPos = useMemo(() => {
    const out = new Map<string, { pos: number; size: number }>()
    for (const g of groups) {
      const sets = new Map<string | null, string[]>()
      for (const r of g.rows) appendTo(sets, r.parent, r.task.id)
      for (const ids of sets.values()) ids.forEach((id, i) => out.set(id, { pos: i + 1, size: ids.length }))
    }
    return out
  }, [groups])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Sections with only completed tasks keep a header with "n completed" and Show
  // (task-list-presentation "Empty groups"); date, project and Later groups collapse per device.
  const doneBySection = useMemo(() => {
    const m = new Map<string, Task[]>()
    if (!projectId) return m
    for (const task of allTasks) {
      if (task.project_id !== projectId || !task.completed_at || task.skipped) continue
      appendTo(m, effectiveSection(task, sectionMap) ?? '', task)
    }
    return m
  }, [allTasks, projectId, sectionMap])
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const collapsedGroups = useCollapsedGroups()
  // Bulk selection (bulk-edit D1): ticked rows, separate from the cursor row.
  const tickRows = useMemo(() => rows.map((r) => r.task.id), [rows])
  const readOnlyId = useCallback((id: string) => isReadOnly(taskMap.get(id)), [isReadOnly, taskMap])
  const selection = useSelection(tickRows, readOnlyId)
  const ticked = useMemo(() => tickRows.filter((id) => selection.ticked.has(id)), [tickRows, selection.ticked])
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsPicker, setActionsPicker] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const openActions = useCallback((picker: string | null = null) => { setActionsPicker(picker); setActionsOpen(true) }, [])
  // The open task lives in the shell's panel slot (app-shell D1); this view only selects and opens.
  const openId = usePanelTaskId()
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  /** Parent whose last open subtask was just completed; Enter completes it too. */
  const [prompt, setPrompt] = useState<Task | null>(null)
  /** Task whose label picker (`L`) is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  /** Task whose assignee picker (Shift+A) is open (task-assignment). */
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)
  const focusQuickAdd = useCallback(() => quickAddRef.current?.focus(), [])
  // The first run (first-run "Three-step first run"): the Inbox shows the card instead of its empty state.
  const showFirstRun = useFirstRun() && route.view === 'inbox'
  /** Section whose quick add is open ('' = "No section"), board-view. */
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const toggleViewMode = useCallback(() => {
    if (projectId) void saveViewMode(projectId, nextViewMode(viewMode))
  }, [projectId, viewMode])
  const chooseViewMode = useCallback((m: ProjectViewMode) => {
    if (projectId && m !== viewMode) void saveViewMode(projectId, m)
  }, [projectId, viewMode])
  const toggleSection = useCallback((key: string, force?: boolean) => {
    if (projectId) act(setSectionCollapsed(projectId, key, force ?? !collapsedSections.includes(key)))
  }, [projectId, collapsedSections])

  /** Move a top-level task to a section ('' = none); a no-op when it is already there. */
  const moveToSection = useCallback((task: Task, key: string) => {
    if ((effectiveSection(task, sectionMap) ?? '') === key) return
    act(moveTaskToSection(task.id, key || null))
  }, [sectionMap])

  // Manual ordering (OpenSpec `manual-ordering`): project lists and boards (editors
  // and above) and the Inbox. Date and filter views keep their own sort.
  const manual = (route.view === 'project' && projectEditable) || route.view === 'inbox'
  /** Section key ('' = "No section") of each top-level row or card in a sectioned project. */
  const sectionOfRow = useMemo(() => {
    const m = new Map<string, string>()
    if (board) for (const c of columns) for (const task of c.cards) m.set(task.id, c.key)
    else for (const g of groups) if (g.section !== undefined) for (const r of g.rows) if (r.parent === null) m.set(r.task.id, g.section?.id ?? '')
    return m
  }, [board, columns, groups])
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  // The drag session outlives renders; it reads the latest rows through this ref.
  const dragState = useRef({ rows, sectionOfRow, tree, board, sectionMap })
  dragState.current = { rows, sectionOfRow, tree, board, sectionMap }

  /**
   * Pointer drag (lib/dnd) of a row or card: onto another row places it before,
   * after or (list only) inside it; onto a section heading or column moves it to
   * the end of that section. Escape or a drop outside any list changes nothing.
   */
  const startDrag = useCallback((e: React.PointerEvent, task: Task) => {
    if (!manual) return
    const st = dragState.current
    const node = st.tree?.nodes.get(task.id)
    const own = new Set(node ? flattenTree([node]).map((n) => n.id) : [task.id])
    let current: DropAt | null = null
    const show = (d: DropAt | null) => {
      if (sameDrop(d, current)) return
      current = d
      setDropAt(d)
    }
    beginDrag(e, {
      label: task.title,
      onStart: () => setDraggingId(task.id),
      onMove: (target, _x, y) => {
        const id = target?.startsWith('task:') ? target.slice('task:'.length) : null
        const zone = id && !own.has(id) ? zoneUnder('data-task-id', id, y, !dragState.current.board) : null
        show(id && zone ? { id, zone } : null)
      },
      onDrop: (target) => {
        const { rows: rs, sectionOfRow: secs, board: b } = dragState.current
        if (target.startsWith('task:')) {
          const r = current ? rs.find((x) => x.task.id === current?.id) : undefined
          if (!r || !current) return
          const entry = dropTarget({ id: r.task.id, parent: r.parent, expanded: !b && r.hasChildren && !r.collapsed }, current.zone)
          const section = entry.parent_id === null ? secs.get(r.task.id) : undefined
          act(moveTask(task.id, { ...entry, ...(section !== undefined ? { section_id: section } : {}) }))
        } else if (target.startsWith('section:')) {
          const key = target.slice('section:'.length)
          const row = rs.find((x) => x.task.id === task.id)
          if (row && row.parent === null) moveToSection(task, key)
          else act(moveTask(task.id, { parent_id: null, section_id: key, at: 'bottom' }))
        } else return
        setSelectedId(task.id)
      },
      onEnd: () => { show(null); setDraggingId(null) },
    })
  }, [manual, moveToSection])

  useEffect(() => {
    // A pending "open this task" request (reminder toast, notification click) survives the route change.
    const want = openTask.take()
    // Leaving the triage mode selects the task it was on (inbox-triage), without opening it.
    const pick = want ?? selectTask.take()
    setSelectedId(pick)
    setOpenId(want)
    setAddingUnder(null)
    setPrompt(null)
    setPickerFor(null)
    setAssignFor(null)
    setAddingTo(null)
    selection.clear()
    setSelectMode(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a route change resets the list; selection is a new object on every row change
  }, [route])
  useEffect(() => openTask.subscribe((id) => {
    openTask.take(id)
    setSelectedId(id)
    setOpenId(id)
  }), [])


  // The prompt only makes sense while the parent is still open.
  useEffect(() => {
    if (prompt) {
      const p = taskMap.get(prompt.id)
      if (!p || p.completed_at) setPrompt(null)
    }
  }, [taskMap, prompt])

  /** Vim `o` (vim-keybindings): the task the next quick-add entry is placed after, if any. */
  const insertAfter = useRef<string | null>(null)

  // The view supplies defaults; attributes typed in the quick-add line override them.
  const onAdd = useCallback(async ({ labels: typed, ...rest }: QuickAddInput) => {
    // In Assigned to me a new task is yours (Inbox unless a #project was typed).
    const { labels: viewLabels, ...defaults } = taskDefaults(route, today, userId)
    // In Someday a line with a date is scheduled, not parked (someday-and-evening).
    if (rest.due || rest.deadline) delete defaults.start
    const id = await createTask({
      ...defaults,
      ...rest,
      // Labels are multi-valued: a label view's label is kept alongside typed @labels.
      labels: [...new Set([...viewLabels, ...(typed ?? [])])],
    })
    const after = insertAfter.current
    if (after) {
      // Opened with `o`: place it right after the anchor, as its sibling; the next entry follows it.
      insertAfter.current = id
      const anchor = await db.tasks.get(after)
      if (anchor) {
        await moveTask(id, {
          parent_id: anchor.parent_id,
          ...(anchor.parent_id === null ? { section_id: effectiveSection(anchor, dragState.current.sectionMap) } : {}),
          at: { after },
        })
      }
    }
  }, [route, today, userId])

  /** Complete or reopen; after completing the last open subtask, offer the parent (design D5). */
  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    await completeWithUndo(id, completed)
    if (!completed) {
      setPrompt((p) => (p?.id === id ? null : p))
      return
    }
    const parent = await parentReadyToComplete(id)
    setPrompt(parent)
    // The last open task of a project: offer one-key archiving (trash-and-history).
    if (!parent) await offerArchiveAfterCompletion(id)
  }, [])

  const acceptPrompt = useCallback(() => {
    if (!prompt) return
    const parent = prompt
    setPrompt(null)
    act(toggleComplete(parent.id, true))
  }, [prompt, toggleComplete])

  const indent = useCallback((row: Row, idx: number) => {
    // The previous visible sibling: scan upwards at the same depth, stopping at an ancestor.
    for (let i = idx - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.depth < row.depth) return
      if (r.depth === row.depth && r.parent === row.parent) {
        toggleCollapsed(r.task.id, false)
        act(setTaskParent(row.task.id, r.task.id))
        return
      }
    }
  }, [rows, toggleCollapsed])

  const outdent = useCallback((row: Row) => {
    if (!tree || row.parent === null) return
    const grandparent = tree.nodes.get(row.parent)?.parent ?? null
    act(setTaskParent(row.task.id, grandparent))
  }, [tree])

  // Keyboard (keyboard-shortcuts "One shortcut registry with scopes"): the `list`
  // scope, the `board` scope on a board and the project's `view` scope; the
  // dispatcher resolves the key, these handlers act on the selection. A handler
  // returns false when it does not apply, so the key keeps its default.
  const idx = rows.findIndex((r) => r.task.id === selectedId)
  const row = idx >= 0 ? rows[idx] : undefined
  // A viewer may navigate and open tasks of a shared project, never change them.
  const writable = !!row && !isReadOnly(row.task)
  const leaveSidebar = () => {
    // Selecting tasks moves keyboard attention to the list: a sidebar project left
    // focused by a click must not take the next Alt+Up/Down (manual-ordering).
    if ((document.activeElement as HTMLElement | null)?.closest?.('nav[aria-label="Projects"]')) (document.activeElement as HTMLElement).blur()
  }
  const openFor = (focus: { request(id: string): void }) => () => {
    if (!row || !writable) return false
    focus.request(row.task.id)
    setOpenId(row.task.id)
  }
  const extend = (dir: 1 | -1) => () => {
    const order = board ? (columns.find((c) => c.cards.some((task) => task.id === selectedId))?.cards.map((task) => task.id) ?? tickRows) : tickRows
    const at = selectedId ? order.indexOf(selectedId) : -1
    const next = order[Math.max(0, Math.min(order.length - 1, at + dir))]
    if (!next) return false
    if (selection.ticked.size === 0 && selectedId) selection.toggle(selectedId)
    selection.extendTo(next, order)
    setSelectedId(next)
  }
  const moveBy = (how: Step) => () => {
    // Keyboard moves (manual-ordering): only in manually ordered views; the selection stays on the moved task; edges do nothing.
    if (!manual || !selectedId) return false
    act(moveTaskBy(selectedId, how))
  }
  useShortcutScope('view', { 'project.view-mode': () => { if (!projectId) return false; toggleViewMode() } }, { view: route.view })
  useShortcutScope('list', {
    'list.quick-add': () => { if (projectReadOnly) return false; quickAddRef.current?.focus() },
    'list.escape': (e) => {
      const target = e.target as HTMLElement | null
      if (isTypingTarget(target)) target!.blur()
      else if (pickerFor) setPickerFor(null)
      else if (assignFor) setAssignFor(null)
      else if (prompt) setPrompt(null)
      else if (addingUnder) setAddingUnder(null)
      else if (openId) setOpenId(null)
      else if (selection.ticked.size) selection.clear()
      else setSelectedId(null)
    },
    'list.move-up': moveBy(-1), 'list.move-down': moveBy(1), 'list.move-top': moveBy('top'), 'list.move-bottom': moveBy('bottom'),
    // Ctrl/⌘+A selects every row once something is ticked (bulk-edit D2); before that it keeps selecting the page's text.
    'list.select-all': () => { if (selection.ticked.size === 0) return false; selection.selectAll() },
    'list.tick': () => { if (!row) return false; selection.toggle(row.task.id) },
    'list.extend-down': extend(1), 'list.extend-up': extend(-1),
    'list.actions': () => { if (!ticked.length && !selectedId) return false; openActions() },
    'list.down': () => { leaveSidebar(); setSelectedId(rows[Math.min(rows.length - 1, idx + 1)]?.task.id ?? null) },
    'list.up': () => { leaveSidebar(); setSelectedId(rows[Math.max(0, idx - 1)]?.task.id ?? null) },
    'list.collapse': () => {
      if (!row || !treeView) return false
      if (row.hasChildren && !row.collapsed) toggleCollapsed(row.task.id, true)
      else if (row.parent) setSelectedId(row.parent)
    },
    'list.expand': () => {
      if (!row || !treeView) return false
      if (row.hasChildren && row.collapsed) toggleCollapsed(row.task.id, false)
    },
    'list.open': (e) => {
      if (prompt) { acceptPrompt(); return }
      // Enter on a focused button or link is that control's own (the panel's tabs, a version's expander).
      if (!selectedId || isActivationTarget(e.target)) return false
      setOpenId(selectedId)
    },
    'list.add-subtask': () => {
      if (!row || !writable) return false
      toggleCollapsed(row.task.id, false)
      setAddingUnder(row.task.id)
    },
    'list.indent': () => { if (!row || !writable || !treeView) return false; indent(row, idx) },
    'list.outdent': () => { if (!row || !writable || !treeView) return false; outdent(row) },
    'list.complete': () => {
      if (ticked.length) { void runBulk(ticked, { kind: 'complete' }); return }
      if (!row || !writable) return false
      act(toggleComplete(row.task.id, !row.task.completed_at))
    },
    'list.priority': (e) => {
      const priority = Number(e.key) as Priority
      if (ticked.length) { void runBulk(ticked, { kind: 'priority', priority }); return }
      if (!selectedId || (row && !writable)) return false
      act(updateTask(selectedId, { priority }))
    },
    'list.labels': () => {
      if (ticked.length) { openActions('labels'); return }
      if (!row || !writable) return false
      setPickerFor(row.task.id)
    },
    'list.assign': () => {
      if (ticked.length) { openActions('assign'); return }
      if (!row || !writable || !userId) return false
      setAssignFor(row.task.id)
    },
    'list.delete': () => {
      if (ticked.length) { void runBulk(ticked, { kind: 'trash' }); return }
      if (!selectedId || (row && !writable)) return false
      act(deleteWithUndo(selectedId))
      setSelectedId(rows[idx + 1]?.task.id ?? rows[idx - 1]?.task.id ?? null)
    },
    'list.skip': () => {
      // Skip the current occurrence of the selected (or open) recurring task.
      const id = row?.task.id ?? openId
      if (!id) return false
      act(skipOccurrence(id))
    },
    'list.detach': () => {
      // "This occurrence only": detach a standalone copy and open it.
      const id = row?.task.id ?? openId
      if (!id) return false
      void detachOccurrence(id).then((copy) => {
        if (copy) {
          setSelectedId(copy)
          setOpenId(copy)
        }
      })
    },
    // Placement mode in the Day view (OpenSpec `time-blocking`).
    'list.schedule': () => { if (!row || row.task.completed_at) return false; placeInDay(row.task, todayISO()) },
    'list.estimate': () => { if (!row) return false; estimateFocus.request(row.task.id); setOpenId(row.task.id) },
    'list.deadline': openFor(deadlineFocus),
    'list.defer': openFor(deferFocus),
    'list.blocked-by': openFor(blockedByFocus),
    // Park or un-park (someday-and-evening D5).
    'list.park': () => { if (!row || !writable) return false; void (row.task.start === 'someday' ? unparkTask(row.task.id) : parkWithUndo(row.task.id)) },
    'list.evening': () => { if (!row || !writable) return false; act(updateTask(row.task.id, { evening: !row.task.evening })) },
    // Duplicate the task and its open subtasks right below it (project-templates D6).
    'list.duplicate': () => { if (!row || !writable) return false; void duplicateTask(row.task.id).then((id) => setSelectedId(id)) },
  })
  const col = board ? columns.findIndex((c) => c.cards.some((task) => task.id === selectedId)) : -1
  const pos = col >= 0 ? columns[col].cards.findIndex((task) => task.id === selectedId) : -1
  const firstCard = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < columns.length; i += dir) if (columns[i].cards.length) return columns[i].cards[0].id
    return null
  }
  const boardStep = (dir: 1 | -1) => () => {
    if (col < 0) setSelectedId(firstCard(0, 1))
    else setSelectedId(columns[col].cards[Math.max(0, Math.min(columns[col].cards.length - 1, pos + dir))].id)
  }
  const boardColumn = (dir: 1 | -1) => () => {
    if (col < 0) setSelectedId(firstCard(0, 1))
    else setSelectedId(firstCard(col + dir, dir) ?? selectedId)
  }
  const boardMove = (dir: 1 | -1) => () => {
    // Shift+←/→ moves the selected card to the adjacent column; it stays selected.
    const target = columns[col + dir]
    if (row && col >= 0 && target && projectEditable) moveToSection(row.task, target.key)
  }
  useShortcutScope('board', {
    'board.down': boardStep(1), 'board.up': boardStep(-1),
    'board.column-prev': boardColumn(-1), 'board.column-next': boardColumn(1),
    'board.move-prev': boardMove(-1), 'board.move-next': boardMove(1),
    // On the board, `a` opens the quick add of the selected card's column.
    'board.add': () => { if (!projectEditable) return false; setAddingTo(col >= 0 ? columns[col].key : columns[0]?.key ?? '') },
    // Cards are not nested: Tab keeps moving focus and never reaches the list's indent.
    'board.indent': () => undefined,
  }, { enabled: board })


  // List actions for the optional Vim layer (vim-keybindings, design D3); getters
  // read the latest render through a ref so the registration happens once.
  const live = useRef({ rows, columns, board, selectedId, openId, manual, isReadOnly, toggleComplete, ticked, selection, openActions })
  live.current = { rows, columns, board, selectedId, openId, manual, isReadOnly, toggleComplete, ticked, selection, openActions }
  // Complete / reopen from the panel goes through this list, so the "complete parent too?" prompt and the archive offer follow.
  useEffect(() => registerPanelHandlers({ toggleComplete: (task) => void live.current.toggleComplete(task.id, !task.completed_at) }), [])
  // Opening another task from the panel (a subtask, the parent) selects it here when it is listed.
  useEffect(() => {
    if (openId && live.current.rows.some((r) => r.task.id === openId)) setSelectedId(openId)
  }, [openId])
  useEffect(() => registerListState({
    rows: () => live.current.rows.map((r) => r.task),
    columns: () => (live.current.board ? live.current.columns.map((c) => c.cards) : null),
    selected: () => live.current.selectedId,
    select: setSelectedId,
    openId: () => live.current.openId,
    open: setOpenId,
    readOnly: (task) => live.current.isReadOnly(task),
    manual: () => live.current.manual,
    focusQuickAdd: (after) => {
      const input = quickAddRef.current
      if (!input) return false
      insertAfter.current = after
      input.focus()
      return true
    },
    toggleComplete: (id, completed) => live.current.toggleComplete(id, completed),
    openLabels: (id) => setPickerFor(id),
    openAssignee: (id) => setAssignFor(id),
    ticked: () => live.current.ticked,
    tick: (ids) => live.current.selection.set(ids),
    openActions: (picker) => live.current.openActions(picker ?? null),
  }), [])
  useEffect(() => {
    // Leaving the quick-add line ends an `o` insertion; `q` and clicks add at the end as before.
    const input = quickAddRef.current
    insertAfter.current = null
    if (!input) return
    const reset = () => (insertAfter.current = null)
    input.addEventListener('blur', reset)
    return () => input.removeEventListener('blur', reset)
  }, [route, projectReadOnly])

  // The cursor is real focus (assistive-tech-semantics): a new cursor row takes focus
  // on its open button, so a screen reader reads the task, unless focus is elsewhere
  // (a panel, a dialog, the quick add, the sidebar): only an unfocused page or focus
  // already on a row of this list moves with the cursor.
  const listRoot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selectedId) return
    const el = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    const active = document.activeElement as HTMLElement | null
    const free = !active || active === document.body
      || (!!listRoot.current?.contains(active) && !!active.closest('li[data-task-id]') && !isTypingTarget(active))
    if (el && free && !el.contains(active)) el.querySelector<HTMLElement>('[data-row-open]')?.focus({ preventScroll: true })
  }, [selectedId])

  // Row handlers (large-list-performance D1): one object for the life of the list,
  // reading the latest state through a ref, so a memoized row re-renders only when
  // its own props change (j/k changes two rows' `selected`, nothing else).
  const rowLive = useRef({ toggleComplete, toggleCollapsed, startDrag, selection })
  rowLive.current = { toggleComplete, toggleCollapsed, startDrag, selection }
  const rowActions = useMemo<RowActions>(() => ({
    toggle: (task) => act(rowLive.current.toggleComplete(task.id, !task.completed_at)),
    toggleCollapse: (id) => rowLive.current.toggleCollapsed(id),
    open: (id) => {
      setSelectedId(id)
      setOpenId(id)
    },
    tick: (id, range) => {
      const sel = rowLive.current.selection
      if (range) sel.extendTo(id)
      else sel.toggle(id)
      setSelectedId(id)
    },
    drag: (e, task) => rowLive.current.startDrag(e, task),
  }), [])

  /** The list's groups, inside the columns table when that layout is on (custom-fields). */
  const wrapColumns = (nodes: React.ReactNode) => (fieldColumns ? <FieldColumnsTable defs={projectFieldDefs}>{nodes}</FieldColumnsTable> : nodes)
  /** The rows of a group: a list, or a row group of the columns table (custom-fields). */
  const rowList = (children: React.ReactNode, extra?: Record<string, string>) => (fieldColumns
    ? <div role="rowgroup" {...extra}>{children}</div>
    : <ul {...extra}>{children}</ul>)
  /** One task line (or a board card); in manually ordered views rows drag and accept drops. */
  const renderRow = (r: Row) => (fieldColumns
    ? <FieldColumnsRow key={r.task.id} task={r.task} defs={projectFieldDefs} row={renderLine(r)} />
    : renderLine(r))
  const renderLine = (r: Row) => (
    <Fragment key={r.task.id}>
      <ListRow
        task={r.task}
        depth={r.depth}
        breadcrumb={r.breadcrumb}
        hasChildren={r.hasChildren}
        collapsed={r.collapsed}
        project={r.task.project_id ? projectMap.get(r.task.project_id) : undefined}
        labelMap={labelMap}
        assignee={r.task.assignee_id && r.task.project_id && memberMap.has(r.task.project_id)
          ? (r.task.assignee_id === userId ? t('You') : memberName(r.task.assignee_id, memberMap) ?? t('Former member')) : null}
        assignedToMe={!!userId && r.task.assignee_id === userId}
        showProject={route.view !== 'project' && route.view !== 'label' && route.view !== 'inbox'}
        selected={r.task.id === selectedId}
        progress={progress.get(r.task.id)}
        blockedBy={blocked.get(r.task.id)}
        habit={habits.get(r.task.id)}
        readOnly={isReadOnly(r.task)}
        card={board}
        draggable={manual}
        collapsible={treeView && !board}
        dropIndicator={dropAt?.id === r.task.id ? dropAt.zone : null}
        dragging={draggingId === r.task.id}
        ticked={selection.ticked.has(r.task.id)}
        showCheckbox={selectMode || selection.ticked.size > 0}
        hideFieldBadges={fieldColumns}
        posInSet={treeView && !board ? siblingPos.get(r.task.id)?.pos : undefined}
        setSize={treeView && !board ? siblingPos.get(r.task.id)?.size : undefined}
        actions={rowActions}
      />
      {addingUnder === r.task.id && !board && (
        <li>
          <SubtaskInput parent={r.task} depth={r.depth + 1} onClose={() => setAddingUnder(null)} />
        </li>
      )}
    </Fragment>
  )

  // Page actions (ux-overhaul, task-list-presentation): the header row holds them, so
  // nothing sits between the quick add and the first task. Touch screens have no
  // hover: the Select button shows every checkbox (bulk-edit D3).
  const pageActions = (
    <>
      {route.view === 'today' && <TodayAskAction role={userRole} />}
      {route.view === 'inbox' && rows.length > 0 && (
        // Process the Inbox one task at a time (inbox-triage); g then p.
        <Tooltip label={t('Process the Inbox')} shortcut="g p">
          <Button variant="secondary" size="sm" icon="inbox" onClick={() => navigate({ view: 'triage' })} data-triage-start>
            {t.rich('Process {count}', { count: <span className="tabular-nums text-muted">{rows.filter((r) => r.depth === 0).length}</span> })}
          </Button>
        </Tooltip>
      )}
      {route.view !== 'completed' && rows.length > 0 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm hidden px-2 py-1 text-body pointer-coarse:inline-flex" aria-pressed={selectMode} onClick={() => setSelectMode((v) => !v)} data-select-mode>
          {selectMode ? t('Done') : t('Select')}
        </button>
      )}
      {filterKey && <DurationFilterControl active={duration} onChange={chooseDuration} />}
      {(route.view === 'today' || route.view === 'upcoming') && (
        // Display mode (display-mode D6): this view in large type, for a tablet or an e-ink panel.
        <IconButton size="sm" icon="monitor" label={t('Display mode')} data-display-mode
          onClick={() => navigate({ view: 'display', target: { kind: route.view as 'today' | 'upcoming' }, options: { ...DEFAULT_DISPLAY_OPTIONS } })} />
      )}
    </>
  )

  const title = {
    inbox: t('Inbox'), today: t('Today'), upcoming: t('Upcoming'), someday: t('Someday'), anytime: t('Anytime'), completed: t('Completed'), assigned: t('Assigned to me'), project: currentProject?.name ?? t('Project'), label: currentLabel?.name ?? t('Label'),
  }[route.view]

  if (route.view === 'project' && projects.length > 0 && !currentProject) {
    return (
      <div className="p-6 text-body text-muted">
        {t('This project no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button>
      </div>
    )
  }
  if (route.view === 'label' && labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) {
    return (
      <div className="p-6 text-body text-muted">
        {t('This label no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'labels' })}>{t('All labels')}</button>
      </div>
    )
  }

  return (
    <div ref={listRoot} className="min-w-0 px-4 py-5 md:px-8">
        <div className={board || timeline ? 'mx-auto' : fieldColumns ? 'mx-auto max-w-6xl' : 'mx-auto max-w-3xl'} data-list-page>
          {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} actions={pageActions} subtitle={board ? currentColumn : undefined}
              layout={(
                <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Project layout')}>
                  {(['list', 'board', 'timeline'] as const).map((m) => (
                    <Tooltip key={m} label={LAYOUT_LABEL[m]} shortcut={keysOf('project.view-mode')}>
                      <button type="button" aria-pressed={viewMode === m} onClick={() => chooseViewMode(m)}
                        className={`${m === 'list' ? 'rounded-l-control' : m === 'timeline' ? 'rounded-r-control' : ''} px-2 py-1 ${viewMode === m ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted hover:bg-sunken dark:hover:bg-raised'}`}>
                        {LAYOUT_LABEL[m]}
                      </button>
                    </Tooltip>
                  ))}
                </span>
              )} />
          ) : (
            // The page header (ux-overhaul, app-shell "Page template"; task-list-presentation
            // "Nothing between the header and the list"): title, meta, actions, Help.
            <PageHeader title={title} help={HELP_SCREENS[route.view] ?? 'inbox'} actions={pageActions}
              leading={currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              meta={route.view === 'today' ? dt.formatDate(today, 'heading') : route.view === 'label' ? rows.length : undefined} />
          )}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-default pb-2">
              {projectReadOnly ? (
                <>
                  <input className="ui-input" disabled aria-label={t('Quick add (read-only)')} placeholder={t('You can view this project but not add tasks')} />
                  <p role="note" className="mt-1 text-meta text-muted">{t('Read-only: you are a viewer of this shared project.')}</p>
                </>
              ) : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} projects={projects} labels={labels} placeholder={placeholderFor(route, currentProject, currentLabel)} voiceShortcut />
              )}
            </div>
          )}

          {showFirstRun && <FirstRunCard onFocusQuickAdd={focusQuickAdd} />}

          <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actionsOpen && ticked.length > 0}
            onMenuOpenChange={(v) => { setActionsOpen(v); if (!v) setActionsPicker(null) }} startPicker={actionsPicker} />
          {actionsOpen && ticked.length === 0 && selectedId && (
            // `.` with nothing ticked: the same menu for the cursor task.
            <BulkActionsMenu ids={[selectedId]} open onOpenChange={(v) => { setActionsOpen(v); if (!v) setActionsPicker(null) }} startPicker={actionsPicker}
              trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
          )}

          {route.view === 'project' && currentProject && <ProjectNote project={currentProject} />}
          {route.view === 'project' && !board && <SubProjects projectId={route.id} />}
          {offerColumns && (
            // The list's columns layout (custom-fields): per project, on this device only.
            <div className="mb-1 flex justify-end">
              <Button variant="ghost" size="sm" icon="list" aria-pressed={!!columnsPref} data-columns-toggle
                className={columnsPref ? 'bg-sunken text-default dark:bg-raised' : undefined}
                onClick={() => projectId && saveListColumns(projectId, !columnsPref)}>
                {t('Columns')}
              </Button>
            </div>
          )}
          {rows.length === 0 && !showFirstRun && !(board || liveSections.length > 0) && (duration ? (
            <EmptyStatePattern icon="filter" title={t('No task matches this duration filter')}
              action={<Button size="sm" variant="secondary" onClick={() => chooseDuration(null)}>{t('Clear the filter')}</Button>} />
          ) : <EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={projectReadOnly} onAdd={focusQuickAdd} />)}

          {board && currentProject ? (
            <BoardView
              project={currentProject}
              columns={columns}
              editable={projectEditable}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
              projects={projects}
              labels={labels}
              renderCard={(task) => renderRow({ task: task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: null })}
              onCurrentColumn={setCurrentColumn}
            />
          ) : timeline && currentProject ? (
            <TimelineView groups={groups} today={today} zone={zone} editable={projectEditable} selectedId={selectedId}
              onSelect={setSelectedId} onOpen={(id) => { setSelectedId(id); setOpenId(id) }} byId={taskMap} />
          ) : wrapColumns(groups.map((g, gi) => g.section !== undefined && currentProject ? (
            // Project list grouped by section (board-view): headings are drop targets.
            <section key={g.key} role={fieldColumns ? 'rowgroup' : undefined} className="mb-3 rounded-control data-drop-active:ring-2 data-drop-active:ring-accent" data-drop-target={sectionTarget(g.section?.id ?? '')}>
              <SectionHeader
                section={g.section}
                count={g.count ?? 0}
                layout="list"
                editable={projectEditable}
                first={gi <= 1}
                last={gi === groups.length - 1}
                collapsed={g.sectionCollapsed}
                onToggleCollapse={() => toggleSection(g.section?.id ?? '')}
                onAdd={() => setAddingTo(g.section?.id ?? '')}
                completed={doneBySection.get(g.section?.id ?? '')?.length ?? 0}
                revealed={revealed.has(g.key)}
                onReveal={() => setRevealed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}
              />
              {addingTo === (g.section?.id ?? '') && projectEditable && (
                <SectionQuickAdd project={currentProject} sectionId={g.section?.id ?? null} sectionName={g.heading ?? t('No section')} projects={projects} labels={labels} onClose={() => setAddingTo(null)} />
              )}
              {rowList(g.rows.map((r) => renderRow(r)))}
              {g.count === 0 && revealed.has(g.key) && rowList(
                (doneBySection.get(g.section?.id ?? '') ?? []).map((task) => renderRow({ task: task, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: null })),
                { 'data-revealed-completed': '' },
              )}
            </section>
          ) : g.rows.length === 0 && g.folded === undefined ? null : (
            <section key={g.key} className="mb-4" data-group={g.key}>
              {g.folded !== undefined ? (
                <ListGroupHeader title={g.heading ?? ''} count={g.count} collapsed={g.folded} onToggle={() => toggleCollapsed(BLOCKED_OPEN_KEY)} tone="muted" />
              ) : g.heading && (
                <ListGroupHeader title={g.heading} count={g.note ? undefined : g.rows.length} note={g.note} tone={g.key === 'overdue' ? 'danger' : 'default'}
                  collapsed={collapsedGroups.has(groupKey(route.view, g.key))} onToggle={() => setGroupCollapsed(route.view, g.key, !collapsedGroups.has(groupKey(route.view, g.key)))} />
              )}
              {!(g.heading && g.folded === undefined && collapsedGroups.has(groupKey(route.view, g.key))) && rowList(g.rows.map((r) => renderRow(r)))}
            </section>
          )))}
          {logbook && logbook.total > logbookLimit && (
            <div className="mb-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLogbookLimit((n) => n + LOGBOOK_PAGE)} data-logbook-more>
                {t.rich('Show more {older}', { older: <span className="tabular-nums text-muted">{t('{n} older', { n: logbook.total - logbookLimit })}</span> })}
              </Button>
            </div>
          )}
          {route.view === 'project' && !board && !timeline && projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
        </div>
      {prompt && (
        <div role="status" className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-default bg-surface px-4 py-2 text-body shadow-2">
            <span className="user-text min-w-0">{t.rich('All subtasks done. Complete <b>{title}</b> too?', { title: prompt.title || t('Untitled'), b: (chunks) => <strong>{chunks}</strong> })}</span>
            <button className="ui-btn ui-btn--primary ui-btn--sm text-meta" onClick={acceptPrompt}>{t('Complete')} <Kbd k="Enter" only className="ml-1 border-on-accent/40 bg-accent-hover text-on-accent" /></button>
            <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => setPrompt(null)}>{t('Keep open')} <Kbd k="Esc" only className="ml-1" /></button>
          </div>
        </div>
      )}
      {assignFor && userId && (
        <Dialog title={t('Assign')} label={t('Assign task')} onClose={() => setAssignFor(null)}>
          <AssigneePicker taskId={assignFor} userId={userId} onClose={() => setAssignFor(null)} />
          <p className="mt-2 px-1 text-hint text-faint">{t('Type to filter · Enter assigns · Esc closes')}</p>
        </Dialog>
      )}
      {pickerFor && (
        <Dialog title={t('Labels')} label={t('Labels for task')} onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
          <p className="mt-2 px-1 text-hint text-faint">{t('Enter toggles or creates · Esc closes')}</p>
        </Dialog>
      )}
    </div>
  )
}

/** Inline "Add subtask" line under a row; stays focused for the next entry, Escape closes. */
/** The list's row handlers, stable for the life of the list (large-list-performance D1). */
interface RowActions {
  toggle: (task: Task) => void
  toggleCollapse: (id: string) => void
  open: (id: string) => void
  tick: (id: string, range: boolean) => void
  drag: (e: React.PointerEvent, task: Task) => void
}

type ListRowProps = Omit<TaskRowProps, 'labels' | 'onToggle' | 'onOpen' | 'onTick' | 'onToggleCollapse' | 'onPointerDown' | 'dropKey'> & {
  labelMap: Map<string, Label>
  /** Manually ordered view: the row drags and accepts drops. */
  draggable: boolean
  /** Tree list: rows with children get the collapse chevron. */
  collapsible: boolean
  actions: RowActions
}

/**
 * One list row, memoized: every prop is a primitive, a stable object from the
 * list's maps, or the stable `actions`, so moving the cursor re-renders only the
 * rows whose `selected` changed.
 */
const ListRow = memo(function ListRow({ task, labelMap, draggable, collapsible, actions, ...rest }: ListRowProps) {
  const labels = useMemo(() => resolveLabels(task.labels, labelMap), [task.labels, labelMap])
  return (
    <TaskRow
      {...rest}
      task={task}
      labels={labels}
      onPointerDown={draggable ? (e) => actions.drag(e, task) : undefined}
      dropKey={draggable ? `task:${task.id}` : undefined}
      onToggle={() => actions.toggle(task)}
      onToggleCollapse={collapsible ? () => actions.toggleCollapse(task.id) : undefined}
      onOpen={() => actions.open(task.id)}
      onTick={(range) => actions.tick(task.id, range)}
    />
  )
})

function SubtaskInput({ parent, depth, onClose }: { parent: Task; depth: number; onClose: () => void }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    await createSubtask(parent.id, title)
    ref.current?.focus()
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2 py-1 pr-2" style={{ paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 2}rem` }}>
      <span className="text-accent">+</span>
      <input
        ref={ref}
        className="ui-input py-1"
        placeholder={(parent.title ? t('Add a subtask to {title}…', { title: parent.title }) : t('Add a subtask to this task…'))}
        aria-label={t('Add a subtask')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
        onBlur={() => { if (!value) onClose() }}
      />
    </form>
  )
}

/** Views that offer the duration filter, each with its own per-device setting. */
function durationFilterKey(route: ListRoute): string | null {
  switch (route.view) {
    case 'inbox':
    case 'today':
    case 'upcoming':
      return route.view
    case 'project':
      return `project:${route.id}`
    default:
      return null
  }
}

/**
 * The duration filter as a page action (ux-overhaul, time-blocking "Duration filter"):
 * a Filter menu in the header, and one chip with a clear control while a filter is on.
 */
function DurationFilterControl({ active, onChange }: { active: DurationFilter | null; onChange: (kind: DurationFilter | null) => void }) {
  const current = DURATION_FILTERS.find((f) => f.kind === active)
  return (
    <span className="flex items-center gap-1" data-duration-filter>
      {current && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pl-2.5 pr-1 text-meta font-medium text-on-accent-soft" data-duration-active>
          {current.label}
          <button type="button" className="touch-target flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/10" aria-label={t('Clear filter')} onClick={() => onChange(null)} data-clear-duration>
            <Icon name="x" size="xs" />
          </button>
        </span>
      )}
      <Menu kind="menu" label={t('Filter')} title={t('Filter by duration')} trigger={<Icon name="filter" />} triggerClassName={`ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1 ${active ? 'text-accent' : ''}`} width="sm:w-56">
        {DURATION_FILTERS.map((f) => (
          <MenuItem key={f.kind} label={f.label} description={f.title} checked={active === f.kind} onSelect={() => onChange(active === f.kind ? null : f.kind)} />
        ))}
        {active && <MenuSeparator />}
        {active && <MenuItem label={t('Clear filter')} icon="x" onSelect={() => onChange(null)} />}
      </Menu>
    </span>
  )
}

function placeholderFor(route: ListRoute, project?: Project, label?: Label): string {
  switch (route.view) {
    case 'today':
      return t('Add a task for today…')
    case 'upcoming':
      return t('Add a task for tomorrow…')
    case 'someday':
      return t('Add a someday task…')
    case 'anytime':
      return t('Add a task…')
    case 'project':
      return project?.name ? t('Add a task to {project}…', { project: project.name }) : t('Add a task to this project…')
    case 'label':
      return label?.name ? t('Add a task labelled {label}…', { label: label.name }) : t('Add a task with this label…')
    case 'assigned':
      return t('Add a task assigned to you…')
    default:
      return t('Add a task to your Inbox…')
  }
}

// Empty states name the action first (first-run spec): an icon, one sentence, one
// button that does it, and the key hint on a second line only with a fine pointer.
const EMPTY: Record<ListRoute['view'], { icon: IconName; title: string }> = {
  inbox: { icon: 'inbox', get title() { return t('Your Inbox is empty') } },
  today: { icon: 'sun', get title() { return t('Nothing due today') } },
  upcoming: { icon: 'calendar-days', get title() { return t('Nothing scheduled yet') } },
  someday: { icon: 'coffee', get title() { return t('Nothing parked for later') } },
  anytime: { icon: 'layers', get title() { return t('Nothing to do whenever') } },
  completed: { icon: 'circle-check-big', get title() { return t('Nothing completed yet') } },
  project: { icon: 'folder', get title() { return t('This project has no open tasks') } },
  label: { icon: 'tag', get title() { return t('No open task carries this label') } },
  assigned: { icon: 'user-check', get title() { return t('Nothing is assigned to you') } },
}

function EmptyState({ view, waiting = 0, readOnly = false, onAdd }: { view: ListRoute['view']; waiting?: number; readOnly?: boolean; onAdd: () => void }) {
  const fine = useFinePointer()
  const { icon, title } = EMPTY[view]
  // Everything due today waits for other tasks (task-dependencies): say so.
  const body = view === 'today' && waiting > 0
    ? t('{n, plural, one {One task is waiting for other tasks below.} other {# tasks are waiting for other tasks below.}}', { n: waiting })
    : undefined
  const action = view === 'completed'
    ? { label: t('Open Today'), run: () => navigate({ view: 'today' }), hint: <>{t.rich('Press {g} then {key} to open Today', { g: <kbd className="ui-kbd">g</kbd>, key: <kbd className="ui-kbd">t</kbd> })}</> }
    : readOnly
      ? { label: t('Open Inbox'), run: () => navigate({ view: 'inbox' }), hint: <>{t.rich('Press {g} then {key} to open the Inbox', { g: <kbd className="ui-kbd">g</kbd>, key: <kbd className="ui-kbd">i</kbd> })}</> }
      : { label: t('Add a task'), run: onAdd, hint: <>{t.rich('Press {key} to add a task', { key: <kbd className="ui-kbd">q</kbd> })}</> }
  return (
    <div data-empty-state={view}>
      <EmptyStatePattern icon={icon} title={body ? t('Nothing is ready to start today') : title} body={body}
        action={(
          <>
            <Button size="sm" variant="secondary" data-empty-action onClick={action.run}>{action.label}</Button>
            {fine && <p className="mt-2 text-meta text-faint" data-empty-hint>{action.hint}</p>}
          </>
        )} />
    </div>
  )
}

