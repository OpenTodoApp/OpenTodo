import { Icon } from '../ui/Icon'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { formatDateHeading, localDueOf, todayISO } from '../lib/dates'
import { byPosition, compareByPosition, compareDueThenPriority } from '../lib/ordering'
import { resolveLabels } from '../lib/labels'
import { createSubtask, createTask, deleteTask, detachOccurrence, setTaskCompleted, setTaskParent, skipOccurrence, updateTask } from '../lib/ops'
import { breadcrumbOf, buildTaskTree, parentReadyToComplete, progressMap } from '../lib/subtasks'
import { DURATION_FILTERS, durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from '../lib/filters'
import { canEditTasks, memberName, roleOf } from '../lib/sharing'
import { flattenTree, type Tree, type TreeNode } from '../lib/tree'
import type { AccountRole, Label, Priority, Project, Section, Task } from '../lib/types'
import { TodayAsk } from './assistant/AskEntry'
import { beginDrag } from '../lib/dnd'
import { moveTask, moveTaskBy } from '../lib/move'
import { dropTarget, sameDrop, zoneUnder, type DropAt } from './listDrop'
import { effectiveSection, groupBySection, loadCollapsedSections, loadViewMode, moveTaskToSection, saveViewMode, setSectionCollapsed } from '../lib/sections'
import { BoardView, sectionTarget, type BoardColumn } from './BoardView'
import { AddSection, SectionHeader, SectionQuickAdd } from './Sections'
import { LabelPicker } from './LabelPicker'
import { AssigneePicker } from './AssigneePicker'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { TaskDetail } from './TaskDetail'
import { MAX_INDENT, TaskRow } from './TaskRow'
import { navigate, type Route } from './router'
import { ProjectHeader } from './ProjectHeader'
import { offerArchiveAfterCompletion } from './ArchivePrompt'
import { SubProjects } from './SubProjects'
import { estimateFocus, isGPending, openTask, placeInDay } from './signals'
import { visibleTasks } from '../lib/trash'
import { useViewerZone } from './useViews'
import { registerListState, taskDefaults } from './listActions'
import { Dialog } from './overlay'
import { useDateTimeFormat } from './DateTimePrefsProvider'

type ListRoute = Exclude<Route, { view: 'trash' } | { view: 'feed' } | { view: 'settings' } | { view: 'import' } | { view: 'invite' } | { view: 'project-invite' } | { view: 'reset' } | { view: 'labels' } | { view: 'filter' } | { view: 'share' } | { view: 'views' } | { view: 'view' } | { view: 'day' } | { view: 'week' } | { view: 'help' } | { view: 'ask' }>

/** One rendered line: a task with its place in the (possibly flat) tree. */
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
}

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
  const isReadOnly = useCallback((t: Task | undefined) => !!t && roleOf(t.project_id, memberMap) === 'viewer', [memberMap])
  const projectReadOnly = route.view === 'project' && roleOf(route.id, memberMap) === 'viewer'
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const currentLabel = route.view === 'label' ? labelMap.get(route.id) : undefined

  // Every live task once; views, breadcrumbs and progress badges derive from this set,
  // so a remote op that lands in IndexedDB updates all of them without a reload.
  const allTasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks])
  const progress = useMemo(() => progressMap(allTasks), [allTasks])

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
    // Tasks of archived projects stay out of the cross-project views.
    const hidden = new Set(projects.filter((p) => p.archived).map((p) => p.id))
    const all = allTasks.filter((t) => !t.project_id || !hidden.has(t.project_id) || (route.view === 'project' && t.project_id === route.id))
    switch (route.view) {
      case 'inbox':
        return all.filter((t) => !t.completed_at && t.project_id === null)
      case 'today':
        return all.filter((t) => !t.completed_at && t.due && localDueOf(t.due).date <= today).sort(compareDueThenPriority)
      case 'upcoming':
        return all.filter((t) => !t.completed_at && t.due && localDueOf(t.due).date > today).sort(compareDueThenPriority)
      case 'completed':
        return all.filter((t) => t.completed_at).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0)).slice(0, 100)
      case 'project':
        return all.filter((t) => !t.completed_at && t.project_id === route.id)
      case 'label':
        return all.filter((t) => !t.completed_at && t.labels.includes(route.id)).sort(byPosition)
      case 'assigned':
        return all.filter((t) => !t.completed_at && !!userId && t.assignee_id === userId).sort(compareDueThenPriority)
    }
  }, [allTasks, projects, route, today, zone, userId])

  const tasks = useMemo(() => {
    if (!duration || !filterKey) return viewTasks
    const keep = durationPredicate(duration)
    return viewTasks.filter(keep)
  }, [viewTasks, duration, filterKey])

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

  const tree = useMemo<Tree<Task> | null>(() => (treeView ? buildTaskTree(tasks) : null), [treeView, tasks])

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
  const projectEditable = !!projectId && canEditTasks(roleOf(projectId, memberMap))
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  /** Top-level tasks of the project bucketed by section: list headings and board columns. */
  const sectionGroups = useMemo(() => {
    if (!projectId || !tree) return null
    const byId = new Map(tree.roots.map((n) => [n.id, n]))
    return groupBySection(projectId, tree.roots.map((n) => n.item), sections).map((g) => ({
      ...g, roots: g.tasks.map((t) => byId.get(t.id) as TreeNode<Task>),
    }))
  }, [projectId, tree, sections])
  const columns = useMemo<BoardColumn[]>(
    () => (sectionGroups ?? []).map((g) => ({ key: g.key, section: g.section, cards: g.tasks })), [sectionGroups],
  )

  const groups = useMemo<Group[]>(() => {
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
        key: c.key, heading: null, rows: c.cards.map((t) => ({ task: t, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: null })),
      }))
    }
    if (sectionGroups && liveSections.length > 0) {
      // Project list with sections: "No section" first, then each section by position.
      const folded = new Set(collapsedSections)
      return sectionGroups.map((g) => ({
        key: `section:${g.key}`,
        heading: g.section ? g.section.name : 'No section',
        section: g.section,
        sectionCollapsed: folded.has(g.key),
        count: flattenTree(g.roots).length,
        rows: folded.has(g.key) ? [] : flattenTree(g.roots, (id) => collapsed.has(id)).map(toRow),
      }))
    }
    if (tree) {
      // Project and Inbox: one depth-first pass over the built tree (linear in task count).
      return [{ key: 'all', heading: null, rows: flattenTree(tree.roots, (id) => collapsed.has(id)).map(toRow) }]
    }
    // Cross-project and date views: flat, each matching task once, with its parent named.
    const flatRow = (t: Task): Row => ({
      task: t, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: t.parent_id ? breadcrumbOf(t, taskMap) : null,
    })
    if (route.view === 'today') {
      const overdue = tasks.filter((t) => t.due && localDueOf(t.due).date < today)
      const due = tasks.filter((t) => t.due && localDueOf(t.due).date === today)
      const g: Group[] = []
      if (overdue.length) g.push({ key: 'overdue', heading: 'Overdue', rows: overdue.map(flatRow) })
      g.push({ key: 'today', heading: overdue.length ? 'Today' : null, rows: due.map(flatRow) })
      return g
    }
    if (route.view === 'upcoming') {
      const byDate = new Map<string, Task[]>()
      for (const t of tasks) {
        if (!t.due) continue
        const date = localDueOf(t.due).date
        const list = byDate.get(date) ?? []
        list.push(t)
        byDate.set(date, list)
      }
      return [...byDate.entries()].map(([date, list]) => ({ key: date, heading: formatDateHeading(date, today, dt.resolved), rows: list.map(flatRow) }))
    }
    if (route.view === 'label' || route.view === 'assigned') {
      // Grouped by project: Inbox first, then projects in sidebar order; flat rows with breadcrumbs.
      const byProject = new Map<string, Task[]>()
      for (const t of tasks) byProject.set(t.project_id ?? '', [...(byProject.get(t.project_id ?? '') ?? []), t])
      const order = ['', ...projects.slice().sort(compareByPosition).map((p) => p.id)]
      return order.filter((id) => byProject.has(id)).map((id) => ({
        key: id || 'inbox', heading: id ? projectMap.get(id)?.name ?? 'Project' : 'Inbox', rows: byProject.get(id)!.map(flatRow),
      }))
    }
    return [{ key: 'all', heading: null, rows: tasks.map(flatRow) }]
  }, [dt.resolved, tree, tasks, route.view, today, zone, collapsed, taskMap, projects, projectMap, board, columns, sectionGroups, liveSections, collapsedSections])

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  /** Parent whose last open subtask was just completed; Enter completes it too. */
  const [prompt, setPrompt] = useState<Task | null>(null)
  /** Task whose label picker (`L`) is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  /** Task whose assignee picker (Shift+A) is open (task-assignment). */
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)
  /** Section whose quick add is open ('' = "No section"), board-view. */
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const toggleViewMode = useCallback(() => {
    if (projectId) void saveViewMode(projectId, board ? 'list' : 'board')
  }, [projectId, board])
  const toggleSection = useCallback((key: string, force?: boolean) => {
    if (projectId) void setSectionCollapsed(projectId, key, force ?? !collapsedSections.includes(key))
  }, [projectId, collapsedSections])

  /** Move a top-level task to a section ('' = none); a no-op when it is already there. */
  const moveToSection = useCallback((task: Task, key: string) => {
    if ((effectiveSection(task, sectionMap) ?? '') === key) return
    void moveTaskToSection(task.id, key || null).catch(() => undefined)
  }, [sectionMap])

  // Manual ordering (OpenSpec `manual-ordering`): project lists and boards (editors
  // and above) and the Inbox. Date and filter views keep their own sort.
  const manual = (route.view === 'project' && projectEditable) || route.view === 'inbox'
  /** Section key ('' = "No section") of each top-level row or card in a sectioned project. */
  const sectionOfRow = useMemo(() => {
    const m = new Map<string, string>()
    if (board) for (const c of columns) for (const t of c.cards) m.set(t.id, c.key)
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
          const t = dropTarget({ id: r.task.id, parent: r.parent, expanded: !b && r.hasChildren && !r.collapsed }, current.zone)
          const section = t.parent_id === null ? secs.get(r.task.id) : undefined
          void moveTask(task.id, { ...t, ...(section !== undefined ? { section_id: section } : {}) })
        } else if (target.startsWith('section:')) {
          const key = target.slice('section:'.length)
          const row = rs.find((x) => x.task.id === task.id)
          if (row && row.parent === null) moveToSection(task, key)
          else void moveTask(task.id, { parent_id: null, section_id: key, at: 'bottom' })
        } else return
        setSelectedId(task.id)
      },
      onEnd: () => show(null),
    })
  }, [manual, moveToSection])

  useEffect(() => {
    // A pending "open this task" request (reminder toast, notification click) survives the route change.
    const want = openTask.take()
    setSelectedId(want)
    setOpenId(want)
    setAddingUnder(null)
    setPrompt(null)
    setPickerFor(null)
    setAssignFor(null)
    setAddingTo(null)
  }, [route])
  useEffect(() => openTask.subscribe((id) => {
    openTask.take(id)
    setSelectedId(id)
    setOpenId(id)
  }), [])

  useEffect(() => {
    if (openId && !rows.some((r) => r.task.id === openId)) {
      // Task left this view (completed, moved, collapsed); keep the panel if the task still exists.
      void db.tasks.get(openId).then((t) => {
        if (!t || t.deleted_at) setOpenId(null)
      })
    }
  }, [rows, openId])

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
    await setTaskCompleted(id, completed)
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
    void toggleComplete(parent.id, true)
  }, [prompt, toggleComplete])

  const indent = useCallback((row: Row, idx: number) => {
    // The previous visible sibling: scan upwards at the same depth, stopping at an ancestor.
    for (let i = idx - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.depth < row.depth) return
      if (r.depth === row.depth && r.parent === row.parent) {
        toggleCollapsed(r.task.id, false)
        void setTaskParent(row.task.id, r.task.id).catch(() => undefined)
        return
      }
    }
  }, [rows, toggleCollapsed])

  const outdent = useCallback((row: Row) => {
    if (!tree || row.parent === null) return
    const grandparent = tree.nodes.get(row.parent)?.parent ?? null
    void setTaskParent(row.task.id, grandparent).catch(() => undefined)
  }, [tree])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // Keyboard moves (manual-ordering): Alt+Up/Down one place, with Shift to the
        // top / bottom of the task's list. Only in manually ordered views, never
        // while typing; the selection stays on the moved task; edges do nothing.
        if (typing || isGPending() || !manual || !selectedId || document.querySelector('[role="dialog"]')) return
        e.preventDefault()
        const up = e.key === 'ArrowUp'
        void moveTaskBy(selectedId, e.shiftKey ? (up ? 'top' : 'bottom') : up ? -1 : 1)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        if (typing) (target as HTMLElement).blur()
        else if (pickerFor) setPickerFor(null)
        else if (assignFor) setAssignFor(null)
        else if (prompt) setPrompt(null)
        else if (addingUnder) setAddingUnder(null)
        else if (openId) setOpenId(null)
        else setSelectedId(null)
        return
      }
      if (typing || isGPending()) return
      if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key) && (document.activeElement as HTMLElement | null)?.closest?.('nav[aria-label="Projects"]')) {
        // Selecting tasks moves keyboard attention to the list: a sidebar project left
        // focused by a click must not take the next Alt+Up/Down (manual-ordering).
        (document.activeElement as HTMLElement).blur()
      }
      const idx = rows.findIndex((r) => r.task.id === selectedId)
      const row = idx >= 0 ? rows[idx] : undefined
      // A viewer may navigate and open tasks of a shared project, never change them.
      if (row && isReadOnly(row.task) && ['a', 'A', 'Tab', 'c', 'L', '1', '2', '3', '4', 'Delete', 'Backspace'].includes(e.key)) return
      if (e.key === 'q' && projectReadOnly) return
      if (e.key === 'v' && projectId) {
        // List / board toggle, remembered per project on this device (board-view).
        e.preventDefault()
        toggleViewMode()
        return
      }
      if (board) {
        const col = columns.findIndex((c) => c.cards.some((t) => t.id === selectedId))
        const pos = col >= 0 ? columns[col].cards.findIndex((t) => t.id === selectedId) : -1
        const firstCard = (from: number, dir: 1 | -1) => {
          for (let i = from; i >= 0 && i < columns.length; i += dir) if (columns[i].cards.length) return columns[i].cards[0].id
          return null
        }
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
          case 'k':
          case 'ArrowUp': {
            e.preventDefault()
            const down = e.key === 'j' || e.key === 'ArrowDown'
            if (col < 0) setSelectedId(firstCard(0, 1))
            else setSelectedId(columns[col].cards[Math.max(0, Math.min(columns[col].cards.length - 1, pos + (down ? 1 : -1)))].id)
            return
          }
          case 'h':
          case 'l':
          case 'ArrowLeft':
          case 'ArrowRight': {
            e.preventDefault()
            const dir = e.key === 'h' || e.key === 'ArrowLeft' ? -1 : 1
            if (e.shiftKey && e.key.startsWith('Arrow')) {
              // Shift+←/→ moves the selected card to the adjacent column; it stays selected.
              const target = columns[col + dir]
              if (row && col >= 0 && target && projectEditable) moveToSection(row.task, target.key)
              return
            }
            if (col < 0) setSelectedId(firstCard(0, 1))
            else setSelectedId(firstCard(col + dir, dir) ?? selectedId)
            return
          }
          case 'a':
            // On the board, `a` opens the quick add of the selected card's column.
            if (projectEditable) {
              e.preventDefault()
              setAddingTo(col >= 0 ? columns[col].key : '')
            }
            return
          case 'Tab':
            return
        }
      }
      switch (e.key) {
        case 'q':
          e.preventDefault()
          quickAddRef.current?.focus()
          break
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setSelectedId(rows[Math.min(rows.length - 1, idx + 1)]?.task.id ?? null)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setSelectedId(rows[Math.max(0, idx - 1)]?.task.id ?? null)
          break
        case 'ArrowLeft':
          if (!row || !treeView) break
          e.preventDefault()
          if (row.hasChildren && !row.collapsed) toggleCollapsed(row.task.id, true)
          else if (row.parent) setSelectedId(row.parent)
          break
        case 'ArrowRight':
          if (!row || !treeView) break
          e.preventDefault()
          if (row.hasChildren && row.collapsed) toggleCollapsed(row.task.id, false)
          break
        case 'Enter':
          if (prompt) {
            e.preventDefault()
            acceptPrompt()
          } else if (selectedId) setOpenId(selectedId)
          break
        case 'a':
          if (row) {
            e.preventDefault()
            toggleCollapsed(row.task.id, false)
            setAddingUnder(row.task.id)
          }
          break
        case 'Tab':
          if (row && treeView) {
            e.preventDefault()
            if (e.shiftKey) outdent(row)
            else indent(row, idx)
          }
          break
        case 'c':
          if (row) void toggleComplete(row.task.id, !row.task.completed_at)
          break
        case 'S': {
          // Skip the current occurrence of the selected (or open) recurring task.
          const id = row?.task.id ?? openId
          if (id) {
            e.preventDefault()
            void skipOccurrence(id)
          }
          break
        }
        case 'O': {
          // "This occurrence only": detach a standalone copy and open it.
          const id = row?.task.id ?? openId
          if (id) {
            e.preventDefault()
            void detachOccurrence(id).then((copy) => {
              if (copy) {
                setSelectedId(copy)
                setOpenId(copy)
              }
            })
          }
          break
        }
        case 'L':
          if (row) {
            e.preventDefault()
            setPickerFor(row.task.id)
          }
          break
        case 'A':
          if (row && userId) {
            e.preventDefault()
            setAssignFor(row.task.id)
          }
          break
        case 's':
          // Placement mode in the Day view (OpenSpec `time-blocking`).
          if (row && !row.task.completed_at) {
            e.preventDefault()
            placeInDay(row.task, todayISO())
          }
          break
        case 'e':
          if (row) {
            e.preventDefault()
            estimateFocus.request(row.task.id)
            setOpenId(row.task.id)
          }
          break
        case '1':
        case '2':
        case '3':
        case '4':
          if (selectedId) void updateTask(selectedId, { priority: Number(e.key) as Priority })
          break
        case 'Delete':
        case 'Backspace':
          if (selectedId) {
            e.preventDefault()
            void deleteTask(selectedId)
            setSelectedId(rows[idx + 1]?.task.id ?? rows[idx - 1]?.task.id ?? null)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selectedId, openId, addingUnder, prompt, pickerFor, assignFor, userId, treeView, toggleCollapsed, toggleComplete, acceptPrompt, indent, outdent, isReadOnly, projectReadOnly,
    projectId, board, columns, projectEditable, toggleViewMode, moveToSection, manual])

  // List actions for the optional Vim layer (vim-keybindings, design D3); getters
  // read the latest render through a ref so the registration happens once.
  const live = useRef({ rows, columns, board, selectedId, openId, manual, isReadOnly, toggleComplete })
  live.current = { rows, columns, board, selectedId, openId, manual, isReadOnly, toggleComplete }
  useEffect(() => registerListState({
    rows: () => live.current.rows.map((r) => r.task),
    columns: () => (live.current.board ? live.current.columns.map((c) => c.cards) : null),
    selected: () => live.current.selectedId,
    select: setSelectedId,
    openId: () => live.current.openId,
    open: setOpenId,
    readOnly: (t) => live.current.isReadOnly(t),
    manual: () => live.current.manual,
    focusQuickAdd: (after) => {
      const input = quickAddRef.current
      if (!input) return false
      insertAfter.current = after
      input.focus()
      return true
    },
    toggleComplete: (id, completed) => live.current.toggleComplete(id, completed),
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

  useEffect(() => {
    if (!selectedId) return
    document.querySelector(`[data-task-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  /** One task line (or a board card); in manually ordered views rows drag and accept drops. */
  const renderRow = (r: Row) => (
    <Fragment key={r.task.id}>
      <TaskRow
        task={r.task}
        project={r.task.project_id ? projectMap.get(r.task.project_id) : undefined}
        labels={resolveLabels(r.task.labels, labelMap)}
        assignee={r.task.assignee_id && r.task.project_id && memberMap.has(r.task.project_id)
          ? (r.task.assignee_id === userId ? 'You' : memberName(r.task.assignee_id, memberMap) ?? 'Former member') : null}
        assignedToMe={!!userId && r.task.assignee_id === userId}
        showProject={route.view !== 'project' && route.view !== 'label'}
        selected={r.task.id === selectedId}
        depth={r.depth}
        progress={progress.get(r.task.id)}
        breadcrumb={r.breadcrumb}
        hasChildren={r.hasChildren}
        collapsed={r.collapsed}
        readOnly={isReadOnly(r.task)}
        card={board}
        onPointerDown={manual ? (e) => startDrag(e, r.task) : undefined}
        dropKey={manual ? `task:${r.task.id}` : undefined}
        dropIndicator={dropAt?.id === r.task.id ? dropAt.zone : null}
        onToggle={() => void toggleComplete(r.task.id, !r.task.completed_at)}
        onToggleCollapse={treeView && !board ? () => toggleCollapsed(r.task.id) : undefined}
        onOpen={() => {
          setSelectedId(r.task.id)
          setOpenId(r.task.id)
        }}
      />
      {addingUnder === r.task.id && !board && (
        <li>
          <SubtaskInput parent={r.task} depth={r.depth + 1} onClose={() => setAddingUnder(null)} />
        </li>
      )}
    </Fragment>
  )

  const title = {
    inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', completed: 'Completed', assigned: 'Assigned to me', project: currentProject?.name ?? 'Project', label: currentLabel?.name ?? 'Label',
  }[route.view]

  if (route.view === 'project' && projects.length > 0 && !currentProject) {
    return (
      <div className="p-6 text-sm text-muted">
        This project no longer exists. <button className="underline" onClick={() => navigate({ view: 'inbox' })}>Go to Inbox</button>
      </div>
    )
  }
  if (route.view === 'label' && labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) {
    return (
      <div className="p-6 text-sm text-muted">
        This label no longer exists. <button className="underline" onClick={() => navigate({ view: 'labels' })}>All labels</button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 px-4 py-5 md:px-8">
        <div className={board ? 'mx-auto' : 'mx-auto max-w-3xl'}>
          {route.view === 'project' && currentProject ? (
            <>
              <ProjectHeader project={currentProject} userId={userId} />
              <div className="-mt-2 mb-3 flex items-center gap-1 text-xs" role="group" aria-label="Project layout">
                {(['list', 'board'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={viewMode === m} onClick={() => { if (viewMode !== m) toggleViewMode() }}
                    className={`rounded-md px-2 py-0.5 ${viewMode === m ? 'bg-slate-200 font-medium dark:bg-slate-700' : 'text-muted hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    {m === 'list' ? 'List' : 'Board'}
                  </button>
                ))}
                <span className="kbd ml-1" title="Toggle list / board">v</span>
              </div>
            </>
          ) : (
            <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              {currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              {title}
              {route.view === 'today' && <span className="ml-2 text-sm font-normal text-faint">{dt.formatDate(today, 'heading')}</span>}
              {route.view === 'label' && <span className="text-sm font-normal text-faint">{rows.length}</span>}
              {(route.view === 'today' || route.view === 'upcoming' || route.view === 'assigned') && (
                <span className="ml-auto text-xs font-normal text-faint" title="This view is sorted by date: drag and Alt+↑/↓ are off here" data-sort-note>sorted by date</span>
              )}
            </h1>
          )}

          {route.view === 'today' && <TodayAsk role={userRole} />}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              {projectReadOnly ? (
                <>
                  <input className="input" disabled aria-label="Quick add (read-only)" placeholder="You can view this project but not add tasks" />
                  <p role="note" className="mt-1 text-xs text-muted">Read-only: you are a viewer of this shared project.</p>
                </>
              ) : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} projects={projects} labels={labels} placeholder={placeholderFor(route, currentProject, currentLabel)} voiceShortcut />
              )}
            </div>
          )}

          {filterKey && <DurationChips active={duration} onChange={chooseDuration} />}

          {rows.length === 0 && !(board || liveSections.length > 0) && (duration ? (
            <p className="px-2 py-8 text-center text-sm text-faint">
              No task matches this duration filter. <button className="underline" onClick={() => chooseDuration(null)}>Clear the filter</button>
            </p>
          ) : <EmptyState view={route.view} />)}

          {board && currentProject ? (
            <BoardView
              project={currentProject}
              columns={columns}
              editable={projectEditable}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
              projects={projects}
              labels={labels}
              renderCard={(t) => renderRow({ task: t, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: null })}
            />
          ) : groups.map((g, gi) => g.section !== undefined && currentProject ? (
            // Project list grouped by section (board-view): headings are drop targets.
            <section key={g.key} className="mb-3 rounded-md data-drop-active:ring-2 data-drop-active:ring-emerald-500" data-drop-target={sectionTarget(g.section?.id ?? '')}>
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
              />
              {addingTo === (g.section?.id ?? '') && projectEditable && (
                <SectionQuickAdd project={currentProject} sectionId={g.section?.id ?? null} sectionName={g.heading ?? 'No section'} projects={projects} labels={labels} onClose={() => setAddingTo(null)} />
              )}
              <ul>{g.rows.map((r) => renderRow(r))}</ul>
            </section>
          ) : (
            <section key={g.key} className="mb-4">
              {g.heading && <h2 className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-faint'}`}>{g.heading}</h2>}
              <ul>{g.rows.map((r) => renderRow(r))}</ul>
            </section>
          ))}
          {route.view === 'project' && !board && projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
          {route.view === 'project' && <SubProjects projectId={route.id} />}
        </div>
      </div>
      {openId && (
        <TaskDetail
          // Remount per task so the picker and drafts never show the previous task's data.
          key={openId}
          taskId={openId}
          userId={userId}
          readOnly={isReadOnly(taskMap.get(openId))}
          projects={projects}
          labelMap={labelMap}
          onClose={() => setOpenId(null)}
          onOpen={(id) => { setSelectedId(id); setOpenId(id) }}
          onToggleComplete={(t) => void toggleComplete(t.id, !t.completed_at)}
        />
      )}
      {prompt && (
        <div role="status" className="fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(var(--vv-bottom, 0px) + max(1rem, env(safe-area-inset-bottom)))' }}>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <span className="user-text min-w-0">All subtasks done. Complete <strong>{prompt.title || 'Untitled'}</strong> too?</span>
            <button className="btn-primary text-xs" onClick={acceptPrompt}>Complete <span className="kbd ml-1 border-emerald-500 bg-emerald-800 text-white">Enter</span></button>
            <button className="btn-ghost text-xs" onClick={() => setPrompt(null)}>Keep open <span className="kbd ml-1">Esc</span></button>
          </div>
        </div>
      )}
      {assignFor && userId && (
        <Dialog title="Assign" label="Assign task" onClose={() => setAssignFor(null)}>
          <AssigneePicker taskId={assignFor} userId={userId} onClose={() => setAssignFor(null)} />
          <p className="mt-2 px-1 text-[11px] text-faint">Type to filter · Enter assigns · Esc closes</p>
        </Dialog>
      )}
      {pickerFor && (
        <Dialog title="Labels" label="Labels for task" onClose={() => setPickerFor(null)}>
          <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
          <p className="mt-2 px-1 text-[11px] text-faint">Enter toggles or creates · Esc closes</p>
        </Dialog>
      )}
    </div>
  )
}

