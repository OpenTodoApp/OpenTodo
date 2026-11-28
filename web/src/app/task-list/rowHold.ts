// The touch hold of a list row (task-row-context-menu), shared by the desktop row and
// the phone list's row (OpenSpec change phone-lists, design D4).
import { DRAG_THRESHOLD, swallowNextClick, trackHold } from '../../lib/dnd'

type Press = (e: React.PointerEvent<HTMLLIElement>) => void
type OpenMenu = (x: number, y: number, row: HTMLElement) => void

/**
 * Touch hold on a row the drag does not own (task-row-context-menu "Touch: hold and
 * release"): the hold arms with a tint on the row, a release then opens the actions
 * menu at the finger, a move ends it as a scroll — one rule, so a long press means the
 * same thing on every list of every device. Selection moved to the row's grip
 * (bulk-actions), so a phone's long press no longer ticks the row: it is the menu's
 * gesture on a coarse pointer as on a fine one. A draggable row gets the same hold
 * inside beginDrag, so exactly one owner per row.
 */
export function holdForRow(e: React.PointerEvent<HTMLLIElement>, drag: Press | undefined, open: OpenMenu | undefined): void {
  drag?.(e)
  if (drag || e.pointerType !== 'touch' || !open) return
  const fire = open
  const li = e.currentTarget
  const x0 = e.clientX
  const y0 = e.clientY
  const pointerId = e.pointerId
  let done = false
  // The shared hold: the timer, the armed latch and the scroll block live in lib/dnd.
  const hold = trackHold(e, {
    onArmed: () => li.setAttribute('data-touch-hold', ''),
    onEnd: () => li.removeAttribute('data-touch-hold'),
    press: li,
  })
  function stop() {
    if (done) return
    done = true
    hold.stop()
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
  }
  function move(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    // Before the hold, movement is the page's scroll; after it there is no drag here.
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > DRAG_THRESHOLD) stop()
  }
  function up(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    const held = hold.armed()
    const { clientX: x, clientY: y } = ev
    stop()
    if (!held) return
    swallowNextClick()
    fire(x, y, li)
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}
