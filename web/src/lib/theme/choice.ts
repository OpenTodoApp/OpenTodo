// The theme of each side (OpenSpec change theme-engine, design D6; themes "Theme
// choice per light and dark side, synced"): `user_prefs.theme_light` and
// `theme_dark`. Empty is the side's default (OpenTodo Light or Dark);
// `builtin:<id>` names a theme shipped with the app; `user:<id>` and
// `instance:<id>` are reserved for the user's own and the instance's themes. A value
// this app cannot apply reads as the side's default, writes nothing and stays
// stored, so it applies once the theme is available. First-load code: small and
// without the derivation, which loads lazily (load.ts).
import { mutate } from '../ops'
import type { UserPrefs } from '../types'
import { USER_PREFS_ID } from '../userPrefs'
import type { ThemeKind } from './format'

export type Side = ThemeKind

/** A theme shipped with the app: its id and kind. The OpenTodo themes are the defaults and apply no sheet. */
export interface BuiltinTheme {
  id: string
  kind: ThemeKind
  /** OpenTodo Light or Dark: choosing it is the same as the default. */
  isDefault?: true
}

/** The themes shipped with this app, each side's default first (theme-catalogue adds the palettes). */
export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  { id: 'opentodo-light', kind: 'light', isDefault: true },
  { id: 'opentodo-dark', kind: 'dark', isDefault: true },
]

export const DEFAULT_THEME: Record<Side, string> = { light: 'opentodo-light', dark: 'opentodo-dark' }

/** What a side's stored value means on this device. */
export type ChoiceStatus =
  /** Empty, or an OpenTodo theme: today's look, no sheet. */
  | 'default'
  /** A theme this app has (applied through a generated sheet). */
  | 'theme'
  /** A theme this app does not know or cannot read yet: made with a newer version. */
  | 'newer'
  /** A malformed value, or a theme of the other kind. */
  | 'invalid'

export interface SideChoice {
  /** The stored value, kept as it is whatever this app makes of it. */
  stored: string
  status: ChoiceStatus
  /** The builtin theme that applies (the side's default unless status is `theme`). */
  id: string
}

const FIELD: Record<Side, 'theme_light' | 'theme_dark'> = { light: 'theme_light', dark: 'theme_dark' }
const VALUE = /^(builtin|user|instance):([a-z0-9-]{1,64})$/

/** Reads one side's choice from the synced row (design D6). Never writes. */
export function readThemeChoice(row: Partial<UserPrefs> | null | undefined, side: Side): SideChoice {
  const raw = row?.[FIELD[side]]
  const stored = typeof raw === 'string' ? raw : ''
  const fallback = DEFAULT_THEME[side]
  if (stored === '') return { stored, status: 'default', id: fallback }
  const m = VALUE.exec(stored)
  if (!m) return { stored, status: 'invalid', id: fallback }
  if (m[1] !== 'builtin') return { stored, status: 'newer', id: fallback }
  const t = BUILTIN_THEMES.find((b) => b.id === m[2])
  if (!t) return { stored, status: 'newer', id: fallback }
  if (t.kind !== side) return { stored, status: 'invalid', id: fallback }
  return t.isDefault ? { stored, status: 'default', id: t.id } : { stored, status: 'theme', id: t.id }
}

/** Both sides of the row. */
export function readThemeChoices(row: Partial<UserPrefs> | null | undefined): Record<Side, SideChoice> {
  return { light: readThemeChoice(row, 'light'), dark: readThemeChoice(row, 'dark') }
}

/**
 * Chooses a builtin theme for one side: one op for one field (offline-safe, synced).
 * The side's default is stored as the empty value.
 */
export function setThemeChoice(side: Side, id: string): Promise<void> {
  const t = BUILTIN_THEMES.find((b) => b.id === id)
  if (!t || t.kind !== side) return Promise.reject(new Error(`not a ${side} theme: ${id}`))
  return mutate('user_prefs', USER_PREFS_ID, { [FIELD[side]]: t.isDefault ? '' : `builtin:${id}` })
}
