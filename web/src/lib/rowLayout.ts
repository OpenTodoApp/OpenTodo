// Task row layouts (OpenSpec change row-layouts): "One line", the Precision row, and
// "Detailed", which gives the task its parent and a details line. The account's
// choice (user_prefs.row_layout) is the layout of every list; a saved view, a project
// and a label may choose their own in Display options (`row_layout` on the view, the
// personal project_prefs row and the label; "" follows the account). Read-time
// fallback: "" or an unknown value reads as the default and is never rewritten.
import { useUserPrefsRow } from './localData'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export type RowLayout = 'line' | 'detailed'
export const ROW_LAYOUTS: readonly RowLayout[] = ['line', 'detailed']

/** A stored layout, or `fallback` for "" and values this build does not know. */
export function rowLayoutOf(value: unknown, fallback: RowLayout = 'line'): RowLayout {
  return value === 'line' || value === 'detailed' ? value : fallback
}

/** The account's layout from its preferences row. */
export function accountRowLayout(row: Pick<UserPrefs, 'row_layout'> | null | undefined): RowLayout {
  return rowLayoutOf(row?.row_layout)
}

/** The account's layout, live: the layout of every list without its own choice. */
export function useAccountRowLayout(): RowLayout {
  return accountRowLayout(useUserPrefsRow())
}

/** Sets the account's layout as one synced op; works offline. */
export function setAccountRowLayout(layout: RowLayout): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { row_layout: layout })
}
