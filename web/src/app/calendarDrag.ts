// Pointer drag layer of the time-blocking calendar (OpenSpec `time-blocking`, design D4).
// Native pointer events, no library. A mouse drag starts after a few pixels of
// movement; touch and pen lift after a long press so a plain swipe still scrolls.
// Hit testing finds the day column or unscheduled lane under the pointer through
// data attributes; the pure slot math in lib/calendar turns pixels into minutes.
import { useCallback, useEffect, useRef, useState } from 'react'
import { dropStart, resizeEstimate, resizeStart } from '../lib/calendar'
import { registerShortcutScope } from './shortcuts/dispatch'
import { tick } from './motion'

export type DragKind = 'move' | 'resize' | 'resize-start'

export type DropTarget =
  | { type: 'slot'; date: string; start: number }
  | { type: 'lane'; date: string }
  | { type: 'resize'; estimate: number }
  /** The upper edge: a new start on the block's day, the end kept (GitHub issue 355). */
  | { type: 'resize-start'; date: string; start: number; estimate: number }

export interface DragState {
  taskId: string
  kind: DragKind
  /** Pointer position, for the floating label. */
  x: number
  y: number
  target: DropTarget | null
}

interface Pending {
  taskId: string
  kind: DragKind
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  /** Pixels between the pointer and the top of the dragged block (0 for chips and list rows). */
  grabOffset: number
  /** Resize only: the block's start, end and date. */
  blockStart: number
  blockEnd: number
  blockDate: string
  lifted: boolean
  timer?: ReturnType<typeof setTimeout>
}

const MOUSE_THRESHOLD = 4
const TOUCH_SLOP = 8
const LONG_PRESS_MS = 350
const EDGE = 48

export interface StartOptions {
  taskId: string
  kind: DragKind
  grabOffset?: number
  blockStart?: number
  blockEnd?: number
  blockDate?: string
}

/**
 * `onDrop` receives the final target; the caller turns it into one `updateTask` call.
 * `scroller` is the scrollable grid container, scrolled when the pointer nears its edge.
 */
export function useCalendarDrag(opts: { pxPerMinute: number; scroller: React.RefObject<HTMLElement | null>; onDrop: (taskId: string, target: DropTarget) => void }) {
  const [drag, setDragState] = useState<DragState | null>(null)
  /** The latest target, read on drop (state updaters must stay free of side effects). */
  const targetRef = useRef<DropTarget | null>(null)
  const setDrag = useCallback((d: DragState | null) => {
    targetRef.current = d?.target ?? null
    setDragState(d)
  }, [])
  const pending = useRef<Pending | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  /** A drag just ended: swallow the click the browser fires next so it does not also open the task. */
  const suppressClick = useRef(false)

  const targetAt = useCallback((x: number, y: number, p: Pending): DropTarget | null => {
    const { pxPerMinute } = optsRef.current
    if (p.kind === 'resize' || p.kind === 'resize-start') {
      const col = document.querySelector<HTMLElement>(`[data-drop-day="${p.blockDate}"]`)
      if (!col) return null
      const offset = y - col.getBoundingClientRect().top
      if (p.kind === 'resize') return { type: 'resize', estimate: resizeEstimate(p.blockStart, offset, pxPerMinute) }
      return { type: 'resize-start', date: p.blockDate, ...resizeStart(p.blockEnd, offset, pxPerMinute) }
    }
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-day],[data-drop-lane]')
    if (!el) return null
    if (el.dataset.dropLane) return { type: 'lane', date: el.dataset.dropLane }
    const date = el.dataset.dropDay!
    return { type: 'slot', date, start: dropStart(y - el.getBoundingClientRect().top, p.grabOffset, pxPerMinute) }
  }, [])

  const end = useCallback((commit: boolean) => {
    const p = pending.current
    pending.current = null
    if (p?.timer) clearTimeout(p.timer)
    const target = targetRef.current
    setDrag(null)
    if (commit && p?.lifted && target) optsRef.current.onDrop(p.taskId, target)
    if (p?.lifted) {
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
    }
  }, [setDrag])

  useEffect(() => {
    function lift(p: Pending, x: number, y: number) {
      p.lifted = true
      setDrag({ taskId: p.taskId, kind: p.kind, x, y, target: targetAt(x, y, p) })
    }
    function onMove(e: PointerEvent) {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
      if (!p.lifted) {
        if (p.pointerType === 'mouse') {
          if (dist < MOUSE_THRESHOLD) return
          lift(p, e.clientX, e.clientY)
        } else {
          // Moving before the long press completes is a scroll, not a drag.
          if (dist > TOUCH_SLOP) end(false)
          return
        }
      }
      e.preventDefault()
      const sc = optsRef.current.scroller.current
      if (sc) {
        const r = sc.getBoundingClientRect()
        if (e.clientY < r.top + EDGE) sc.scrollTop -= 12
        else if (e.clientY > r.bottom - EDGE) sc.scrollTop += 12
      }
      setDrag({ taskId: p.taskId, kind: p.kind, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, p) })
    }
    function onUp(e: PointerEvent) {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      end(true)
    }
    function onCancel(e: PointerEvent) {
      if (pending.current && e.pointerId === pending.current.pointerId) end(false)
    }
    // Escape cancels a lifted drag before any other Escape behaviour (a capturing `calendar` frame).
    const unregister = registerShortcutScope({ scope: 'calendar', capture: true, handlers: { 'calendar.escape': () => { if (!pending.current?.lifted) return false; end(false) } } })
    // While a touch drag is lifted the page must not scroll under the finger.
    function onTouchMove(e: TouchEvent) {
      if (pending.current?.lifted) e.preventDefault()
    }
    function onClick(e: MouseEvent) {
      if (suppressClick.current) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick.current = false
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('click', onClick, true)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      unregister()
      window.removeEventListener('click', onClick, true)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [end, targetAt, setDrag])

  /** Call from a draggable's onPointerDown. */
  const start = useCallback((e: React.PointerEvent, o: StartOptions) => {
    if (e.button !== 0 || pending.current) return
    if (o.kind !== 'move') e.stopPropagation()
    const p: Pending = {
      taskId: o.taskId, kind: o.kind, pointerId: e.pointerId, pointerType: e.pointerType, startX: e.clientX, startY: e.clientY,
      grabOffset: o.grabOffset ?? 0, blockStart: o.blockStart ?? 0, blockEnd: o.blockEnd ?? 0, blockDate: o.blockDate ?? '', lifted: false,
    }
    pending.current = p
    if (e.pointerType !== 'mouse') {
      const x = e.clientX
      const y = e.clientY
      p.timer = setTimeout(() => {
        if (pending.current !== p) return
        p.lifted = true
        // The haptic tick follows the user's preference (motion-v2 D6).
        tick()
        setDrag({ taskId: p.taskId, kind: p.kind, x, y, target: targetAt(x, y, p) })
      }, LONG_PRESS_MS)
    }
  }, [targetAt, setDrag])

  return { drag, start }
}
