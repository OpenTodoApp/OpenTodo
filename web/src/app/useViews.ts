// Live data shared by the saved-view screens (OpenSpec `custom-views`): every
// non-deleted view, task, project and label as live queries, plus the evaluation
// context for lib/views. Local edits and synced ops re-render without a reload.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { todayISO } from '../lib/dates'
import type { Label, Project, Task, View } from '../lib/types'
import { activeViews, getStartView, type StartView, type ViewContext } from '../lib/views'
import { visibleTasks } from '../lib/trash'

/** The local calendar date, re-read every minute so "today" rolls over while a view is open. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const id = setInterval(() => setToday(todayISO()), 60_000)
    return () => clearInterval(id)
  }, [])
  return today
}

/** Non-deleted views in sidebar order. */
export function useViews(): View[] {
  return useLiveQuery(() => db.views.toArray().then(activeViews), [], [] as View[])
}

/** This device's start view (local meta, never synced). */
export function useStartView(): StartView {
  return useLiveQuery(() => getStartView(), [], 'inbox' as StartView)
}

export interface ViewData {
  views: View[]
  projects: Project[]
  labels: Label[]
  tasks: Task[]
  ctx: ViewContext
}

export function useViewData(): ViewData {
  const today = useToday()
  const views = useViews()
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const tasks = useLiveQuery(() => visibleTasks(), [], [] as Task[])
  const ctx = useMemo(() => ({ today, labels, projects, tasks }), [today, labels, projects, tasks])
  return { views, projects, labels, tasks, ctx }
}

/** True when a keyboard event comes from a text field (shortcuts must not fire). */
export function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
}
