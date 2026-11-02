// The user's appearance (OpenSpec change theming): mode (system, light, dark) and
// accent theme, two fields of the synced `user_prefs` row. Applied as attributes
// on <html> (data-theme, data-accent) so CSS does the rest without re-rendering,
// with the bar colour and color-scheme kept in step. The last applied appearance
// is cached on the device for public/appearance.js, which applies it before the
// first paint; the cache is written from the synced value only, never the reverse.
// The custom accent (accent-colour) is a picked colour whose derived values are set
// as inline properties on the root; the derivation itself loads lazily.
import { ACCENTS, CUSTOM_ACCENT, DARK_BAR, DEFAULT_ACCENT, isAccent, type AccentId, type ThemeAccent } from '../ui/tokens/accents'
import { mutate } from './ops'
import type { ThemeModePref, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'
import { readJSON, writeJSON } from './deviceStorage'
import { applyTheme, readThemeCache, writeThemeCache, type ThemeCache } from './theme/apply'
import { setSystemBars } from './shell'
import { resettable } from './moduleState'

export const THEME_MODES: readonly ThemeModePref[] = ['system', 'light', 'dark']

/** Destinations the user may promote from the sidebar's More group to its primary items (app-shell "Sidebar structure"). */
export const PROMOTABLE = ['loop', 'next', 'waiting', 'anytime', 'someday', 'assigned', 'completed', 'feed', 'trash', 'filter', 'focus', 'notes'] as const
export type Promotable = (typeof PROMOTABLE)[number]

/** Row density (appearance-preferences "Density preference"); unknown stored values read as comfortable. */
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** A stored custom colour: lowercase `#rrggbb` (accent-colour D1). */
export const CUSTOM_HEX = /^#[0-9a-f]{6}$/

/** The derived values of a custom accent (lib/accentDerive.ts), each `#rrggbb`. */
export interface CustomAccentValues {
  light: string
  dark: string
  on: string
  /** The dark-mode button, only when it differs from the light accent. */
  button?: string
}

export interface Appearance {
  mode: ThemeModePref
  /** A built-in theme, or `custom` when a valid custom colour is stored. */
  accent: ThemeAccent
  /** The stored custom colour, kept while a built-in theme is chosen. */
  custom?: string
  /** Row density; comfortable when absent. */
  density?: Density
  /** Promoted sidebar destinations, in the More group's order; unknown stored entries are dropped on read, kept in the row. */
  sidebar?: Promotable[]
}

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', accent: DEFAULT_ACCENT, density: 'comfortable', sidebar: [] }

/** Reads a stored row: a missing row or an unknown value (from a newer client) is the default. The row is not changed. */
export function readAppearance(row: Partial<UserPrefs> | null | undefined): Appearance {
  const mode = THEME_MODES.includes(row?.theme_mode as ThemeModePref) ? (row!.theme_mode as ThemeModePref) : 'system'
  const wanted = new Set((row?.sidebar_destinations ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const custom = typeof row?.theme_accent_custom === 'string' && CUSTOM_HEX.test(row.theme_accent_custom) ? row.theme_accent_custom : undefined
  // `custom` without a valid colour reads as the default (appearance-preferences "Custom without a colour").
  const accent: ThemeAccent = row?.theme_accent === CUSTOM_ACCENT ? (custom ? CUSTOM_ACCENT : DEFAULT_ACCENT) : isAccent(row?.theme_accent) ? row!.theme_accent as AccentId : DEFAULT_ACCENT
  return {
    mode,
    accent,
    ...(custom ? { custom } : {}),
    density: row?.density === 'compact' ? 'compact' : 'comfortable',
    sidebar: PROMOTABLE.filter((id) => wanted.has(id)),
  }
}

/**
 * Changes the mode, the accent or the density through the op log (offline-safe,
 * synced). `row_detail` is retired (rows-v2 D1): kept in the schema, never written.
 */
export function setAppearance(field: 'theme_mode' | 'theme_accent' | 'density', value: string): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [field]: value })
}

/**
 * Chooses a custom colour (accent-colour D1): the theme `custom` and the colour,
 * two fields of one batch under one timestamp. Choosing a built-in theme later
 * writes `theme_accent` only, so the colour is kept for next time.
 */
export function setCustomAccent(hex: string): Promise<void> {
  if (!CUSTOM_HEX.test(hex)) return Promise.reject(new Error(`not a #rrggbb colour: ${hex}`))
  return mutate('user_prefs', USER_PREFS_ID, { theme_accent: CUSTOM_ACCENT, theme_accent_custom: hex })
}

/** Promotes or demotes one destination; the stored list keeps entries this client does not know. */
export async function setPromoted(row: Partial<UserPrefs> | null | undefined, id: Promotable, on: boolean): Promise<void> {
  const current = (row?.sidebar_destinations ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const next = on ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id)
  await mutate('user_prefs', USER_PREFS_ID, { sidebar_destinations: next.join(',') })
}

