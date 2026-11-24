// Click a task to (OpenSpec change click-default): "select" (the first click selects
// the task, a second click on its title edits it; click-selects-title) or "open" (a
// click opens the task and never edits). The account's choice is the synced
// `user_prefs.row_click`; empty or unknown follows the server's default, which
// auth/status reports and this device mirrors so the first paint and offline use
// follow it too. Read at the press, so changing it re-renders no row.
import { createStore } from './store'
import { msg, translatedMap } from './i18n'
import { readEnum, writeString } from './deviceStorage'
import { currentUserPrefsRow, useUserPrefsRow } from './localData'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export type RowClickMode = 'select' | 'open'
/** The account's choice: '' follows the server's default. */
export type RowClickPref = '' | RowClickMode

export const ROW_CLICK_MODES: readonly RowClickMode[] = ['select', 'open']
export const ROW_CLICK_PREFS: readonly RowClickPref[] = ['', ...ROW_CLICK_MODES]
export const ROW_CLICK_LABEL = translatedMap<RowClickMode>({ select: msg('Select, then edit the title'), open: msg('Open details') })

const KEY = 'opentodo.rowClickDefault'
const serverDefault = createStore<RowClickMode>('rowClickDefault', readEnum(KEY, ROW_CLICK_MODES, 'select'), () => 'select')

/** Records the server's default from auth/status (absent on older servers: select). */
export function setServerRowClick(value: unknown): void {
  const next: RowClickMode = value === 'open' ? 'open' : 'select'
  if (next === serverDefault.get()) return
  writeString(KEY, next === 'select' ? null : next)
  serverDefault.set(next)
}

export const useServerRowClick = serverDefault.use

/** The account's stored choice; empty or unknown (a newer client) reads as '' without rewriting it. */
export function readRowClick(row: Pick<UserPrefs, 'row_click'> | null | undefined): RowClickPref {
  return ROW_CLICK_MODES.includes(row?.row_click as RowClickMode) ? (row!.row_click as RowClickMode) : ''
}

/** What a click does now: the account's choice, else the server's default. */
export function rowClickMode(row: Pick<UserPrefs, 'row_click'> | null | undefined = currentUserPrefsRow()): RowClickMode {
  return readRowClick(row) || serverDefault.get()
}

/** The account's choice, live. */
export function useRowClickPref(): RowClickPref {
  return readRowClick(useUserPrefsRow())
}

/** Chooses for the account as one synced op; works offline. '' follows the server again. */
export function setRowClick(value: RowClickPref): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { row_click: value })
}
