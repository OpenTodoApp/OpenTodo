// The theme of each side (OpenSpec change theme-engine, design D6; themes "Theme
// choice per light and dark side, synced"): `user_prefs.theme_light` and
// `theme_dark`. Empty is the side's default (OpenTodo Light or Dark);
// `builtin:<id>` names a theme shipped with the app; `user:<id>` and
// `instance:<id>` are reserved for the user's own and the instance's themes. A value
// this app cannot apply reads as the side's default, writes nothing and stays
// stored, so it applies once the theme is available. First-load code: small and
// without the derivation, which loads lazily (load.ts). The built-in catalogue
// (theme-catalogue D6) is not part of the first load either: without it a
// `builtin:` theme this code does not list reads as a theme provisionally, and the
// lazy loader answers whether this app has it (an unknown or other-kind theme then
// reads as the side's default); Settings loads the catalogue and passes it in.
import { mutate } from '../ops'
import type { UserPrefs } from '../types'
import { USER_PREFS_ID } from '../userPrefs'
import type { ThemeKind } from './format'
import { getInstanceThemes, instanceTheme, type InstanceThemes } from './instance'

export type Side = ThemeKind

/** A theme shipped with the app: its id and kind. The OpenTodo themes are the defaults and apply no sheet. */
export interface BuiltinTheme {
  id: string
  kind: ThemeKind
  /** OpenTodo Light or Dark: choosing it is the same as the default. */
  isDefault?: true
}

/** The OpenTodo themes, each side's default; the palettes are in the lazy catalogue (builtin/index.ts). */
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
  /** The theme that applies (the side's default unless status is `theme`): a builtin id, a custom theme's entity id when `custom`, an instance theme's server id when `instance`. */
  id: string
  /** The theme is one of the user's own (`user:<id>`, theme-editor D1). */
  custom?: true
  /** The theme is one of the server's (`instance:<id>`, theme-instance-default D1). */
  instance?: true
  /** The theme is the server's default for the side, which applies because the member's own choice does not (theme-instance-default D3). */
  fromDefault?: true
}

/** A custom theme as the choice reads it: its entity id and kind (the live, non-deleted rows). */
export interface KnownCustomTheme {
  id: string
  kind: ThemeKind
}

const FIELD: Record<Side, 'theme_light' | 'theme_dark'> = { light: 'theme_light', dark: 'theme_dark' }
const VALUE = /^(builtin|user|instance):([a-z0-9-]{1,64})$/

/**
 * The server's default for a side (theme-instance-default D3), as a choice: null
 * when there is none, or when this device cannot show it (an instance theme it has
 * not read, a theme of the other kind); the side then shows OpenTodo's theme.
 */
function serverDefault(side: Side, known: readonly BuiltinTheme[] | null, inst: InstanceThemes): SideChoice | null {
  const m = VALUE.exec(inst.default[side])
  if (!m) return null
  if (m[1] === 'instance') return instanceTheme(m[2], side, inst) ? { stored: '', status: 'theme', id: m[2], instance: true, fromDefault: true } : null
  if (m[1] !== 'builtin') return null
  const t = (known ?? BUILTIN_THEMES).find((b) => b.id === m[2])
  if (!t) return known ? null : { stored: '', status: 'theme', id: m[2], fromDefault: true }
  return t.kind === side && !t.isDefault ? { stored: '', status: 'theme', id: t.id, fromDefault: true } : null
}

/**
 * Reads one side's choice from the synced row (design D6). Never writes. An empty
 * value, or a theme that is gone, reads as the side's default: the server's when it
 * has one (theme-instance-default), else OpenTodo's.
 */
