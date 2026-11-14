// Touch hold on a sidebar row (touch-sidebar-names, GitHub issue 1380): on touch the row's
// menu button is not painted, so its name has the room; a hold on the row opens the menu,
// the gesture a task row already has (task-row-context-menu "Touch: hold and release").
// One handler on the sidebar's scroller serves every row marked `data-menu-row`: the hold
// arms with a tint, a release then presses the row's own menu button, a move ends it as a
// scroll (or as the drag of a row that has one, which keeps its own hold in lib/dnd).
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DRAG_THRESHOLD, swallowNextClick, trackHold } from '../lib/dnd'

export function holdForRowMenu(e: ReactPointerEvent<HTMLElement>): void {
  if (e.pointerType !== 'touch') return
  const item = (e.target as Element).closest<HTMLElement>('[data-sidebar-item], [data-label-open]')
  const found = item?.closest('[data-menu-row]')?.querySelector<HTMLElement>('button[aria-haspopup]')
  if (!item || !found) return
  const menu: HTMLElement = found
  const { clientX: x0, clientY: y0, pointerId } = e
  const hold = trackHold(e, {
    onArmed: () => item.setAttribute('data-touch-hold', ''),
    onEnd: () => item.removeAttribute('data-touch-hold'),
  })
  function stop() {
    hold.stop()
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
  }
  function move(ev: PointerEvent) {
    if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > DRAG_THRESHOLD) stop()
  }
  function up(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    const held = hold.armed()
    stop()
    if (!held) return
    // The release is not a tap on the row. The menu opens once that click has been swallowed.
    swallowNextClick()
    setTimeout(() => menu.click(), 0)
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}
