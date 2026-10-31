// Spans in the Month (OpenSpec change multi-day-tasks, design D3, D4, D8): the
// selection of the spans, the cells without them, the selection order, the keys of a
// selected span's ends, the trailing end of a date-only row and the bars of a week row.
import { lazy, type MutableRefObject, Suspense, useMemo } from 'react'
import { dueFromView, viewedTask } from '../../lib/dates'
import { getTask } from '../../lib/localData'
import { cellTasks } from '../../lib/month'
import type { Projection } from '../../lib/occurrences'
import { updateTask } from '../../lib/ops'
import { spanEntries, type DaySpan } from '../../lib/calendarDays'
import type { Task } from '../../lib/types'
import { act, reportActionError } from '../actionError'
import { spanWithUndo } from '../undoable'
import type { SpanBandProps } from './SpanBand'
import { startExtend } from './spanModel'
import { spanKeyPatch } from './useCalendarKeys'

/** The month's spans and its cells' other tasks (by the stored rows, in the viewer's zone). */
export function useMonthSpans(drawnRaw: readonly Task[], viewedMap: ReadonlyMap<string, Task>, projections: readonly Projection[], days: readonly string[], zone?: string) {
  const spans = useMemo(() => spanEntries(drawnRaw.map((task) => viewedMap.get(task.id) ?? task), projections), [drawnRaw, viewedMap, projections])
  const spanIds = useMemo(() => new Set(spans.map((x) => x.id)), [spans])
  const cells = useMemo(() => {
    const rest = drawnRaw.filter((task) => !spanIds.has(task.id))
    return new Map(days.map((d) => [d, cellTasks(rest, d, zone)]))
  }, [days, drawnRaw, spanIds, zone])
  return { spans, spanIds, cells }
}

/** Selection order (`j` / `k`): the month's tasks in grid order, a span on its first day in the grid. */
export function monthOrder(days: readonly string[], cells: ReadonlyMap<string, Task[]>, spans: readonly DaySpan[]): string[] {
  const seen = new Set<string>()
  const spansOn = (d: string) => spans.flatMap((x) => (x.kind === 'task' && !seen.has(x.id) && (x.span.first === d || (d === days[0] && x.span.first < d)) ? (seen.add(x.id), [x.id]) : []))
  return days.flatMap((d) => [...spansOn(d), ...(cells.get(d) ?? []).map((task) => task.id)])
}

/**
 * Shift+Left/Right and Alt+Shift+Left/Right on the selected task (D4): its span's last
 * or first day, or a date-only task made a span. Returns false for anything else, so
 * Shift+arrows keep moving the focused day. Runs on the freshest row through `queue`.
 */
export function monthSpanKeys(c: { selected: Task | undefined; viewed: ReadonlyMap<string, Task>; editable: (task: Task) => boolean; queue: MutableRefObject<Promise<void>>; focus: (date: string) => void }) {
  const run = (end: 'first' | 'last') => (e: KeyboardEvent) => {
    const days = e.key === 'ArrowLeft' ? -1 : 1
    const v = c.selected ? c.viewed.get(c.selected.id) : undefined
    if (!c.selected || !v || !spanKeyPatch(v, end, days)) return false
    if (!c.editable(c.selected)) return
    const id = c.selected.id
    c.queue.current = c.queue.current.then(async () => {
      const raw = await getTask(id)
      if (!raw || raw.deleted_at || raw.completed_at) return
      const patch = spanKeyPatch(viewedTask(raw), end, days)
      if (!patch) return
      await updateTask(id, patch.due ? { ...patch, due: dueFromView(raw.due, patch.due) } : patch)
      const at = end === 'first' ? patch.start : patch.due?.date
      if (at) c.focus(at)
    }).catch(reportActionError)
  }
  return { 'month.span-end': run('last'), 'month.span-start': run('first') }
}

/** The trailing end of a date-only row: dragged onto a later day, the task becomes a span (D2). */
export function ExtendHandle({ task, day, onDone }: { task: Task; day: string; onDone: (id: string) => void }) {
  return (
    <span aria-hidden data-span-handle="extend" className="absolute inset-y-0 end-0 w-2 cursor-ew-resize touch-none"
      data-day={day} onPointerDown={(e) => startExtend(e, task, (patch) => { act(spanWithUndo(task.id, patch)); onDone(task.id) })} />
  )
}

/** A week row's bars, laid over its cells below the day numbers (the cells reserve the room). */
export function MonthWeekBand(props: Omit<SpanBandProps, 'variant' | 'drags' | 'className'>) {
  return <Suspense fallback={null}><SpanBand {...props} variant="month" drags inRow className="ui-span-overlay pointer-events-none absolute inset-x-0 top-[30px] z-10" /></Suspense>
}

// The bars load on first use (the first load stays in its budget).
const SpanBand = lazy(() => import('./SpanBand'))
