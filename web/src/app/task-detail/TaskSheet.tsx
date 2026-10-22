// The task panel on a phone (OpenSpec change phone-v2, design D5): a bottom sheet at
// most 90 dvh tall over a scrim, with a drag handle above the sticky header. A drag
// down on the handle or the header of more than 80 px, or a flick, closes it; a drag
// on the body closes only while the body is scrolled to its top, so reading comments
// never dismisses it. It sits above the on-screen keyboard (`--vv-bottom`), so the
// focused field and the composer stay in view.
import { type CSSProperties, type ReactNode, type RefObject, type TouchEvent, useRef } from 'react'
import { prefersReducedMotion } from '../motion'

/** Travel that closes the sheet, and the flick speed that closes it sooner (px per ms). */
export const SHEET_CLOSE_PX = 80
const FLICK = 0.5

type Touches = { onTouchStart: (e: TouchEvent<HTMLElement>) => void; onTouchMove: (e: TouchEvent<HTMLElement>) => void; onTouchEnd: (e: TouchEvent<HTMLElement>) => void }

export interface TaskSheet {
  className: string
  style?: CSSProperties
  /** The 36 × 4 px handle on its 20 px strip, above the header. */
  handle: ReactNode
  /** The list dimmed behind the sheet; a tap closes. */
  scrim: ReactNode
  /** On the handle strip and the header: a drag down always closes. */
  header: Touches
  /** On the body's scroller: a drag down closes only at scroll top. */
  body: Touches
}

export function useTaskSheet({ on, onClose, panel, entering }: { on: boolean; onClose: () => void; panel: RefObject<HTMLElement | null>; entering: boolean }): TaskSheet | null {
  const drag = useRef<{ x: number; y: number; t: number; dy: number; body: boolean } | null>(null)
  const set = (dy: number, animate: boolean) => {
    const el = panel.current
    if (!el) return
    el.style.transition = animate && !prefersReducedMotion() ? 'transform var(--duration-ui) var(--ease-calm)' : ''
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
  }
  const touches = (body: boolean): Touches => ({
    onTouchStart: (e) => {
      const p = e.touches[0]
      // The body hands a drag to the sheet only from its top; anywhere else it scrolls.
      if (!p || (body && e.currentTarget.scrollTop > 0)) { drag.current = null; return }
      drag.current = { x: p.clientX, y: p.clientY, t: e.timeStamp, dy: 0, body }
    },
    onTouchMove: (e) => {
      const d = drag.current, p = e.touches[0]
      if (!d || !p) return
      d.dy = Math.max(0, p.clientY - d.y)
      set(d.dy, false)
    },
    onTouchEnd: (e) => {
      const d = drag.current, p = e.changedTouches[0]
      drag.current = null
      if (!d || !p) return
      const dy = p.clientY - d.y
      const fast = dy > SHEET_CLOSE_PX / 2 && dy / Math.max(1, e.timeStamp - d.t) > FLICK
      if (Math.abs(p.clientX - d.x) < 60 && (dy > SHEET_CLOSE_PX || fast)) { set(0, false); onClose(); return }
      set(0, true)
    },
  })
  if (!on) return null
  return {
    className: `fixed inset-x-0 z-30 flex flex-col rounded-t-card border-t border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-3 ${entering ? 'dialog-sheet' : ''}`,
    style: { bottom: 'var(--vv-bottom, 0px)', maxHeight: 'calc(90dvh - var(--vv-bottom, 0px))' },
    handle: (
      <div aria-hidden="true" data-sheet-handle className="flex h-5 shrink-0 touch-none items-center justify-center" {...touches(false)}>
        <span className="h-1 w-9 rounded-full bg-faint" />
      </div>
    ),
    scrim: <div aria-hidden="true" data-sheet-scrim className="fixed inset-0 z-30 touch-none bg-scrim" onClick={onClose} />,
    header: touches(false),
    body: touches(true),
  }
}
