import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { compareDue, formatDateHeading, todayISO } from '../lib/dates'
import { resolveLabels } from '../lib/labels'
import { createTask, deleteTask, setTaskCompleted, updateTask } from '../lib/ops'
import type { Label, Priority, Project, Task } from '../lib/types'
import { LabelPicker } from './LabelPicker'
import { QuickAdd } from './QuickAdd'
import { TaskDetail } from './TaskDetail'
import { TaskRow } from './TaskRow'
import { navigate, type Route } from './router'
import { ProjectHeader } from './ProjectHeader'

type ListRoute = Exclude<Route, { view: 'settings' } | { view: 'labels' }>

interface Group {
  key: string
  heading: string | null
  tasks: Task[]
}

export function TaskListView({ route }: { route: ListRoute }) {
  const today = todayISO()
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const currentProject = route.view === 'project' ? projectMap.get(route.id) : undefined
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const currentLabel = route.view === 'label' ? labelMap.get(route.id) : undefined
  const routeId = route.view === 'project' || route.view === 'label' ? route.id : ''

  const tasks = useLiveQuery(async () => {
    // Tasks of archived or deleted projects stay out of the cross-project views.
    const hidden = new Set((await db.projects.filter((p) => !!p.deleted_at || p.archived).toArray()).map((p) => p.id))
    const all = (await db.tasks.filter((t) => !t.deleted_at).toArray()).filter((t) => !t.project_id || !hidden.has(t.project_id) || (route.view === 'project' && t.project_id === route.id))
    switch (route.view) {
      case 'inbox':
        return all.filter((t) => !t.completed_at && t.project_id === null).sort(byPosition)
      case 'today':
        return all.filter((t) => !t.completed_at && t.due && t.due.date <= today).sort(byDueThenPriority)
      case 'upcoming':
        return all.filter((t) => !t.completed_at && t.due && t.due.date > today).sort(byDueThenPriority)
      case 'completed':
        return all.filter((t) => t.completed_at).sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0)).slice(0, 100)
      case 'project':
        return all.filter((t) => !t.completed_at && t.project_id === route.id).sort(byPosition)
      case 'label':
        return all.filter((t) => !t.completed_at && t.labels.includes(route.id)).sort(byPosition)
    }
  }, [route.view, routeId, today], [] as Task[])

  const groups = useMemo<Group[]>(() => {
    // The live query can still hold the previous view's rows for one render, so never
    // assume a due date is present here.
    if (route.view === 'today') {
      const overdue = tasks.filter((t) => t.due && t.due.date < today)
      const due = tasks.filter((t) => t.due && t.due.date === today)
      const g: Group[] = []
      if (overdue.length) g.push({ key: 'overdue', heading: 'Overdue', tasks: overdue })
      g.push({ key: 'today', heading: overdue.length ? 'Today' : null, tasks: due })
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
      return [...byDate.entries()].map(([date, list]) => ({ key: date, heading: formatDateHeading(date, today), tasks: list }))
    }
    if (route.view === 'label') {
      // Grouped by project: Inbox first, then projects in sidebar order.
      const byProject = new Map<string, Task[]>()
      for (const t of tasks) byProject.set(t.project_id ?? '', [...(byProject.get(t.project_id ?? '') ?? []), t])
      const order = ['', ...projects.slice().sort((a, b) => a.position - b.position).map((p) => p.id)]
      return order.filter((id) => byProject.has(id)).map((id) => ({ key: id || 'inbox', heading: id ? projectMap.get(id)?.name ?? 'Project' : 'Inbox', tasks: byProject.get(id)! }))
    }
    return [{ key: 'all', heading: null, tasks }]
  }, [tasks, route.view, today, projects, projectMap])

  const flat = useMemo(() => groups.flatMap((g) => g.tasks), [groups])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelectedId(null)
    setOpenId(null)
    setPickerFor(null)
  }, [route])

  useEffect(() => {
    if (openId && !flat.some((t) => t.id === openId)) {
      // Task left this view (completed, moved); keep the panel if the task still exists.
      void db.tasks.get(openId).then((t) => {
        if (!t || t.deleted_at) setOpenId(null)
      })
    }
  }, [flat, openId])

  const onAdd = useCallback(async (title: string) => {
    await createTask({
      title,
      project_id: route.view === 'project' ? route.id : null,
      due: route.view === 'today' ? { date: today } : route.view === 'upcoming' ? { date: addDays(today, 1) } : null,
      labels: route.view === 'label' ? [route.id] : [],
    })
  }, [route, today])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (e.key === 'Escape') {
        if (typing) (target as HTMLElement).blur()
        else if (pickerFor) setPickerFor(null)
        else if (openId) setOpenId(null)
        else setSelectedId(null)
        return
      }
      if (typing) return
      const idx = flat.findIndex((t) => t.id === selectedId)
      switch (e.key) {
        case 'q':
          e.preventDefault()
          quickAddRef.current?.focus()
          break
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          setSelectedId(flat[Math.min(flat.length - 1, idx + 1)]?.id ?? null)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          setSelectedId(flat[Math.max(0, idx - 1)]?.id ?? null)
          break
        case 'Enter':
          if (selectedId) setOpenId(selectedId)
          break
        case 'c':
          if (selectedId) {
            const t = flat[idx]
            void setTaskCompleted(selectedId, !t?.completed_at)
          }
          break
        case 'L':
          if (selectedId) {
            e.preventDefault()
            setPickerFor(selectedId)
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
            setSelectedId(flat[idx + 1]?.id ?? flat[idx - 1]?.id ?? null)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flat, selectedId, openId, pickerFor])

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
            <ProjectHeader project={currentProject} />
          ) : (
            <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              {currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              {title}
              {route.view === 'today' && <span className="ml-2 text-sm font-normal text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
              {route.view === 'label' && <span className="text-sm font-normal text-slate-400">{flat.length}</span>}
            </h1>
          )}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              <QuickAdd ref={quickAddRef} onAdd={onAdd} placeholder={placeholderFor(route, currentProject, currentLabel)} />
            </div>
          )}

          {flat.length === 0 && <EmptyState view={route.view} />}

          {groups.map((g) => (
            <section key={g.key} className="mb-4">
              {g.heading && <h2 className={`mb-1 px-2 text-xs font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-red-600' : 'text-slate-400'}`}>{g.heading}</h2>}
              <ul>
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectMap.get(t.project_id) : undefined}
                    labels={resolveLabels(t.labels, labelMap)}
                    showProject={route.view !== 'project' && route.view !== 'label'}
                    selected={t.id === selectedId}
                    onToggle={() => void setTaskCompleted(t.id, !t.completed_at)}
                    onOpen={() => {
                      setSelectedId(t.id)
                      setOpenId(t.id)
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      {openId && <TaskDetail taskId={openId} projects={projects} labelMap={labelMap} onClose={() => setOpenId(null)} />}
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
