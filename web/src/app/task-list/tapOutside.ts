// A press outside the compact title editor ends it (touch-title-editing D3). The press
// saves, as leaving the field does. iOS does not blur a field for a tap on a part of the
// page that takes no focus, so the editor cannot rely on its blur alone. A finger tap
// that lands on another task row of the list does nothing else, so it never also opens
// or ticks that row; a tap anywhere else (the tab bar, a toast, the side panel) goes on
// as usual, and so does a mouse or trackpad click. A press that moves (a scroll, a
// swipe), a long press and a second finger leave the editor open.
import { useEffect, useRef } from 'react'
import { swallowClick } from '../rowSwipe'

/** Travel under this, in px, is a tap. */
const TAP_SLOP = 10
/** A press held longer is a long press (the row's hold), not a tap. */
const TAP_MAX_MS = 500
/** How long the tap's click may take to follow its release, in ms. */
const CLICK_WINDOW = 400

const inOverlay = (node: Node | null) => node instanceof Element && !!node.closest('[data-overlay], [data-overlay-root]')

/** A task row of the list (not one in the side panel or an overlay). */
const listRow = (node: Node | null) =>
  node instanceof Element && !!node.closest('[data-task-id]') && !node.closest('[data-detail-for], [data-overlay], [data-overlay-root]')

/**
 * While `on`, a primary press that starts outside the editor (`inside` false) calls
 * `end` on its release when it was a tap or a click. A finger or pen tap on a list row
 * also swallows its click. The press is followed to its release even if the editor
 * closed meanwhile (focus moved on the press).
 */
export function useTapOutside(on: boolean, inside: (node: Node | null) => boolean, end: () => void): void {
  const latest = useRef({ inside, end })
  latest.current = { inside, end }
  useEffect(() => {
    if (!on) return
    let mounted = true
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      const target = e.target as Node | null
      if (!target || latest.current.inside(target)) return
      const { pointerId, pointerType, clientX: x0, clientY: y0, timeStamp: t0 } = e
      const press = new AbortController()
      const opts = { capture: true, signal: press.signal }
      window.addEventListener('pointermove', (ev) => {
        if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > TAP_SLOP) press.abort()
      }, opts)
      window.addEventListener('pointercancel', (ev) => { if (ev.pointerId === pointerId) press.abort() }, opts)
      window.addEventListener('pointerup', (ev) => {
        if (ev.pointerId !== pointerId) return
        press.abort()
        if (ev.timeStamp - t0 > TAP_MAX_MS || inOverlay(ev.target as Node | null)) return
        if (pointerType !== 'mouse' && listRow(target)) swallowClick(CLICK_WINDOW)
        if (mounted) latest.current.end()
      }, opts)
    }
    window.addEventListener('pointerdown', down, true)
    return () => {
      mounted = false
      window.removeEventListener('pointerdown', down, true)
    }
  }, [on])
}
