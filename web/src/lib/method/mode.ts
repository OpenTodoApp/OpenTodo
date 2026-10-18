// "How you work" (OpenSpec change open-loops-method, design D2): one field of the
// synced `user_prefs` row (`method_mode`). It only decides what the app shows (sidebar, method
// links, rhythm markers, the Loop home's prominence); no mode writes or hides data.
import { useUserPrefsRow } from '../localData'
import { mutate } from '../ops'
import type { UserPrefs } from '../types'
import { USER_PREFS_ID } from '../userPrefs'

export const METHOD_MODES = ['lists', 'companion', 'first'] as const
export type MethodMode = (typeof METHOD_MODES)[number]

/** Reads the stored mode; a missing row, an empty or an unknown value (a newer client's) is `lists`. The row is not changed. */
export function readMethodMode(row: Partial<UserPrefs> | null | undefined): MethodMode {
  return METHOD_MODES.includes(row?.method_mode as MethodMode) ? (row!.method_mode as MethodMode) : 'lists'
}

/** Whether the method's words and links are shown (Companion and Open Loops first). */
export const methodShown = (mode: MethodMode): boolean => mode !== 'lists'

/** Changes the mode through the op log: offline-safe, synced, last-writer-wins. */
export function setMethodMode(mode: MethodMode): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { method_mode: mode })
}

/** The current mode; `lists` while the row loads. */
export function useMethodMode(): MethodMode {
  return readMethodMode(useUserPrefsRow())
}
