// The task list's data (OpenSpec change web-component-structure): live reads from
// lib/liveData and the shared task snapshot, turned into rows and groups by the
// pure functions of lib/listGroups. One hook, so TaskListView only renders.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlace } from '../../lib/locations'
import { liveBlocked } from '../../lib/dependencies'
import { useFlowView } from '../../lib/useFlow'
import { durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from '../../lib/filters'
import { UPCOMING_FILTER_KEY, useQueryFilter } from '../calendar/queryFilter'
import { habitStatsMap, patchHabitStats, type HabitStats } from '../../lib/habits'
import { boardColumns, completedBySection, completedNewestFirst, completedOpenKey, keepGroups, listGroups, patchCompletedBySection, patchTreeParts, patchViewTasks, siblingPositions, tasksForView, treeParts, type ListGroup, type ListScope, type TreeParts } from '../../lib/listGroups'
import { useAllLabels, useCollapsedSections, useListColumnsPref, useLiveProjects, useMemberships, useProjectPrefsRow, useProjectSectionRows, useProjectViewMode, useShowCompletedPref } from '../../lib/liveData'
import { listDisplayOf, type DisplayScope, type ListDisplay } from '../../lib/listDisplay'
import { useListDisplay } from './useListDisplay'
import { orderRank } from '../../lib/viewOrder'
import { useAccountRowLayout } from '../../lib/rowLayout'
import { useUserPrefsRow } from '../../lib/localData'
import { upcomingStartsWithToday } from '../../lib/userPrefs'
import { dayPartsOn } from '../../lib/dayParts'
import { useClosedList, useWaitingNow } from './useClosedList'
import { NO_TASKS, taskIndexOf, useLiveTasks } from '../../lib/liveTasks'
import { Derived } from '../../lib/taskDelta'
import { LOGBOOK_PAGE, logbookGroups } from '../../lib/logbook'
import { todayAssigneeFilter } from '../../lib/dayLists'
import { canEditTasks, roleOf, useMe } from '../../lib/sharing'
import { liveProgress } from '../../lib/subtasks'
import type { Project, Section, Task } from '../../lib/types'
import { inToday, upcomingDate } from '../../lib/views'
import { DESKTOP_HEADER_QUERY, useMediaQuery } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { hasTimeColumn } from '../../lib/rowTime'
import { useUnusedSlots } from '../../lib/rowSlots'
import { localDueOf } from '../../lib/dates'
import { useSlotted } from '../../lib/slots'
import type { Route } from '../router'
import { useApplicableFields, useFieldDefs } from '../useFields'
import { useToday, useViewerZone } from '../useViews'
import { readJSON, writeJSON } from '../../lib/deviceStorage'
import { useResetOnChange } from '../../lib/useResetOnChange'
import { useUpcomingGroups } from './upcomingProjections'
import { isReusable } from '../../lib/reusable'

export type ListRoute = Extract<Route, ListScope>

/** Whether any task of the list has `id` as its parent. */
function taskHasChildren(tasks: readonly Task[], id: string): boolean {
  return tasks.some((task) => task.parent_id === id)
}

const COLLAPSE_KEY = 'opentodo.collapsed'

function loadCollapsed(): Set<string> {
  return new Set(readJSON<string[]>(COLLAPSE_KEY, [], (v) => (Array.isArray(v) ? v as string[] : null)))
}

function saveCollapsed(set: Set<string>) {
  writeJSON(COLLAPSE_KEY, [...set]) // per-device convenience only; losing it is harmless
}

/** Views that offer the duration filter, each with its own per-device setting. */
export function durationFilterKey(route: ListRoute): string | null {
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

/** Duration filter chips (OpenSpec `time-blocking`): per view, per device. */
function useDurationFilter(route: ListRoute) {
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
  return { filterKey, duration, chooseDuration }
}

/** Collapsed tree rows (and the open Blocked group), per device. */
function useCollapsedRows() {
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
  return { collapsed, toggleCollapsed }
}

/** Sections, layout and columns of a project (OpenSpec `board-view`, custom-fields); per-device preferences. */
function useProjectLayout(projectId: string | null) {
  const sections = useProjectSectionRows(projectId)
  const liveSections = useMemo(() => sections.filter((s) => !s.deleted_at), [sections])
  const viewMode = useProjectViewMode(projectId)
  const collapsedSections = useCollapsedSections(projectId)
  // Custom fields (custom-fields): the list's columns layout, offered on wide
  // screens when the project defines fields; below 768 px rows show badges.
  // Inherited fields are columns too (inherited-custom-fields).
  const fieldsOf = useApplicableFields()
  const projectFieldDefs = useMemo(() => fieldsOf(projectId), [projectId, fieldsOf])
  const wideScreen = useMediaQuery(DESKTOP_HEADER_QUERY)
  const columnsPref = useListColumnsPref(projectId)
  const offerColumns = !!projectId && viewMode === 'list' && wideScreen && projectFieldDefs.length > 0
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  return {
    sections, liveSections, viewMode, collapsedSections, projectFieldDefs, columnsPref, offerColumns, sectionMap,
    fieldColumns: offerColumns && columnsPref,
    board: !!projectId && viewMode === 'board',
    timeline: !!projectId && viewMode === 'timeline',
  }
}

/** The same display object while its options are the same, so the groups are not worked out again. */
function useStableDisplay(d: ListDisplay | undefined): ListDisplay | undefined {
  const { groupBy, sortBy, sortDir, rowLayout, subtasks, laterInFull } = d ?? {}
  return useMemo(() => (groupBy && sortBy && sortDir && rowLayout
    ? { groupBy, sortBy, sortDir, rowLayout, ...(subtasks !== undefined ? { subtasks } : {}), ...(laterInFull !== undefined ? { laterInFull } : {}) }
    : undefined), [groupBy, sortBy, sortDir, rowLayout, subtasks, laterInFull])
}

export function useListModel(route: ListRoute, userId?: string) {
  const allFieldDefs = useFieldDefs()
  const dt = useDateTimeFormat()
  // Re-read every minute: Today, Upcoming and the Logbook roll over at midnight.
  const today = useToday()
  // Zoned dues (absolute-datetimes) are grouped in the viewer zone; re-group when it changes.
  const zone = useViewerZone()
  const projects = useLiveProjects()
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const treeView = route.view === 'project' || route.view === 'inbox'
  const labels = useAllLabels()
  // Cached memberships (project-sharing): viewers get a read-only project, also offline.
  const memberships = useMemberships()
  const me = useMe()
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const isReadOnly = useCallback((tk: Task | undefined) => !!tk && roleOf(tk.project_id, memberMap) === 'viewer', [memberMap])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectId = route.view === 'project' ? route.id : null

  // Every live task once; views, breadcrumbs and progress badges derive from this set,
  // so a remote op that lands in IndexedDB updates all of them without a reload. The
  // snapshot is shared with the sidebar and the panel (large-list-performance D2).
  const liveTasks = useLiveTasks()
  const allTasks = liveTasks ?? NO_TASKS
  // Each worked out from the rows a write changed, once per snapshot (incremental-list-updates D2).
  const taskMap = taskIndexOf(allTasks)
  const progress = liveProgress(allTasks)
  const blocked = liveBlocked(allTasks)
  // Steps waiting in sequence (project-flow-modes): dimmed rows, and Today folds them with the blocked ones.
  const flow = useFlowView(allTasks, today, taskMap)
  const held = useMemo(() => flow.held(blocked), [flow, blocked])
  // Streaks of habits (OpenSpec habits D5): once per list, from the rows it holds.
  const habitsOf = useRef(new Derived<Map<string, HabitStats>, [string]>(habitStatsMap, patchHabitStats)).current
  const habits = habitsOf.get(allTasks, today)

  const filter = useDurationFilter(route)
  const { duration, filterKey } = filter
  // Upcoming's Start with Today (upcoming-start-with-today D1): the account's synced choice.
  const accountPrefs = useUserPrefsRow()
  const upcomingToday = route.view === 'upcoming' && upcomingStartsWithToday(accountPrefs)
  const assigneeFilter = useMemo(() => (route.view === 'today' ? todayAssigneeFilter(accountPrefs, memberships, me) : null), [route.view, accountPrefs, memberships, me])
  // A view's tasks follow the rows a write changed (incremental-list-updates D2); a zone change re-groups zoned dues (absolute-datetimes).
  const viewOf = useRef(new Derived<Task[], [string, string, readonly Project[], string, string, string | undefined, boolean, ReturnType<typeof todayAssigneeFilter>]>(
    (tasks, _view, _id, projects, today, _zone, userId, upcomingToday, hide) => tasksForView(routeRef.current, tasks, projects, today, userId, upcomingToday, hide),
    (prev, changes, tasks, _view, _id, projects, today, _zone, userId, upcomingToday, hide) => patchViewTasks(prev, changes, routeRef.current, projects, today,
      { parentOf: (id) => taskIndexOf(tasks).get(id), hasChildren: (id) => liveProgress(tasks).has(id) }, userId, upcomingToday, hide),
  )).current
  const routeRef = useRef(route)
  routeRef.current = route
  const viewTasks = viewOf.get(allTasks, route.view, 'id' in route ? route.id : '', projects, today, zone, userId, upcomingToday, assigneeFilter)
  // The last day Upcoming lists, before its filters, so calendar events stay when a filter hides the tasks.
  // viewTasks already recomputes when the zone changes, so this follows it.
  const upcomingThrough = useMemo(() => {
    if (route.view !== 'upcoming') return null
    let last: string | null = null
    for (const task of viewTasks) {
      const date = upcomingDate(task, today)
      if (date && date > today && (last === null || date > last)) last = date
    }
    return last
  }, [route.view, viewTasks, today])
  // Upcoming's query filter (calendar-clarity D4), under the duration filter; per device, on local rows.
  const upcoming = useQueryFilter(UPCOMING_FILTER_KEY, allTasks)
  const queryTest = route.view === 'upcoming' ? upcoming.test : null
  const tasks = useMemo(() => {
    const byDuration = !duration || !filterKey ? viewTasks : viewTasks.filter(durationPredicate(duration))
    return queryTest ? byDuration.filter(queryTest) : byDuration
  }, [viewTasks, duration, filterKey, queryTest])

  // Completed renders a page of the logbook at a time; a new route starts again.
  const [logbookLimit, setLogbookLimit] = useState(LOGBOOK_PAGE)
  useResetOnChange([route.view], () => setLogbookLimit(LOGBOOK_PAGE))
  const logbook = useMemo(() => (route.view === 'completed' ? logbookGroups(tasks, logbookLimit) : null), [route.view, tasks, logbookLimit])

  const { collapsed, toggleCollapsed } = useCollapsedRows()
  const layout = useProjectLayout(projectId)
  const { board, sections, liveSections, collapsedSections } = layout

  // Project lists keep deferred and parked tasks apart from the active ones, each with its
  // subtasks (subtasks-follow-later): in a folded Later inside their own section when the list
  // is grouped by section (later-in-section), else in a Later group at the end (someday-and-evening D2);
  // the board keeps every card in its column.
  // The split, the tree and the section buckets follow the rows a write changed (incremental-list-updates D2).
  const partsOf = useRef(new Derived<TreeParts, [boolean, boolean, string, string | null, Section[]]>(treeParts,
    (prev, changes, tasks) => patchTreeParts(prev, changes, (id) => taskHasChildren(tasks, id)))).current
  const { split, tree, buckets } = partsOf.get(tasks, treeView, board, today, projectId, sections)
  const laterTasks = split?.later ?? NO_TASKS
  const columns = useMemo(() => boardColumns(buckets, collapsedSections), [buckets, collapsedSections])

  // A project's, label's or built-in view's display options (list-display-options, builtin-view-options): personal and synced.
  const prefsRow = useProjectPrefsRow(projectId)
  const labelRow = route.view === 'label' ? labelMap.get(route.id) : undefined
  const builtin = route.view === 'today' || route.view === 'upcoming' || route.view === 'inbox'
  const displayScope = useMemo<DisplayScope | null>(() => (route.view === 'project' || route.view === 'label' ? { kind: route.view, id: route.id }
    : route.view === 'today' || route.view === 'upcoming' || route.view === 'inbox' ? { kind: route.view } : null), [route])
  const account = useAccountRowLayout()
  const displayOf = (scope: DisplayScope | null) => (scope ? listDisplayOf(scope.kind, scope.kind === 'project' ? prefsRow : scope.kind === 'label' ? labelRow : accountPrefs, account) : undefined)
  const display = useStableDisplay(displayOf(displayScope))
  // Upcoming's Today groups follow Today's own options (builtin-view-options D4).
  const todayDisplay = useStableDisplay(upcomingToday ? displayOf({ kind: 'today' }) : undefined)
  // Nest subtasks (D5): the rows are a tree, with the collapse toggle and Left and Right.
  const nested = (route.view === 'today' || route.view === 'upcoming') && !!(display?.subtasks || todayDisplay?.subtasks)
  // The header's display button and the switch to manual order; a project's board and timeline have their own layout.
  const sortFields = route.view === 'project' ? layout.projectFieldDefs : allFieldDefs
  const listDisplay = useListDisplay(display, displayScope, builtin || route.view === 'label' || layout.viewMode === 'list', sortFields, account)
  // A label page's own manual order (view-manual-order D1): the rank of each placed task.
  const labelOrder = labelRow?.manual_order
  const manualOrder = useMemo(() => (route.view === 'label' ? orderRank(labelOrder) : undefined), [route.view, labelOrder])

  // Today grouped by part of the day (day-parts D3): the account's synced choice.
  const dayParts = dayPartsOn(accountPrefs)
  // Today's closed list (today-closed-list): slots from the whole of Today, before the duration filter;
  // Upcoming's Start with Today fills them from the same Today tasks (upcoming-start-with-today D3).
  const todayTasks = useMemo(() => (upcomingToday ? viewTasks.filter((x) => inToday(x, today)) : viewTasks), [upcomingToday, viewTasks, today])
  const closed = useClosedList(route.view === 'today' || upcomingToday, todayTasks, allTasks, today, flow, blocked)
  // The waiting tasks' times are read against the minute (today-waiting-time-passed D3).
  const waitingNow = useWaitingNow(closed.fill.waiting.length > 0)
  const closedList = useMemo(() => {
    if (!closed.fill.limit) return undefined
    const shown = new Set(tasks.map((x) => x.id))
    return { limit: closed.fill.limit, waiting: closed.fill.waiting.filter((id) => shown.has(id)).map((id) => taskMap.get(id)!).filter(Boolean), now: waitingNow }
  }, [closed.fill, tasks, taskMap, waitingNow])
  // Done today stays Today's own: Upcoming looks ahead (upcoming-start-with-today D3).
  const doneToday = route.view === 'today' ? closed.doneToday ?? undefined : undefined
  // A write keeps every group and row it did not change (list-rendering-at-scale D6).
  const keptGroups = useRef<ListGroup[] | null>(null)
  const groups = useMemo<ListGroup[]>(() => (keptGroups.current = keepGroups(keptGroups.current, listGroups({
    view: route.view, tasks, laterTasks, projectId, timeline: layout.timeline, tree, today, resolved: dt.resolved, collapsed, blocked: held, taskMap,
    projects, projectMap, fields: sortFields, board, columns, buckets, sectionCount: liveSections.length, collapsedSections, logbook, display, labels, manualOrder, dayParts, closedList, doneToday,
    upcomingToday, todayDisplay,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  }))), [dt.resolved, tree, tasks, laterTasks, projectId, layout.timeline, route.view, today, zone, collapsed, held, taskMap, projects, projectMap, board, columns, buckets, liveSections, collapsedSections, logbook, display, labels, manualOrder, dayParts, closedList, doneToday, upcomingToday, todayDisplay])
  // Upcoming's projected occurrences (series-occurrences D4): off by default, per device; never rows.
  const projectedGroups = useUpcomingGroups(route.view === 'upcoming', groups, { allTasks, projects, today, zone, duration: filterKey ? duration : null, queryTest, resolved: dt.resolved })
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  // The list's own rows: Today's Done today group is not part of Today's open list (today-closed-list D6).
  const ownRows = useMemo(() => (doneToday?.length ? groups.filter((g) => g.key !== 'done').flatMap((g) => g.rows) : rows), [doneToday, groups, rows])
  const siblingPos = useMemo(() => siblingPositions(groups), [groups])
  // The time column (rows-v2 D2): one fact of the whole list, from its visible rows; cards have none.
  // A task a calendar slot holds shows the slot's start there (calendar-slots D8).
  const slotted = useSlotted()
  const rowTasks = useMemo(() => rows.map((r) => r.task), [rows])
  const timeColumn = useMemo(() => !board && hasTimeColumn(rowTasks, slotted), [board, rowTasks, slotted])
  // The property column's slots no row uses (sidebar-brand-and-row-grid D2): one fact of the whole list, like the time column.
  // A row under a heading that names its day shows no date words (Upcoming's days): its date slot stays empty.
  const dateShown = useMemo(() => {
    const implied = new Map(rows.filter((r) => r.implied?.date).map((r) => [r.task.id, r.implied!.date!]))
    return (task: Pick<Task, 'id' | 'due' | 'start' | 'sector' | 'evening' | 'day_part'>) => {
      const day = implied.get(task.id)
      if (!day || !task.due || task.due.tz || task.start || task.evening || task.day_part) return true
      return localDueOf(task.due).date !== day || (!!task.due.time && !timeColumn)
    }
  }, [rows, timeColumn])
  const slotsOff = useUnusedSlots(board ? undefined : rowTasks, { omitLabel: route.view === 'label' ? route.id : undefined, dateShown })
  // Sections with only completed tasks keep a header with "n completed" and Show
  // (task-list-presentation "Empty groups").
  const doneOf = useRef(new Derived<Map<string, Task[]>, [string | null, Map<string, Section>]>(completedBySection, patchCompletedBySection)).current
  const doneBySection = doneOf.get(allTasks, projectId, layout.sectionMap)
  // With "Show completed tasks" on (project-completed-section), the list layout
  // keeps them in one Completed group at the end, newest first, closed by default.
  const showCompletedPref = useShowCompletedPref(projectId)
  // A reusable list always ends with its ticked items, "Got it", on every device (reusable-lists D7).
  const reusable = !!projectId && isReusable(projectMap.get(projectId))
  const showCompleted = !!projectId && (showCompletedPref || reusable) && !board && !layout.timeline
  const completedTasks = useMemo(() => (showCompleted ? completedNewestFirst(doneBySection) : NO_TASKS), [showCompleted, doneBySection])
  const completedOpen = !!projectId && collapsed.has(completedOpenKey(projectId))

  // A place's list (task-locations): undefined while loading, null when it does not exist.
  const placeId = route.view === 'place' ? route.id : null
  const currentPlace = usePlace(placeId)

  return {
    /** The tasks are read: until then the list shows nothing rather than filling in stages. */
    loaded: liveTasks !== undefined,
    dt, today, zone, projects, projectMap, labels, labelMap, memberMap, isReadOnly, treeView, projectId,
    currentProject: route.view === 'project' ? projectMap.get(route.id) : undefined,
    currentLabel: route.view === 'label' ? labelMap.get(route.id) : undefined,
    currentPlace,
    projectReadOnly: route.view === 'project' && roleOf(route.id, memberMap) === 'viewer',
    projectEditable: !!projectId && canEditTasks(roleOf(projectId, memberMap)),
    allTasks, taskMap, progress, blocked, flow, habits, ...filter, logbook, logbookLimit, setLogbookLimit,
    collapsed, toggleCollapsed, ...layout, tree, columns, groups: projectedGroups, rows, ownRows, siblingPos, timeColumn, slotsOff, doneBySection,
    showCompleted, reusable, completedTasks, completedOpen, display, displayScope, listDisplay, nested, dayParts, closed, upcomingToday, upcomingThrough,
    queryFilter: route.view === 'upcoming' ? upcoming : null,
  }
}

export type ListModel = ReturnType<typeof useListModel>
