// Dragging a span in Week and Month (OpenSpec change multi-day-tasks, design D4): the
// middle moves start and due together, an end moves one of them, and the trailing end
// of a date-only task makes it a span. Native pointer events like the grid's drag
// (calendarDrag.ts): a mouse or pen lifts after a few pixels, a finger after a long
// press. The day under the pointer is read from the element there; while a drag is
// lifted the bars let the pointer through to the days below. The preview is a small
// shared store, so a bar crossing Month's week rows is drawn in each of them.
import { useSyncExternalStore } from 'react'
import { addDaysISO, daysBetweenISO } from '../../lib/dates'
import { swallowNextClick } from '../../lib/dnd'
import { extendToSpanPatch, moveSpanPatch, resizeSpanPatch, spanOf, type Span } from '../../lib/span'
import type { Due, Task } from '../../lib/types'
import { tick } from '../motion'
import { registerShortcutScope } from '../shortcuts/dispatch'
import { resettable } from '../../lib/moduleState'

export type SpanDragMode = 'move' | 'first' | 'last' | 'extend'
export type SpanPatch = Pick<Partial<Task>, 'start' | 'due' | 'span'>

/** The range a span would have if the drag ended now. */
export interface SpanPreview { id: string; first: string; last: string }

const THRESHOLD = 4
const TOUCH_SLOP = 8
const LONG_PRESS_MS = 350
/** The elements that name a day: the band's cells, a Week column's header and grid, a Month cell, a Plan column. */
const DAY_SELECTOR = '[data-span-day],[data-day-header],[data-drop-day],[data-month-day],[data-plan-day]'

let preview: SpanPreview | null = null
const listeners = new Set<() => void>()
function setPreview(next: SpanPreview | null) {
  preview = next
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
resettable('spanDrag.preview', () => { preview = null })

/** The span being dragged and where it would land, live. */
export function useSpanPreview(): SpanPreview | null {
  return useSyncExternalStore(subscribe, () => preview, () => null)
}

/** The day of the element at a point, or null. */
export function dayAt(x: number, y: number): string | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>(DAY_SELECTOR)
  if (!el) return null
  const d = el.dataset
  return d.spanDay ?? d.dayHeader ?? d.dropDay ?? d.monthDay ?? d.planDay ?? null
}

/**
 * The patch a drag from `grab` to `over` writes, or null when nothing changes. `task`
 * is the stored row, so a due keeps its time and zone.
 */
export function spanDropPatch(task: Pick<Task, 'start' | 'span'> & { due: Due | null }, mode: SpanDragMode, grab: string, over: string): SpanPatch | null {
  const days = daysBetweenISO(grab, over)
  if (mode === 'extend') return extendToSpanPatch(task, over)
  if (days === 0) return null
  if (mode === 'move') return moveSpanPatch(task, days)
  return resizeSpanPatch(task, mode, days)
}

/** The range a patch leaves the task with (the preview). */
function rangeOf(task: Pick<Task, 'start' | 'span'> & { due: Due | null }, patch: SpanPatch | null): Span | null {
  const next = { start: patch?.start ?? task.start, due: patch?.due ?? task.due, span: patch?.span ?? task.span }
  if (next.span && next.start && next.due && next.start === next.due.date) return { first: next.start, last: next.start, length: 1 }
  return spanOf(next)
}

/**
 * Starts tracking a press on a bar or one of its ends. `grab` is the day the press is
 * on (the bar's day under the pointer); `onDrop` receives the patch of one batch.
 */
export function startSpanDrag(e: React.PointerEvent, opts: { task: Task; mode: SpanDragMode; grab: string; onDrop: (patch: SpanPatch) => void }): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation()
  const { task, mode, grab } = opts
  const pointerId = e.pointerId, touch = e.pointerType === 'touch'
  const x0 = e.clientX, y0 = e.clientY
  let lifted = false
  let patch: SpanPatch | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  // Escape cancels a lifted drag before any other Escape (capturing frames of Day/Week and Month).
  let unregister: (() => void)[] = []
  const lift = () => {
    lifted = true
    const cancelKey = () => { stop() }
    unregister = [
      registerShortcutScope({ scope: 'calendar', capture: true, handlers: { 'calendar.escape': cancelKey } }),
      registerShortcutScope({ scope: 'view', view: 'month', capture: true, handlers: { 'month.escape': cancelKey } }),
    ]
    document.body.setAttribute('data-span-dragging', '')
    if (touch) tick()
  }
  const track = (x: number, y: number) => {
    const over = dayAt(x, y)
    if (!over) return
    patch = spanDropPatch(task, mode, grab, over)
    const range = rangeOf(task, patch)
    setPreview(range ? { id: task.id, first: range.first, last: range.last } : null)
  }
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
    for (const u of unregister) u()
    unregister = []
    document.removeEventListener('touchmove', block)
    document.body.removeAttribute('data-span-dragging')
    setPreview(null)
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const far = Math.hypot(ev.clientX - x0, ev.clientY - y0)
    if (!lifted) {
      if (touch) { if (far > TOUCH_SLOP) stop(); return }
      if (far < THRESHOLD) return
      lift()
    }
    ev.preventDefault()
    track(ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const done = lifted ? patch : null
    if (lifted) swallowNextClick()
    stop()
    if (done) opts.onDrop(done)
  }
  const cancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) stop() }
  const block = (ev: TouchEvent) => { if (lifted) ev.preventDefault() }
  if (touch) timer = setTimeout(lift, LONG_PRESS_MS)
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', cancel, true)
  document.addEventListener('touchmove', block, { passive: false })
}

/** The day of a piece under the pointer: its first day plus the columns from its leading edge. */
export function grabDay(e: React.PointerEvent, first: string, cols: number): string {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  if (!r.width || cols <= 1) return first
  const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === 'rtl'
  const at = rtl ? r.right - e.clientX : e.clientX - r.left
  return addDaysISO(first, Math.min(cols - 1, Math.max(0, Math.floor((at / r.width) * cols))))
}