export function readThemeChoice(row: Partial<UserPrefs> | null | undefined, side: Side, known: readonly BuiltinTheme[] | null = null, custom: readonly KnownCustomTheme[] | null = null, inst: InstanceThemes = getInstanceThemes()): SideChoice {
  const raw = row?.[FIELD[side]]
  const stored = typeof raw === 'string' ? raw : ''
  const fallback = DEFAULT_THEME[side]
  const sideDefault = (): SideChoice => {
    const d = serverDefault(side, known, inst)
    return d ? { ...d, stored } : { stored, status: 'default', id: fallback }
  }
  if (stored === '') return sideDefault()
  const m = VALUE.exec(stored)
  if (!m) return { stored, status: 'invalid', id: fallback }
  if (m[1] === 'user') {
    // Without the list of custom themes the lazy loader decides (a missing, deleted or other-kind theme reads as the default).
    if (!custom) return { stored, status: 'theme', id: m[2], custom: true }
    const c = custom.find((x) => x.id === m[2])
    // A theme deleted or not synced yet reads as the side's default; the value stays (theme-editor D1).
    if (!c) return sideDefault()
    if (c.kind !== side) return { stored, status: 'invalid', id: fallback }
    return { stored, status: 'theme', id: c.id, custom: true }
  }
  if (m[1] === 'instance') {
    const e = instanceTheme(m[2], undefined, inst)
    // A theme the owner removed (or this device has not read yet) reads as the side's default; the value stays.
    if (!e) return sideDefault()
    if (e.kind !== side) return { stored, status: 'invalid', id: fallback }
    return { stored, status: 'theme', id: e.id, instance: true }
  }
  const t = (known ?? BUILTIN_THEMES).find((b) => b.id === m[2])
  // Without the catalogue, a theme this code does not list may be one of its palettes: the lazy loader decides.
  if (!t) return known ? { stored, status: 'newer', id: fallback } : { stored, status: 'theme', id: m[2] }
  if (t.kind !== side) return { stored, status: 'invalid', id: fallback }
  return t.isDefault ? { stored, status: 'default', id: t.id } : { stored, status: 'theme', id: t.id }
}

/** Both sides of the row. */
export function readThemeChoices(row: Partial<UserPrefs> | null | undefined, known: readonly BuiltinTheme[] | null = null, custom: readonly KnownCustomTheme[] | null = null, inst: InstanceThemes = getInstanceThemes()): Record<Side, SideChoice> {
  return { light: readThemeChoice(row, 'light', known, custom, inst), dark: readThemeChoice(row, 'dark', known, custom, inst) }
}

/** Whether the server has a default for the side (then choosing OpenTodo's theme is stored explicitly). */
export const hasServerDefault = (side: Side, inst: InstanceThemes = getInstanceThemes()) => inst.default[side] !== ''

/**
 * Chooses a builtin theme for one side: one op for one field (offline-safe, synced).
 * OpenTodo's theme is stored as the empty value, unless the server has a default for
 * the side: then it is stored by name, so it wins over that default.
 */
export function setThemeChoice(side: Side, id: string, known: readonly BuiltinTheme[] = BUILTIN_THEMES, inst: InstanceThemes = getInstanceThemes()): Promise<void> {
  const t = known.find((b) => b.id === id)
  if (!t || t.kind !== side) return Promise.reject(new Error(`not a ${side} theme: ${id}`))
  return mutate('user_prefs', USER_PREFS_ID, { [FIELD[side]]: t.isDefault && !hasServerDefault(side, inst) ? '' : `builtin:${id}` })
}

/** Follows the side's default again (the server's, else OpenTodo's): the empty value. */
export function setDefaultThemeChoice(side: Side): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [FIELD[side]]: '' })
}

/** The stored value of an instance theme for a side (theme-instance-default D1). */
export const instanceChoice = (id: string) => `instance:${id}`

/** Chooses one of the server's themes for a side: one op for one field. */
export function setInstanceThemeChoice(side: Side, id: string): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [FIELD[side]]: instanceChoice(id) })
}

/** The stored value of a custom theme for a side (theme-editor D1). */
export const customChoice = (id: string) => `user:${id}`

/** Chooses one of the user's own themes for a side: one op for one field. */
export function setCustomThemeChoice(side: Side, id: string): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [FIELD[side]]: customChoice(id) })
}

/** The field of a side, for batches that change a choice with other writes (deleting a chosen theme). */
export const choiceField = (side: Side) => FIELD[side]
