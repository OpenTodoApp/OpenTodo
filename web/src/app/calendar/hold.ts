// A finger's long press on the calendar (calendar-clarity D2, series-exceptions D4):
// shared by the add menu of an empty place and the menu of a projected occurrence.
// Kept apart from the menus so the first load carries only this.

/** How long a finger rests before the menu opens. */
export const HOLD_MS = 500
const HOLD_SLOP_PX = 8

/**
 * A long press of a finger: `onHold(x, y)` after HOLD_MS when the finger has not
 * moved; any movement (a scroll) or a release ends it. Other pointers never hold.
 */
export function startHold(e: React.PointerEvent, onHold: (x: number, y: number) => void): void {
  if (e.pointerType !== 'touch') return
  const { clientX: x0, clientY: y0, pointerId } = e
  const timer = setTimeout(() => { stop(); onHold(x0, y0) }, HOLD_MS)
  function stop() {
    clearTimeout(timer)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', stop, true)
    window.removeEventListener('pointercancel', stop, true)
  }
  function move(ev: PointerEvent) {
    if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > HOLD_SLOP_PX) stop()
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', stop, true)
  window.addEventListener('pointercancel', stop, true)
}
