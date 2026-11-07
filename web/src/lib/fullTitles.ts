// Full task titles (OpenSpec change full-task-titles): `user_prefs.full_titles` "on"
// shows every task title in list rows, on board cards and in Today in full, wrapped
// onto as many lines as it takes, instead of two lines (one on a phone) and an
// ellipsis. Synced like the density, and applied the same way: an attribute on
// <html> (`data-titles="full"`) that the stylesheet reads, so turning it on or off
// re-renders no row. Read-time fallback: "" or an unknown value reads as off and is
// never rewritten.
import { useUserPrefsRow } from './localData'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** Whether the account shows titles in full; a missing row or an unknown value is off. */
export function fullTitlesOn(row: Pick<UserPrefs, 'full_titles'> | null | undefined): boolean {
  return row?.full_titles === 'on'
}

/** The account's choice, live. */
export function useFullTitles(): boolean {
  return fullTitlesOn(useUserPrefsRow())
}

/** Turns full titles on or off as one synced op; works offline. Off is stored as "". */
export function setFullTitles(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { full_titles: on ? 'on' : '' })
}

/** Sets or clears `data-titles="full"` on the document's root. */
export function applyFullTitles(on: boolean, doc: Document = document): void {
  if (on) doc.documentElement.setAttribute('data-titles', 'full')
  else doc.documentElement.removeAttribute('data-titles')
}
