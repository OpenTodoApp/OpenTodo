// Live data shared by the saved-view screens (OpenSpec `custom-views`): every
// non-deleted view, task, project and label as live queries, plus the evaluation
// context for lib/views. Local edits and synced ops re-render without a reload.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useAllLabels, useProjects, useViewRows } from '../lib/localData'
import { logicalToday, onViewerZoneChange, viewerZone } from '../lib/dates'
import type { Label, Project, Task, View } from '../lib/types'
import { activeViews, getStartView, type StartView, type ViewContext } from '../lib/views'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { useTrackedTotals } from '../lib/timeEntries'
import { useFieldDefs } from './useFields'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/**
 * The viewer's IANA zone (absolute-datetimes); components that show zoned dues
 * re-render when a travelling device's zone changes (see watchViewerZone).
 */
export function useViewerZone(): string {
  return useSyncExternalStore(onViewerZoneChange, viewerZone, viewerZone)
}

/**
 * The logical today (day-boundary D3): the local calendar date, or the previous one
 * while the local time is before the user's day start. Re-read every minute, on a
 * zone change and when the day start changes (here or by sync), so "today" rolls
 * over at the day start while a view is open. The one way a component asks which
 * day it is; pure code uses `logicalToday()`.
 */
export function useToday(): string {
  const zone = useViewerZone()
  const { dayStart } = useDateTimeFormat()
  const [today, setToday] = useState(() => logicalToday(dayStart))
  useEffect(() => {
    setToday(logicalToday(dayStart))
    const id = setInterval(() => setToday(logicalToday(dayStart)), 60_000)
    return () => clearInterval(id)
  }, [zone, dayStart])
  return today
}

/** Non-deleted views in sidebar order. */
export function useViews(): View[] {
  const rows = useViewRows()
  return useMemo(() => activeViews(rows), [rows])
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
  const projects = useProjects()
  const labels = useAllLabels()
  const tasks = useLiveTasks() ?? NO_TASKS
  const zone = useViewerZone()
  // A new context on a zone change re-groups zoned dues (absolute-datetimes).
  const fields = useFieldDefs()
  // Tracked minutes per task, ticking while an entry runs (time-tracking D4): `tracked > 1h` views follow it live.
  const tracked = useTrackedTotals()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- zone: a zone change re-groups zoned dues (absolute-datetimes)
  const ctx = useMemo(() => ({ today, labels, projects, tasks, fields, tracked }), [today, labels, projects, tasks, fields, tracked, zone])
  return { views, projects, labels, tasks, ctx }
}

/** True when a keyboard event comes from a text field (shortcuts must not fire). */
export function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
}
