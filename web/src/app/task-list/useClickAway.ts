// Clicking away clears the selection (OpenSpec change inline-task-editing,
// task-list-presentation "Clearing the selection", design D4): a pointer press on an
// empty part of the content column (between or below the rows, the page margins,
// the empty part of the header) clears the selected row and closes the task panel.
// Presses on a row, a control, an overlay or the panel (outside the column) do not.
import { type RefObject, useEffect, useRef } from 'react'

/** Elements a press may land on without clearing: rows, cards, controls, fields, overlays, editors. */
const KEEP = '[data-task-id], [data-overlay], [data-overlay-root], button, a[href], input, textarea, select, label, summary, [role], [contenteditable="true"], [data-keep-selection]'

/** Whether a press on `target` is on empty space of the column. */
export function isEmptySpace(target: EventTarget | null): boolean {
  const el = target as Element | null
  if (!el || typeof el.closest !== 'function') return false
  return !el.closest(KEEP)
}

/**
 * Listens on the content column that holds `root` (its `main`) while `active`, and
 * calls `onClear` for a primary-button press on empty space.
 */
export function useClickAway(root: RefObject<HTMLElement | null>, active: boolean, onClear: () => void): void {
  const clear = useRef(onClear)
  clear.current = onClear
  useEffect(() => {
    if (!active) return
    const column = root.current?.closest('main') ?? root.current
    if (!column) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !isEmptySpace(e.target)) return
      clear.current()
    }
    column.addEventListener('pointerdown', onDown)
    return () => column.removeEventListener('pointerdown', onDown)
  }, [root, active])
}