/**
 * Sidebar counts (sidebar-polish D1, appearance-preferences "Sidebar counts
 * preference"): `today` shows numbers at rest on Inbox and Today only (the quiet
 * sidebar, stored as ''), `all` on every project, label and saved-view row.
 */
export const SIDEBAR_COUNTS = ['today', 'all'] as const
export type SidebarCounts = (typeof SIDEBAR_COUNTS)[number]

/** Reads the stored choice; an empty or unknown value (from a newer client) is the default. The row is not changed. */
export function readSidebarCounts(row: Partial<UserPrefs> | null | undefined): SidebarCounts {
  return row?.sidebar_counts === 'all' ? 'all' : 'today'
}

/** Writes the choice through the op log (offline-safe, synced); the default is stored as ''. */
export function setSidebarCounts(value: SidebarCounts): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { sidebar_counts: value === 'all' ? 'all' : '' })
}

/** The destinations that are always primary outside Open Loops first, in the default order (app-shell "Sidebar structure"). */
export const FIXED_DESTINATIONS = ['inbox', 'today', 'upcoming', 'calendar'] as const
export type DestinationId = (typeof FIXED_DESTINATIONS)[number] | Promotable

const splitIds = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/**
 * The primary destinations in the user's order (sidebar-polish D3): the ids of the
 * stored order that are in `primary` come first, in the stored order; the others
 * follow in their order in `primary` (the default order). Unknown stored ids are
 * ignored here and kept in the row.
 */
export function orderDestinations<T extends string>(primary: readonly T[], stored: string | null | undefined): T[] {
  const present = new Set<string>(primary)
  const seen = new Set<string>()
  const first: T[] = []
  for (const id of splitIds(stored)) {
    if (present.has(id) && !seen.has(id)) { seen.add(id); first.push(id as T) }
  }
  return [...first, ...primary.filter((id) => !seen.has(id))]
}

/** Every destination that can be primary, in the user's order: the fixed four and the promotable ones. */
export function destinationOrder(row: Partial<UserPrefs> | null | undefined): DestinationId[] {
  return orderDestinations<DestinationId>([...FIXED_DESTINATIONS, ...PROMOTABLE], row?.sidebar_order)
}

/**
 * Moves one destination by `delta` places in the full order and stores it whole
 * (last-writer-wins on the order). Ids this client does not know stay at the end.
 * Resolves to false when the destination is already at that edge.
 */
export async function moveDestination(row: Partial<UserPrefs> | null | undefined, id: DestinationId, delta: number): Promise<boolean> {
  const order = destinationOrder(row)
  const from = order.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= order.length) return false
  order.splice(to, 0, ...order.splice(from, 1))
  const known = new Set<string>(order)
  const unknown = splitIds(row?.sidebar_order).filter((x) => !known.has(x))
  await mutate('user_prefs', USER_PREFS_ID, { sidebar_order: [...order, ...unknown].join(',') })
  return true
}

/** The light-mode bar colour of an accent. */
export function lightBar(accent: AccentId): string {
  return ACCENTS.find((a) => a.id === accent)?.bar ?? ACCENTS[0].bar
}

/** The device cache read by public/appearance.js before the first paint. */
export const CACHE_KEY = 'ot.appearance'

/** The inline root properties a custom accent sets (accent-colour D3): the inputs of the stylesheet's accent derivation. */
const CUSTOM_PROPS = { light: '--ot-al-accent', dark: '--ot-ad-accent-text', on: '--ot-a-on-accent', button: '--ot-ad-accent' } as const

/**
 * The inline properties of a custom accent on an element (a preview, the Custom
 * tile). `--ot-ad-accent: initial` keeps an inherited dark button from showing
 * through when this accent has none.
 */
export function customAccentStyle(v: CustomAccentValues): Record<string, string> {
  return { [CUSTOM_PROPS.light]: v.light, [CUSTOM_PROPS.dark]: v.dark, [CUSTOM_PROPS.on]: v.on, [CUSTOM_PROPS.button]: v.button ?? 'initial' }
}

const validValues = (v: unknown): v is CustomAccentValues & { input: string } => {
  const o = v as Record<string, unknown> | null
  const hex = (x: unknown) => typeof x === 'string' && CUSTOM_HEX.test(x)
  return !!o && hex(o.input) && hex(o.light) && hex(o.dark) && hex(o.on) && (o.button === undefined || hex(o.button))
}

/** The derived values cached on this device for `hex`, if the cache holds them (accent-colour D4). */
export function cachedCustom(hex: string | undefined): CustomAccentValues | null {
  if (!hex) return null
  const c = readJSON<{ custom?: unknown } | null>(CACHE_KEY, null)?.custom
  if (!validValues(c) || c.input !== hex) return null
  return { light: c.light, dark: c.dark, on: c.on, ...(c.button ? { button: c.button } : {}) }
}

