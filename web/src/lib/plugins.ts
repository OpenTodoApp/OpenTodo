// The plugin enable/disable list (OpenSpec change plugin-section, plugins "Enable
// and disable state", design D3): an additive `user_prefs.disabled_plugins`
// field, a comma-separated list of the plugin ids this account turned off,
// written through the operation log like every other preference, so a toggle
// works offline and reaches the user's other devices. Ids this build does not
// ship are kept in the set and never rewritten, so a list from a newer build
// stays harmless.
import { liveQuery } from 'dexie'
import { db } from './db'
import { mutate } from './ops'
import type { UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** The disabled plugin ids in a stored row; an empty or absent field means every plugin is on. */
export function readDisabledPlugins(row: Partial<UserPrefs> | null | undefined): ReadonlySet<string> {
  const raw = row?.disabled_plugins
  return new Set(typeof raw === 'string' && raw ? raw.split(',').filter(Boolean) : [])
}

/** Turns one plugin on or off on every device of this user, keeping ids of plugins this build does not ship. */
export async function setPluginEnabled(id: string, on: boolean): Promise<void> {
  const current = readDisabledPlugins(await db.userPrefs.get(USER_PREFS_ID))
  const next = on ? [...current].filter((x) => x !== id) : (current.has(id) ? [...current] : [...current, id])
  await mutate('user_prefs', USER_PREFS_ID, { disabled_plugins: next.join(',') })
}

/** Follows the list as it changes here or arrives from another device. */
export function watchPluginsPref(onChange: (disabled: ReadonlySet<string>) => void): () => void {
  const sub = liveQuery(() => db.userPrefs.get(USER_PREFS_ID)).subscribe({ next: (row) => onChange(readDisabledPlugins(row)), error: () => {} })
  return () => sub.unsubscribe()
}
