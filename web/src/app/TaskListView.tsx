import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { compareDue, formatDateHeading, todayISO } from '../lib/dates'
import { resolveLabels } from '../lib/labels'
import { createSubtask, createTask, deleteTask, detachOccurrence, setTaskCompleted, setTaskParent, skipOccurrence, updateTask } from '../lib/ops'
import { breadcrumbOf, buildTaskTree, parentReadyToComplete, progressMap } from '../lib/subtasks'
import { DURATION_FILTERS, durationPredicate, loadDurationFilter, saveDurationFilter, type DurationFilter } from '../lib/filters'
import { roleOf } from '../lib/sharing'
import { flattenTree, type Tree } from '../lib/tree'
import type { Label, Priority, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { TaskDetail } from './TaskDetail'
import { MAX_INDENT, TaskRow } from './TaskRow'
import { navigate, type Route } from './router'
import { ProjectHeader } from './ProjectHeader'
import { offerArchiveAfterCompletion } from './ArchivePrompt'
import { SubProjects } from './SubProjects'
import { estimateFocus, isGPending, openTask, placeInDay } from './signals'
import { visibleTasks } from '../lib/trash'

type ListRoute = Exclude<Route, { view: 'trash' } | { view: 'settings' } | { view: 'import' } | { view: 'invite' } | { view: 'labels' } | { view: 'filter' } | { view: 'share' } | { view: 'views' } | { view: 'view' } | { view: 'day' } | { view: 'week' }>

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

export function TaskListView({ route, userId }: { route: ListRoute; userId?: string }) {
  const today = todayISO()
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
        return all.filter((t) => !t.completed_at && t.due && t.due.date <= today).sort(byDueThenPriority)
      case 'upcoming':
        return all.filter((t) => !t.completed_at && t.due && t.due.date > today).sort(byDueThenPriority)
      case 'completed':
        return all.filter((t) => t.completed_at).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0)).slice(0, 100)
      case 'project':
        return all.filter((t) => !t.completed_at && t.project_id === route.id)
      case 'label':
        return all.filter((t) => !t.completed_at && t.labels.includes(route.id)).sort(byPosition)
    }
  }, [allTasks, projects, route, today])

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

  const groups = useMemo<Group[]>(() => {
    if (tree) {
      // Project and Inbox: one depth-first pass over the built tree (linear in task count).
      const rows = flattenTree(tree.roots, (id) => collapsed.has(id)).map<Row>((n) => ({
        task: n.item,
        depth: n.depth,
        parent: n.parent,
        hasChildren: n.children.length > 0,
        collapsed: collapsed.has(n.id),
        // A top-level task that still points at a parent (completed, deleted, missing) names it.
        breadcrumb: n.parent === null && n.item.parent_id ? breadcrumbOf(n.item, taskMap) : null,
      }))
      return [{ key: 'all', heading: null, rows }]
    }
    // Cross-project and date views: flat, each matching task once, with its parent named.
    const flatRow = (t: Task): Row => ({
      task: t, depth: 0, parent: null, hasChildren: false, collapsed: false, breadcrumb: t.parent_id ? breadcrumbOf(t, taskMap) : null,
    })
    if (route.view === 'today') {
      const overdue = tasks.filter((t) => t.due && t.due.date < today)
      const due = tasks.filter((t) => t.due && t.due.date === today)
      const g: Group[] = []
      if (overdue.length) g.push({ key: 'overdue', heading: 'Overdue', rows: overdue.map(flatRow) })
      g.push({ key: 'today', heading: overdue.length ? 'Today' : null, rows: due.map(flatRow) })
      return g
    }
    if (route.view === 'upcoming') {
      const byDate = new Map<string, Task[]>()
      for (const t of tasks) {
        if (!t.due) continue
        const list = byDate.get(t.due.date) ?? []
        list.push(t)
        byDate.set(t.due.date, list)
      }
      return [...byDate.entries()].map(([date, list]) => ({ key: date, heading: formatDateHeading(date, today), rows: list.map(flatRow) }))
    }
    if (route.view === 'label') {
      // Grouped by project: Inbox first, then projects in sidebar order; flat rows with breadcrumbs.
      const byProject = new Map<string, Task[]>()
      for (const t of tasks) byProject.set(t.project_id ?? '', [...(byProject.get(t.project_id ?? '') ?? []), t])
      const order = ['', ...projects.slice().sort((a, b) => a.position - b.position).map((p) => p.id)]
      return order.filter((id) => byProject.has(id)).map((id) => ({
        key: id || 'inbox', heading: id ? projectMap.get(id)?.name ?? 'Project' : 'Inbox', rows: byProject.get(id)!.map(flatRow),
      }))
    }
    return [{ key: 'all', heading: null, rows: tasks.map(flatRow) }]
  }, [tree, tasks, route.view, today, collapsed, taskMap, projects, projectMap])

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  /** Parent whose last open subtask was just completed; Enter completes it too. */
  const [prompt, setPrompt] = useState<Task | null>(null)
  /** Task whose label picker (`L`) is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // A pending "open this task" request (reminder toast, notification click) survives the route change.
    const want = openTask.take()
    setSelectedId(want)
    setOpenId(want)
    setAddingUnder(null)
    setPrompt(null)
    setPickerFor(null)
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

  // The view supplies defaults; attributes typed in the quick-add line override them.
  const onAdd = useCallback(async ({ labels: typed, ...rest }: QuickAddInput) => {
    await createTask({
      project_id: route.view === 'project' ? route.id : null,
      due: route.view === 'today' ? { date: today } : route.view === 'upcoming' ? { date: addDays(today, 1) } : null,
      ...rest,
      // Labels are multi-valued: a label view's label is kept alongside typed @labels.
      labels: [...new Set([...(route.view === 'label' ? [route.id] : []), ...(typed ?? [])])],
    })
  }, [route, today])

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
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (e.key === 'Escape') {
        if (typing) (target as HTMLElement).blur()
        else if (pickerFor) setPickerFor(null)
        else if (prompt) setPrompt(null)
        else if (addingUnder) setAddingUnder(null)
        else if (openId) setOpenId(null)
        else setSelectedId(null)
        return
      }
      if (typing || isGPending()) return
      const idx = rows.findIndex((r) => r.task.id === selectedId)
      const row = idx >= 0 ? rows[idx] : undefined
      // A viewer may navigate and open tasks of a shared project, never change them.
      if (row && isReadOnly(row.task) && ['a', 'Tab', 'c', 'L', '1', '2', '3', '4', 'Delete', 'Backspace'].includes(e.key)) return
      if (e.key === 'q' && projectReadOnly) return
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
  }, [rows, selectedId, openId, addingUnder, prompt, pickerFor, treeView, toggleCollapsed, toggleComplete, acceptPrompt, indent, outdent, isReadOnly, projectReadOnly])

  useEffect(() => {
    if (!selectedId) return
    document.querySelector(`[data-task-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const title = {
    inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', completed: 'Completed', project: currentProject?.name ?? 'Project', label: currentLabel?.name ?? 'Label',
  }[route.view]

  if (route.view === 'project' && projects.length > 0 && !currentProject) {
    return (
      <div className="p-6 text-sm text-slate-500">
        This project no longer exists. <button className="underline" onClick={() => navigate({ view: 'inbox' })}>Go to Inbox</button>
      </div>
    )
  }
  if (route.view === 'label' && labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) {
    return (
      <div className="p-6 text-sm text-slate-500">
        This label no longer exists. <button className="underline" onClick={() => navigate({ view: 'labels' })}>All labels</button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} />
          ) : (
            <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              {currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              {title}
              {route.view === 'today' && <span className="ml-2 text-sm font-normal text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
              {route.view === 'label' && <span className="text-sm font-normal text-slate-400">{rows.length}</span>}
            </h1>
          )}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              {projectReadOnly ? (
                <>
                  <input className="input" disabled aria-label="Quick add (read-only)" placeholder="You can view this project but not add tasks" />
                  <p role="note" className="mt-1 text-xs text-slate-500">Read-only: you are a viewer of this shared project.</p>
                </>
              ) : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} projects={projects} labels={labels} placeholder={placeholderFor(route, currentProject, currentLabel)} />
              )}
            </div>
          )}

          {filterKey && <DurationChips active={duration} onChange={chooseDuration} />}

          {rows.length === 0 && (duration ? (
            <p className="px-2 py-8 text-center text-sm text-slate-400">
              No task matches this duration filter. <button className="underline" onClick={() => chooseDuration(null)}>Clear the filter</button>
            </p>
          ) : <EmptyState view={route.view} />)}

          {groups.map((g) => (
            <section key={g.key} className="mb-4">
              {g.heading && <h2 className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-red-600' : 'text-slate-400'}`}>{g.heading}</h2>}
              <ul>
                {g.rows.map((r) => (
                  <Fragment key={r.task.id}>
                    <TaskRow
                      task={r.task}
                      project={r.task.project_id ? projectMap.get(r.task.project_id) : undefined}
                      labels={resolveLabels(r.task.labels, labelMap)}
                      showProject={route.view !== 'project' && route.view !== 'label'}
                      selected={r.task.id === selectedId}
                      depth={r.depth}
                      progress={progress.get(r.task.id)}
                      breadcrumb={r.breadcrumb}
                      hasChildren={r.hasChildren}
                      collapsed={r.collapsed}
                      readOnly={isReadOnly(r.task)}
                      onToggle={() => void toggleComplete(r.task.id, !r.task.completed_at)}
                      onToggleCollapse={treeView ? () => toggleCollapsed(r.task.id) : undefined}
                      onOpen={() => {
                        setSelectedId(r.task.id)
                        setOpenId(r.task.id)
                      }}
                    />
                    {addingUnder === r.task.id && (
                      <li>
                        <SubtaskInput parent={r.task} depth={r.depth + 1} onClose={() => setAddingUnder(null)} />
                      </li>
                    )}
                  </Fragment>
                ))}
              </ul>
            </section>
          ))}
          {route.view === 'project' && <SubProjects projectId={route.id} />}
        </div>
      </div>
      {openId && (
        <TaskDetail
          // Remount per task so the picker and drafts never show the previous task's data.
          key={openId}
          taskId={openId}
          readOnly={isReadOnly(taskMap.get(openId))}
          projects={projects}
          labelMap={labelMap}
          onClose={() => setOpenId(null)}
          onOpen={(id) => { setSelectedId(id); setOpenId(id) }}
          onToggleComplete={(t) => void toggleComplete(t.id, !t.completed_at)}
        />
      )}
      {prompt && (
        <div role="status" className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <span>All subtasks done. Complete <strong>{prompt.title || 'Untitled'}</strong> too?</span>
            <button className="btn-primary text-xs" onClick={acceptPrompt}>Complete <span className="kbd ml-1 border-emerald-300 bg-emerald-500 text-white">Enter</span></button>
            <button className="btn-ghost text-xs" onClick={() => setPrompt(null)}>Keep open <span className="kbd ml-1">Esc</span></button>
          </div>
        </div>
      )}
      {pickerFor && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={() => setPickerFor(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-3 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Labels for task">
            <LabelPicker taskId={pickerFor} onClose={() => setPickerFor(null)} />
            <p className="mt-2 px-1 text-[11px] text-slate-400">Enter toggles or creates · Esc closes</p>
          </div>
        </div>
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
      <span className="text-emerald-600">+</span>
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
          className={`rounded-full border px-2.5 py-0.5 text-xs ${active === f.kind ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'}`}
        >
          {f.label}
        </button>
      ))}
      {active && (
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange(null)} data-clear-duration>
          ✕ Clear filter
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
  }[view]
  return <p className="px-2 py-8 text-center text-sm text-slate-400">{text}</p>
}

function byPosition(a: Task, b: Task) {
  return a.position - b.position || a.created_at - b.created_at
}

function byDueThenPriority(a: Task, b: Task) {
  return compareDue(a.due, b.due) || a.priority - b.priority || a.position - b.position
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + n))
}
