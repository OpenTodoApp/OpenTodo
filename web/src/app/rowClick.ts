// "Click a task to" (OpenSpec changes inline-task-editing, design D6, and row-click-modes,
// design D1): a device-local choice between editing the title in place (the default),
// opening the task's details, as clicks did before, and expanding the row under it.
// Habits are per device and per pointer, so it does not sync. Read through a store so
// every list follows a change at once.
import { createStoredValue } from '../lib/deviceStorage'

export type RowClick = 'edit' | 'open' | 'expand'
export const ROW_CLICK_KEY = 'opentodo.rowClick'

// Another tab's choice applies here too (the storage event). Storage refused:
// the choice just does not stick.
const choice = createStoredValue<RowClick>(ROW_CLICK_KEY, {
  parse: (raw) => (raw === 'open' || raw === 'expand' ? raw : 'edit'),
  serialize: (v) => (v === 'edit' ? null : v),
}, { crossTab: true, server: 'edit' })

export const rowClick = choice.get
export const setRowClick = choice.set
export const useRowClick = choice.use

/**
 * Whether a click on a row expands it rather than opening it (row-click-modes D1): the
 * "Expand the row" choice, a pointer click (Enter's click has `detail` 0 and still opens)
 * and a row that can expand. Read at the click, so no row draws for the choice.
 */
export function clickExpands(e: { detail: number } | undefined, expandable: boolean): boolean {
  return expandable && !!e && e.detail > 0 && rowClick() === 'expand'
}

/**
 * The browser's double-click interval is not exposed; 500 ms is the longest common
 * default (Windows). A double-click whose first click opened the inline editor is
 * still a double-click on the row (row-click-modes D2).
 */
export const DOUBLE_CLICK_MS = 500
