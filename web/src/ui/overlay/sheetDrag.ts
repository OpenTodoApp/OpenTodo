// Drag to dismiss, for every bottom sheet (OpenSpec change sheet-drag-dismiss): the
// popover sheet and a dialog shown as a sheet share this one implementation. The sheet
// follows a finger that moves down from its handle or header, or from its body while
// nothing under the finger is scrolled; released past CLOSE_DISTANCE or on a downward
// flick it closes through the overlay's own onClose (so focus and the Back entry are
// handled as for any other close), otherwise it springs back. Under reduced or no
// motion the sheet stays still and only closes or stays.
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'

/** Released further down than this, the sheet closes (phone-v2 D5). */
export const CLOSE_DISTANCE = 80
/** Movement before the direction is read: a tap is not a drag. */
const SLOP = 8
/** A flick: at least this fast (px per ms) at release, after at least FLICK_DISTANCE. */
const FLICK_SPEED = 0.5
const FLICK_DISTANCE = 24
/** A finger that rested this long before lifting did not flick. */
const REST_MS = 100
/** A sheet still open this long after it was dragged away was kept open by its owner. */
const KEPT_MS = 500

const still = (): boolean =>
  document.documentElement.dataset.motion === 'none' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Whether a drag may start under this touch: always on the grip (the handle and header);
 * elsewhere not in a field, not on something with a drag of its own, and only while
 * every scroller between the finger and the sheet is at its top.
 */
function mayStart(target: EventTarget | null, sheet: HTMLElement): boolean {
  const from = target instanceof Element ? target : null
  if (!from || !sheet.contains(from)) return false
  if (from.closest('[data-sheet-grip]')) return true
  if (from.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-drag-id]')) return false
  for (let el: Element | null = from; el; el = el === sheet ? null : el.parentElement) if (el.scrollTop > 0) return false
  return true
}

/** While `enabled`, `sheet` can be dragged down to close; `onClose` is the overlay's own. */
export function useSheetDrag(sheet: RefObject<HTMLElement | null>, onClose: () => void, enabled = true) {
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose })
  useEffect(() => {
    const el = sheet.current
    if (!enabled || !el) return
    let from: { x: number; y: number } | null = null
    let dragging = false
    let last = { y: 0, t: 0 }
    let speed = 0
    let kept: ReturnType<typeof setTimeout> | undefined

    /** Reads the finger; false once the gesture is not a drag down (a tap so far, sideways, up). */
    const track = (x: number, y: number): boolean => {
      if (!from) return false
      const dx = x - from.x, dy = y - from.y
      if (!dragging) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return false
        if (dy <= Math.abs(dx)) { from = null; return false }
        dragging = true
      }
      return true
    }
    const settle = () => {
      from = null
      dragging = false
      if (!el.style.translate) return
      el.style.transition = 'translate var(--duration-emphasis) var(--ease-spring)'
      el.style.translate = ''
      el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
    }
    const onStart = (e: TouchEvent) => {
      clearTimeout(kept)
      const p = e.touches[0]
      from = e.touches.length === 1 && p && mayStart(e.target, el) ? { x: p.clientX, y: p.clientY } : null
      dragging = false
      speed = 0
      if (p) last = { y: p.clientY, t: e.timeStamp }
    }
    const onMove = (e: TouchEvent) => {
      const p = e.touches[0]
      if (!p || !track(p.clientX, p.clientY) || !from) return
      // The drag is the sheet's: the body does not scroll and the page does not pull.
      if (e.cancelable) e.preventDefault()
      const dt = e.timeStamp - last.t
      if (dt > 0) speed = (p.clientY - last.y) / dt
      last = { y: p.clientY, t: e.timeStamp }
      if (still()) return
      el.style.transition = 'none'
      el.style.translate = `0 ${Math.max(0, p.clientY - from.y)}px`
    }
    const onEnd = (e: TouchEvent) => {
      const p = e.changedTouches[0]
      if (!p || !track(p.clientX, p.clientY) || !from) { settle(); return }
      const dy = p.clientY - from.y
      const flick = e.timeStamp - last.t < REST_MS && speed > FLICK_SPEED && dy > FLICK_DISTANCE
      if (dy > CLOSE_DISTANCE || flick) {
        // The sheet stays where the finger left it: its exit starts there.
        from = null
        dragging = false
        close.current()
        // Many owners close a moment later (a write, then a render): the sheet waits where
        // it is. One that kept it open (it asked first) gets it back in place.
        kept = setTimeout(settle, KEPT_MS)
      } else settle()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', settle)
    return () => {
      clearTimeout(kept)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', settle)
    }
  }, [sheet, enabled])
}