/** Derives a custom accent; the derivation loads on first use (it is not part of the first load). */
export async function deriveCustom(hex: string): Promise<CustomAccentValues> {
  const { deriveAccent } = await import('./accentDerive')
  const d = deriveAccent(hex)
  return { light: d.light, dark: d.dark, on: d.on, ...(d.button ? { button: d.button } : {}) }
}

/**
 * The resolved themes of each side (theme-engine D4, D5): what public/appearance.js
 * applied from the device cache until the app resolves the synced choice. An absent
 * side is its OpenTodo theme.
 */
let themesNow: ThemeCache = readThemeCache()
let lastApplied: { a: Appearance; doc: Document; derived?: CustomAccentValues | null } | null = null
/** The bar colour last handed to a native shell, so it is sent only when it changes. */
let barsSent = ''
resettable('appearanceThemes', () => { themesNow = readThemeCache(); lastApplied = null; barsSent = '' })

/** The side the app shows: the mode, or under `system` the operating system's scheme. */
export function effectiveSide(mode: ThemeModePref, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return doc?.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Sets the resolved themes of both sides, remembers them on the device (never an op)
 * and applies them with the last appearance. A side left out shows its OpenTodo theme.
 */
export function setAppearanceThemes(t: ThemeCache): void {
  themesNow = t
  writeThemeCache(t)
  reapplyAppearance()
}

/** The resolved themes now in use (tests and Settings). */
export function appearanceThemes(): ThemeCache {
  return themesNow
}

/** Applies the last appearance again (the operating system switched between light and dark). */
export function reapplyAppearance(): void {
  if (lastApplied) applyAppearance(lastApplied.a, lastApplied.doc, lastApplied.derived)
}

/**
 * Applies an appearance to a document (normally the app's own). The custom accent
 * needs its derived values; without them the default accent shows. The theme of the
 * side shown applies on top (theme-engine D4): its sheet sets every colour token, so
 * the accent preference only shows on the OpenTodo themes (D7).
 */
export function applyAppearance(a: Appearance, doc: Document = document, derived?: CustomAccentValues | null): void {
  lastApplied = { a, doc, derived }
  const root = doc.documentElement
  if (a.mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', a.mode)
  const custom = a.accent === CUSTOM_ACCENT && a.custom && derived ? derived : null
  // Only the inputs are set, never --ot-accent itself, so the high-contrast block still wins (design D3).
  for (const k of ['light', 'dark', 'on', 'button'] as const) {
    const v = custom?.[k]
    if (v) root.style.setProperty(CUSTOM_PROPS[k], v)
    else root.style.removeProperty(CUSTOM_PROPS[k])
  }
  const accent = custom ? CUSTOM_ACCENT : a.accent === CUSTOM_ACCENT ? DEFAULT_ACCENT : a.accent
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', accent)
  // Density (appearance-preferences): CSS tightens rows under data-density="compact";
  // touch targets keep their size through the coarse-pointer rules.
  if (a.density === 'compact') root.setAttribute('data-density', 'compact')
  else root.removeAttribute('data-density')
  setMeta(doc, 'color-scheme', a.mode === 'system' ? 'light dark' : a.mode)
  const side = effectiveSide(a.mode, doc)
  applyTheme(themesNow[side] ?? null, doc)
  // The bar: the accent in light mode, the dark canvas in dark mode; under system
  // both, with media queries, so the browser switches on its own (design D8). A theme
  // brings its own bar colour (theme-engine D8).
  const bar = custom ? custom.light : lightBar(accent as AccentId)
  const lightBarColour = themesNow.light?.bar ?? bar
  const darkBarColour = themesNow.dark?.bar ?? DARK_BAR
  for (const m of [...doc.head.querySelectorAll('meta[name="theme-color"]')]) m.remove()
  const add = (content: string, media?: string) => {
    const m = doc.createElement('meta')
    m.name = 'theme-color'
    m.content = content
    if (media) m.setAttribute('media', media)
    doc.head.append(m)
  }
  if (a.mode === 'system') {
    add(lightBarColour, '(prefers-color-scheme: light)')
    add(darkBarColour, '(prefers-color-scheme: dark)')
  } else add(a.mode === 'dark' ? darkBarColour : lightBarColour)
  // A native shell colours its status and navigation bars the same (native-shells "System bars follow the app's theme").
  const shown = side === 'dark' ? darkBarColour : lightBarColour
  if (doc === document && shown !== barsSent && setSystemBars(shown)) barsSent = shown
  // Private mode or blocked storage: the next start shows the defaults until the row is read.
  writeJSON(CACHE_KEY, { mode: a.mode, accent, bar, ...(custom ? { custom: { input: a.custom, ...custom } } : {}) })
}

function setMeta(doc: Document, name: string, content: string) {
  let m = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!m) {
    m = doc.createElement('meta')
    m.name = name
    doc.head.append(m)
  }
  m.content = content
}
