// The user's appearance (OpenSpec change theming): mode (system, light, dark) and
// accent theme, two fields of the synced `user_prefs` row. Applied as attributes
// on <html> (data-theme, data-accent) so CSS does the rest without re-rendering,
// with the bar colour and color-scheme kept in step. The last applied appearance
// is cached on the device for public/appearance.js, which applies it before the
// first paint; the cache is written from the synced value only, never the reverse.
import { ACCENTS, DARK_BAR, DEFAULT_ACCENT, isAccent, type AccentId } from '../ui/tokens/accents'
import { mutate } from './ops'
import type { ThemeModePref, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

export const THEME_MODES: readonly ThemeModePref[] = ['system', 'light', 'dark']

/** Destinations the user may promote from the sidebar's More group to its primary items (app-shell "Sidebar structure"). */
export const PROMOTABLE = ['anytime', 'someday', 'assigned', 'completed', 'feed', 'trash', 'filter'] as const
export type Promotable = (typeof PROMOTABLE)[number]

/** Row density (appearance-preferences "Density preference"); unknown stored values read as comfortable. */
export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

export interface Appearance {
  mode: ThemeModePref
  accent: AccentId
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
  return {
    mode,
    accent: isAccent(row?.theme_accent) ? row!.theme_accent as AccentId : DEFAULT_ACCENT,
    density: row?.density === 'compact' ? 'compact' : 'comfortable',
    sidebar: PROMOTABLE.filter((id) => wanted.has(id)),
  }
}

/** Changes the mode, the accent or the density through the op log (offline-safe, synced). */
export function setAppearance(field: 'theme_mode' | 'theme_accent' | 'density', value: string): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { [field]: value })
}

/** Promotes or demotes one destination; the stored list keeps entries this client does not know. */
export async function setPromoted(row: Partial<UserPrefs> | null | undefined, id: Promotable, on: boolean): Promise<void> {
  const current = (row?.sidebar_destinations ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const next = on ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id)
  await mutate('user_prefs', USER_PREFS_ID, { sidebar_destinations: next.join(',') })
}

/** The light-mode bar colour of an accent. */
export function lightBar(accent: AccentId): string {
  return ACCENTS.find((a) => a.id === accent)?.bar ?? ACCENTS[0].bar
}

/** The device cache read by public/appearance.js before the first paint. */
export const CACHE_KEY = 'ot.appearance'

/** Applies an appearance to a document (normally the app's own). */
export function applyAppearance(a: Appearance, doc: Document = document): void {
  const root = doc.documentElement
  if (a.mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', a.mode)
  if (a.accent === DEFAULT_ACCENT) root.removeAttribute('data-accent')
  else root.setAttribute('data-accent', a.accent)
  // Density (appearance-preferences): CSS tightens rows under data-density="compact";
  // touch targets keep their size through the coarse-pointer rules.
  if (a.density === 'compact') root.setAttribute('data-density', 'compact')
  else root.removeAttribute('data-density')
  setMeta(doc, 'color-scheme', a.mode === 'system' ? 'light dark' : a.mode)
  // The bar: the accent in light mode, the dark canvas in dark mode; under system
  // both, with media queries, so the browser switches on its own (design D8).
  for (const m of [...doc.head.querySelectorAll('meta[name="theme-color"]')]) m.remove()
  const add = (content: string, media?: string) => {
    const m = doc.createElement('meta')
    m.name = 'theme-color'
    m.content = content
    if (media) m.setAttribute('media', media)
    doc.head.append(m)
  }
  if (a.mode === 'system') {
    add(lightBar(a.accent), '(prefers-color-scheme: light)')
    add(DARK_BAR, '(prefers-color-scheme: dark)')
  } else add(a.mode === 'dark' ? DARK_BAR : lightBar(a.accent))
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ mode: a.mode, accent: a.accent, bar: lightBar(a.accent) }))
  } catch {
    // Private mode or blocked storage: the next start shows the defaults until the row is read.
  }
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
