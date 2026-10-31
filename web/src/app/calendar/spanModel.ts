// What the calendar views need of spans before any is drawn (OpenSpec change
// multi-day-tasks): who may move one, the lanes a band takes, and the drag of a
// date-only task's trailing end. The bars and the drag itself load on first use
// (SpanBand.tsx, spanDrag.ts), so the first load carries only this.
import { useCallback, useEffect } from 'react'
import type { DaySpan } from '../../lib/calendarDays'
import { useMembershipMap } from '../../lib/localData'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { laneCount, packSpans, type SpanPiece } from '../../lib/span'
import type { Task } from '../../lib/types'
import { resettable } from '../../lib/moduleState'

/** Who may move a task's span: an editor of its project, on an open task (D4). */
export function useSpanEditable(): (task: Task) => boolean {
  const memberships = useMembershipMap()
  return useCallback((task: Task) => !task.completed_at && canEditTasks(roleOf(task.project_id, memberships)), [memberships])
}

/** The spans of several days, once each (a span is listed on every day it covers). */
export function uniqueSpans(lists: readonly (readonly DaySpan[])[]): DaySpan[] {
  const seen = new Map<string, DaySpan>()
  for (const list of lists) for (const x of list) if (!seen.has(x.id)) seen.set(x.id, x)
  return [...seen.values()]
}

/** The lanes a band would draw and the spans it leaves out per day (for the "+N" controls). */
export function bandLayout(days: readonly string[], spans: readonly DaySpan[], maxLanes = Infinity): { pieces: SpanPiece<DaySpan>[]; lanes: number; hiddenOn: Map<string, number> } {
  const all = packSpans(spans, days)
  const pieces = all.filter((p) => p.lane < maxLanes)
  const hiddenOn = new Map<string, number>()
  for (const p of all) {
    if (p.lane < maxLanes) continue
    for (let i = 0; i < p.cols; i++) hiddenOn.set(days[p.col + i], (hiddenOn.get(days[p.col + i]) ?? 0) + 1)
  }
  return { pieces, lanes: laneCount(pieces), hiddenOn }
}

type DragModule = typeof import('./spanDrag')
let drag: DragModule | null = null
resettable('spanModel.drag', () => { drag = null })
const loadDrag = () => import('./spanDrag').then((m) => { drag = m; return m })

/** Loads the drag while a view that offers trailing ends is on screen, so the first press finds it. */
export function usePreloadSpanDrag(on: boolean): void {
  useEffect(() => { if (on && !drag) void loadDrag() }, [on])
}

/**
 * The trailing end of a date-only task pressed (D2): dragged onto a later day, the task
 * becomes a span from the day it is on. A press before the drag has loaded waits for it,
 * unless the pointer is released first.
 */
export function startExtend(e: React.PointerEvent, task: Task, onDrop: (patch: Pick<Partial<Task>, 'start' | 'due' | 'span'>) => void): void {
  e.stopPropagation()
  if (!task.due) return
  const opts = { task, mode: 'extend' as const, grab: task.due.date, onDrop }
  if (drag) { drag.startSpanDrag(e, opts); return }
  const press = { pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, clientX: e.clientX, clientY: e.clientY, stopPropagation: () => {} }
  let released = false
  const up = (u: PointerEvent) => { if (u.pointerId === press.pointerId) released = true }
  window.addEventListener('pointerup', up, true)
  void loadDrag().then((m) => {
    window.removeEventListener('pointerup', up, true)
    if (!released) m.startSpanDrag(press as unknown as React.PointerEvent, opts)
  })
}
