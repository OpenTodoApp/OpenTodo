// The task list's data (OpenSpec change web-component-structure): live reads from
// lib/liveData and the shared task snapshot, turned into rows and groups by the
// pure functions of lib/listGroups. One hook, so TaskListView only renders.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlace } from '../../lib/locations'
import { blockedMap } from '../../lib/dependencies'
import { liveFields } from '../../lib/fields'
import { durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from '../../lib/filters'
import { habitStatsMap } from '../../lib/habits'
import { boardColumns, completedBySection, completedNewestFirst, completedOpenKey, listGroups, sectionBuckets, siblingPositions, tasksForView, type ListGroup, type ListScope } from '../../lib/listGroups'
import { useAllLabels, useCollapsedSections, useListColumnsPref, useLiveProjects, useMemberships, useProjectSectionRows, useProjectViewMode, useShowCompletedPref } from '../../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { LOGBOOK_PAGE, logbookGroups } from '../../lib/logbook'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { buildTaskTree, progressMap } from '../../lib/subtasks'
import type { Task } from '../../lib/types'
import { inLater } from '../../lib/views'
import { DESKTOP_HEADER_QUERY, useMediaQuery } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import type { Route } from '../router'
import { useFieldDefs } from '../useFields'
import { useToday, useViewerZone } from '../useViews'

export type ListRoute = Extract<Route, ListScope>

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
  const fieldDefs = useFieldDefs()
  const projectFieldDefs = useMemo(() => liveFields(projectId, fieldDefs), [projectId, fieldDefs])
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

export function useListModel(route: ListRoute, userId?: string) {
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
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const isReadOnly = useCallback((tk: Task | undefined) => !!tk && roleOf(tk.project_id, memberMap) === 'viewer', [memberMap])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectId = route.view === 'project' ? route.id : null

  // Every live task once; views, breadcrumbs and progress badges derive from this set,
  // so a remote op that lands in IndexedDB updates all of them without a reload. The
  // snapshot is shared with the sidebar and the panel (large-list-performance D2).
  const allTasks = useLiveTasks() ?? NO_TASKS
  const taskMap = useMemo(() => new Map(allTasks.map((task) => [task.id, task])), [allTasks])
  const progress = useMemo(() => progressMap(allTasks), [allTasks])
  const blocked = useMemo(() => blockedMap(allTasks), [allTasks])
  // Streaks of habits (OpenSpec habits D5): once per list, from the rows it holds.
  const habits = useMemo(() => habitStatsMap(allTasks, today), [allTasks, today])

  const filter = useDurationFilter(route)
  const { duration, filterKey } = filter
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  const viewTasks = useMemo(() => tasksForView(route, allTasks, projects, today, userId), [allTasks, projects, route, today, zone, userId])
  const tasks = useMemo(() => (!duration || !filterKey ? viewTasks : viewTasks.filter(durationPredicate(duration))), [viewTasks, duration, filterKey])

  // Completed renders a page of the logbook at a time; a new route starts again.
  const [logbookLimit, setLogbookLimit] = useState(LOGBOOK_PAGE)
  useEffect(() => setLogbookLimit(LOGBOOK_PAGE), [route.view])
  const logbook = useMemo(() => (route.view === 'completed' ? logbookGroups(tasks, logbookLimit) : null), [route.view, tasks, logbookLimit])

  const { collapsed, toggleCollapsed } = useCollapsedRows()
  const layout = useProjectLayout(projectId)
  const { board, sections, liveSections, collapsedSections } = layout

  // Project lists keep deferred and parked tasks in a Later group at the
  // end (someday-and-evening D2); the board keeps every card in its column.
  const laterTasks = useMemo(() => (treeView && !board ? tasks.filter((task) => inLater(task, today)) : []), [treeView, board, tasks, today])
  const treeTasks = useMemo(() => (laterTasks.length ? tasks.filter((task) => !inLater(task, today)) : tasks), [laterTasks, tasks, today])
  const tree = useMemo(() => (treeView ? buildTaskTree(treeTasks) : null), [treeView, treeTasks])
  const buckets = useMemo(() => sectionBuckets(projectId, tree, sections), [projectId, tree, sections])
  const columns = useMemo(() => boardColumns(buckets), [buckets])

  const groups = useMemo<ListGroup[]>(() => listGroups({
    view: route.view, tasks, laterTasks, tree, today, resolved: dt.resolved, collapsed, blocked, taskMap,
    projects, projectMap, board, columns, buckets, sectionCount: liveSections.length, collapsedSections, logbook,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  }), [dt.resolved, tree, tasks, laterTasks, route.view, today, zone, collapsed, blocked, taskMap, projects, projectMap, board, columns, buckets, liveSections, collapsedSections, logbook])
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const siblingPos = useMemo(() => siblingPositions(groups), [groups])
  // Sections with only completed tasks keep a header with "n completed" and Show
  // (task-list-presentation "Empty groups").
  const doneBySection = useMemo(() => completedBySection(allTasks, projectId, layout.sectionMap), [allTasks, projectId, layout.sectionMap])
  // With "Show completed tasks" on (project-completed-section), the list layout
  // keeps them in one Completed group at the end, newest first, closed by default.
  const showCompletedPref = useShowCompletedPref(projectId)
  const showCompleted = !!projectId && showCompletedPref && !board && !layout.timeline
  const completedTasks = useMemo(() => (showCompleted ? completedNewestFirst(doneBySection) : NO_TASKS), [showCompleted, doneBySection])
  const completedOpen = !!projectId && collapsed.has(completedOpenKey(projectId))

  // A place's list (task-locations): undefined while loading, null when it does not exist.
  const placeId = route.view === 'place' ? route.id : null
  const currentPlace = usePlace(placeId)

  return {
    dt, today, zone, projects, projectMap, labels, labelMap, memberMap, isReadOnly, treeView, projectId,
    currentProject: route.view === 'project' ? projectMap.get(route.id) : undefined,
    currentLabel: route.view === 'label' ? labelMap.get(route.id) : undefined,
    currentPlace,
    projectReadOnly: route.view === 'project' && roleOf(route.id, memberMap) === 'viewer',
    projectEditable: !!projectId && canEditTasks(roleOf(projectId, memberMap)),
    allTasks, taskMap, progress, blocked, habits, ...filter, logbook, logbookLimit, setLogbookLimit,
    collapsed, toggleCollapsed, ...layout, tree, columns, groups, rows, siblingPos, doneBySection,
    showCompleted, completedTasks, completedOpen,
  }
}

export type ListModel = ReturnType<typeof useListModel>
