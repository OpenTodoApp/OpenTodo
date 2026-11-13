// The menu's edge swipe on phones (OpenSpec change edge-swipe-menu, GitHub issue
// 1232): a touch that starts at the left edge and moves right opens the menu, as in
// an iOS app, instead of going back through the browser's history. The row swipes
// leave that strip alone (rowSwipe.ts SWIPE.edge); the gesture's numbers are theirs.
import { lockOf, releaseOf, SWIPE } from './rowSwipe'

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
