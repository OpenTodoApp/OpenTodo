// The edge swipe on phones (OpenSpec changes edge-swipe-menu and edge-swipe-back,
// GitHub issues 1232 and 1323): a touch that starts at the left edge and moves right
// goes back on a page with a Back (a task, a note, a nested page) and opens the menu
// on a top-level page, as in an iOS app. The installed web app on iOS keeps the
// system's own back swipe, so the watcher is off there. The row swipes leave that
// strip alone (rowSwipe.ts SWIPE.edge); the gesture's numbers are theirs.
import { lockOf, releaseOf, SWIPE } from './rowSwipe'

/** What a right edge swipe does: Back when the page has one, else the menu. */
export function edgeSwipeAction(back: (() => void) | undefined, openMenu: () => void): () => void {
  return back ?? openMenu
}

/**
 * Whether the page itself should watch the edge: not in the installed web app on an
 * iPhone or iPad (Safari's standalone mode), which has the system's back swipe and no
 * way to turn it off, so a watcher would make one swipe do two things.
 */
export function watchesEdge(env: { shell: boolean; standalone: boolean; ios: boolean }): boolean {
  return env.shell || !(env.standalone && env.ios)
}

/**
 * Listens for edge swipes on the window while `enabled()` says the closed phone
 * menu may open, and calls `open` on a right swipe past the reveal distance or a
 * right flick. Returns a function that stops listening.
 */
export function watchEdgeSwipe(open: () => void, enabled: () => boolean): () => void {
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || e.clientX >= SWIPE.edge || !enabled()) return
    const x0 = e.clientX
    const y0 = e.clientY
    let taken = false
    let dx = 0
    let last = { x: x0, t: performance.now() }
    let velocity = 0
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      dx = ev.clientX - x0
      if (!taken) {
        const lock = lockOf(dx, ev.clientY - y0)
        if (lock === 'scroll' || (lock === 'swipe' && dx < 0)) return stop()
        if (lock !== 'swipe') return
        taken = true
      }
      const now = performance.now()
      if (now > last.t) velocity = (ev.clientX - last.x) / (now - last.t)
      last = { x: ev.clientX, t: now }
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      if (taken && releaseOf(dx, velocity) === 'right' && enabled()) open()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
  }
  window.addEventListener('pointerdown', down, { passive: true })
  return () => window.removeEventListener('pointerdown', down)
}