/** Inline "Add subtask" line under a row; stays focused for the next entry, Escape closes. */
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
      <span className="text-emerald-700 dark:text-emerald-400">+</span>
      <input
        ref={ref}
        className="input py-1"
        placeholder={`Add a subtask to ${parent.title || 'this task'}…`}
        aria-label="Add a subtask"
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

function DurationChips({ active, onChange }: { active: DurationFilter | null; onChange: (kind: DurationFilter | null) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Duration filter">
      {DURATION_FILTERS.map((f) => (
        <button
          key={f.kind}
          type="button"
          title={f.title}
          aria-pressed={active === f.kind}
          onClick={() => onChange(active === f.kind ? null : f.kind)}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${active === f.kind ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-slate-200 text-muted hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'}`}
        >
          {f.label}
        </button>
      ))}
      {active && (
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange(null)} data-clear-duration>
          <Icon name="x" size="xs" />Clear filter
        </button>
      )}
    </div>
  )
}

function placeholderFor(route: ListRoute, project?: Project, label?: Label): string {
  switch (route.view) {
    case 'today':
      return 'Add a task for today…'
    case 'upcoming':
      return 'Add a task for tomorrow…'
    case 'project':
      return `Add a task to ${project?.name ?? 'this project'}…`
    case 'label':
      return `Add a task labelled ${label?.name ?? 'this'}…`
    case 'assigned':
      return 'Add a task assigned to you…'
    default:
      return 'Add a task to your Inbox…'
  }
}

function EmptyState({ view }: { view: ListRoute['view'] }) {
  const text = {
    inbox: 'Your Inbox is empty. Press q to capture something.',
    today: 'Nothing due today. Enjoy the calm, or pull something in from Upcoming.',
    upcoming: 'No scheduled tasks. Add a due date to a task and it will show up here.',
    completed: 'Nothing completed yet. Completed tasks show up here for a while.',
    project: 'This project has no open tasks.',
    label: 'No open task carries this label. Select a task and press L to add it.',
    assigned: 'Nothing is assigned to you. Select a task and press Shift+A to assign it.',
  }[view]
  return <p className="px-2 py-8 text-center text-sm text-faint">{text}</p>
}

