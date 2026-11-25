// A tap outside the touch title editor ends it (touch-title-editing D3): the tap saves,
// as leaving the field does, and does nothing else, so it never also opens or ticks the
// row it landed on. A press that moves (a scroll, a swipe) leaves the editor open. iOS
// does not blur a field for a tap on a part of the page that takes no focus, so the
// editor cannot rely on its blur alone.
import { type RefObject, useEffect, useRef } from 'react'
import { swallowClick } from '../rowSwipe'

/** Travel under this, in px, is a tap. */
export const TAP_SLOP = 10
/** How long the tap's click may take to follow its release, in ms. */
const CLICK_WINDOW = 400

/**
 * While `on`, a tap whose press starts outside `root` (and outside the overlays its
 * pickers open) calls `end` on release and swallows its click. The tap is followed to
 * its release even if the editor has closed meanwhile (focus moved on the press).
 */
export function useTapOutside(on: boolean, root: RefObject<HTMLElement | null>, end: () => void): void {
  const latest = useRef(end)
  latest.current = end
  useEffect(() => {
    if (!on) return
    let mounted = true
    const down = (e: PointerEvent) => {
      const node = e.target as Node | null
      if (!node || root.current?.contains(node) || (node instanceof Element && node.closest('[data-overlay], [data-overlay-root]'))) return
      const x0 = e.clientX
      const y0 = e.clientY
      const stop = () => {
        window.removeEventListener('pointermove', move, true)
        window.removeEventListener('pointerup', up, true)
        window.removeEventListener('pointercancel', cancel, true)
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId === e.pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > TAP_SLOP) stop()
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        stop()
        swallowClick(CLICK_WINDOW)
        if (mounted) latest.current()
      }
      const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) stop() }
      window.addEventListener('pointermove', move, true)
      window.addEventListener('pointerup', up, true)
      window.addEventListener('pointercancel', cancel, true)
    }
    window.addEventListener('pointerdown', down, true)
    return () => {
      mounted = false
      window.removeEventListener('pointerdown', down, true)
    }
  }, [on, root])
}
