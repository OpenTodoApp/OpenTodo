// Live data shared by the saved-view screens (OpenSpec `custom-views`): every
// non-deleted view, task, project and label as live queries, plus the evaluation
// context for lib/views. Local edits and synced ops re-render without a reload.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { onViewerZoneChange, todayISO, viewerZone } from '../lib/dates'
import type { Label, Project, Task, View } from '../lib/types'
import { activeViews, getStartView, type StartView, type ViewContext } from '../lib/views'
import { visibleTasks } from '../lib/trash'
import { useFieldDefs } from './useFields'

/**
 * The viewer's IANA zone (absolute-datetimes); components that show zoned dues
 * re-render when a travelling device's zone changes (see watchViewerZone).
 */
export function useViewerZone(): string {
  return useSyncExternalStore(onViewerZoneChange, viewerZone)
}

/** The local calendar date, re-read every minute (and on a zone change) so "today" rolls over while a view is open. */
export function useToday(): string {
  const zone = useViewerZone()
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    setToday(todayISO())
    const id = setInterval(() => setToday(todayISO()), 60_000)
    return () => clearInterval(id)
  }, [zone])
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
  const zone = useViewerZone()
  // A new context on a zone change re-groups zoned dues (absolute-datetimes).
  const fields = useFieldDefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  const ctx = useMemo(() => ({ today, labels, projects, tasks, fields }), [today, labels, projects, tasks, fields, zone])
  return { views, projects, labels, tasks, ctx }
}

/** True when a keyboard event comes from a text field (shortcuts must not fire). */
export function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
}
