// The icon catalogue (OpenSpec change icons-and-section-style, design D1–D3): the
// icons a person can choose for projects and sections. Interface icons draw at once
// from lucide.ts; the rest of the catalogue (entries and path data) is its own chunk,
// loaded the first time a picker opens or a stored name needs it. The server holds
// the same names (internal/iconset), checked by a Go test.
import { t } from '../../lib/i18n'
import { CATALOGUE_NAMES } from './catalogue.names'
import { ICONS } from './lucide'

export type IconCategory =
  | 'work' | 'home' | 'people' | 'travel' | 'food' | 'health' | 'money' | 'learning'
  | 'nature' | 'animals' | 'tools' | 'tech' | 'time' | 'communication' | 'symbols' | 'leisure'

export interface CatalogueEntry {
  name: string
  category: IconCategory
  keywords: string[]
}

/** Category order in the picker. */
export const ICON_CATEGORIES: readonly IconCategory[] = [
  'work', 'home', 'people', 'travel', 'food', 'health', 'money', 'learning',
  'nature', 'animals', 'tools', 'tech', 'time', 'communication', 'symbols', 'leisure',
]

/** A category's name in the interface language. */
export function categoryLabel(c: IconCategory): string {
  switch (c) {
    case 'work': return t('Work', { context: 'icon category' })
    case 'home': return t('Home', { context: 'icon category' })
    case 'people': return t('People', { context: 'icon category' })
    case 'travel': return t('Travel', { context: 'icon category' })
    case 'food': return t('Food', { context: 'icon category' })
    case 'health': return t('Health', { context: 'icon category' })
    case 'money': return t('Money', { context: 'icon category' })
    case 'learning': return t('Learning', { context: 'icon category' })
    case 'nature': return t('Nature', { context: 'icon category' })
    case 'animals': return t('Animals', { context: 'icon category' })
    case 'tools': return t('Tools', { context: 'icon category' })
    case 'tech': return t('Technology', { context: 'icon category' })
    case 'time': return t('Time', { context: 'icon category' })
    case 'communication': return t('Communication', { context: 'icon category' })
    case 'symbols': return t('Shapes and symbols', { context: 'icon category' })
    case 'leisure': return t('Leisure', { context: 'icon category' })
  }
}

const names = new Set(CATALOGUE_NAMES.split(' '))

/** True for a name in the catalogue, without loading it (a stored name may come from a newer client). */
export function isCatalogueIcon(name: string | null | undefined): name is string {
  return !!name && names.has(name)
}

export interface LoadedCatalogue {
  entries: CatalogueEntry[]
  /** Path data of a catalogue icon, interface icons included. */
  path: (name: string) => string | undefined
}

let loaded: LoadedCatalogue | null = null
let loading: Promise<LoadedCatalogue> | null = null

/** The catalogue once it has loaded on this page, or null. */
export function catalogueIfLoaded(): LoadedCatalogue | null {
  return loaded
}

/** Loads the catalogue's own chunk once; later calls share the same promise. */
export function loadCatalogue(): Promise<LoadedCatalogue> {
  if (loaded) return Promise.resolve(loaded)
  loading ??= Promise.all([import('./catalogue.json'), import('./catalogue.paths')]).then(([json, paths]) => {
    const entries = (json.default as CatalogueEntry[])
    const icons = ICONS as Record<string, string>
    loaded = { entries, path: (name) => icons[name] ?? paths.CATALOGUE_PATHS[name] }
    return loaded
  }, (err) => {
    // A failed load (offline before the first visit) may be retried later.
    loading = null
    throw err
  })
  return loading
}

/**
 * The rank of a match (design D2), the same order as the server's iconset.Rank:
 * 0 exact name, 1 name prefix, 2 name substring, 3 keyword, 4 category; -1 none.
 */
export function iconRank(e: CatalogueEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  if (e.name === q) return 0
  if (e.name.startsWith(q)) return 1
  if (e.name.includes(q)) return 2
  if (e.keywords.some((k) => k.toLowerCase().includes(q))) return 3
  if (e.category.includes(q) || categoryLabel(e.category).toLowerCase().includes(q)) return 4
  return -1
}

/** Entries matching the query, best first, ties in catalogue order; all of them for an empty query. */
export function searchIcons(entries: readonly CatalogueEntry[], query: string): CatalogueEntry[] {
  return entries
    .map((e, i) => ({ e, i, r: iconRank(e, query) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e)
}

/** An icon's readable name ("paw-print" → "paw print"), used as its accessible label. */
export function iconTitle(name: string): string {
  return name.replace(/-/g, ' ')
}
