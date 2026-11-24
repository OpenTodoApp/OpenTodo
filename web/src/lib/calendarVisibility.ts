// Calendars hidden per workspace (OpenSpec change calendars-per-workspace, design D1):
// `user_prefs.calendars_hidden` maps a workspace id to the ids of the calendars hidden
// there, as JSON. A hide-list: a calendar or a workspace it does not name is shown.
// Written whole through one op, so it works offline and converges by last-writer-wins.
import { mutate } from './ops'
import { USER_PREFS_ID } from './userPrefs'
import type { UserPrefs } from './types'

export type HiddenCalendars = Readonly<Record<string, readonly string[]>>

const NONE: ReadonlySet<string> = new Set()

/** The stored hide-list; anything but an object of string arrays reads as nothing hidden (the row is not changed). */
export function readCalendarsHidden(row: Partial<UserPrefs> | null | undefined): HiddenCalendars {
  const v = row?.calendars_hidden
  if (typeof v !== 'string' || !v) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(v)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, string[]> = {}
  for (const [ws, ids] of Object.entries(parsed)) {
    if (Array.isArray(ids)) out[ws] = ids.filter((id): id is string => typeof id === 'string')
  }
  return out
}

/** The calendars hidden in one workspace. */
export function hiddenIn(hidden: HiddenCalendars, workspaceId: string): ReadonlySet<string> {
  const ids = hidden[workspaceId]
  return ids?.length ? new Set(ids) : NONE
}

/**
 * The value to store after changing `workspace`: only its ids are pruned against
 * `calendars` (the calendars this device knows). Other workspaces' entries are copied
 * unchanged, so hides made on a device that knows a workspace or calendar this one has
 * not seen survive. Keys sorted, "" when nothing is hidden.
 */
export function calendarsHiddenValue(hidden: HiddenCalendars, workspace: string, calendars: readonly string[]): string {
  const cals = new Set(calendars)
  const out: Record<string, readonly string[]> = {}
  for (const key of Object.keys(hidden).sort()) {
    const ids = key === workspace ? [...new Set(hidden[key].filter((id) => cals.has(id)))].sort() : hidden[key]
    if (ids.length > 0) out[key] = ids
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : ''
}

/** Hides or shows one calendar in one workspace, pruning that workspace's stale ids (one op). Nothing is written before the workspace is known. */
export async function setCalendarHidden(
  row: Partial<UserPrefs> | null | undefined,
  at: { workspace: string; calendars: readonly string[] },
  calendarId: string,
  hide: boolean,
): Promise<void> {
  if (!at.workspace) return
  const hidden = readCalendarsHidden(row)
  const ids = new Set(hidden[at.workspace] ?? [])
  if (hide) ids.add(calendarId)
  else ids.delete(calendarId)
  const value = calendarsHiddenValue({ ...hidden, [at.workspace]: [...ids] }, at.workspace, at.calendars)
  return mutate('user_prefs', USER_PREFS_ID, { calendars_hidden: value })
}
