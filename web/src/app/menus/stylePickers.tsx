// The icon and colour choices of the project and section menus as palette pickers
// (OpenSpec change icons-and-section-style). In a menu they render as the icon grid
// and the colour swatches (step items); the command palette, which lists every menu
// item as a command, runs them as these Combobox pickers instead.
import { CatalogueIcon, categoryLabel, HUES, loadCatalogue, searchIcons, type CatalogueEntry } from '../../ui'
import { hueName } from '../../lib/colourNames'
import { t } from '../../lib/i18n'
import type { PickerSpec } from './ActionMenu'

type IconChoice = { name: string | null; entry?: CatalogueEntry }

/** Choose an icon from the catalogue, or "No icon". */
export function iconPickerSpec(current: string | null | undefined, onPick: (name: string | null) => unknown): PickerSpec<IconChoice> {
  const none: IconChoice = { name: null }
  return {
    title: t('Icon'), placeholder: t('Search icons'), emptyText: t('No matches'),
    source: async (query) => {
      const c = await loadCatalogue()
      return { items: [none, ...searchIcons(c.entries, query).map((entry) => ({ name: entry.name, entry }))] }
    },
    getKey: (i) => i.name ?? 'none',
    getLabel: (i) => (i.name ? i.name.replace(/-/g, ' ') : t('No icon')),
    getKeywords: (i) => (i.entry ? [...i.entry.keywords, categoryLabel(i.entry.category)].join(' ') : undefined),
    getGroup: (i) => (i.entry ? categoryLabel(i.entry.category) : undefined),
    pinned: ['none'],
    selected: [current ?? 'none'],
    renderLeading: (i) => (i.name ? <CatalogueIcon name={i.name} /> : <span className="block h-4 w-4" />),
    onPick: (i) => { void onPick(i.name) },
  }
}

type ColourChoice = { hex: string | null; name: string }

/** Choose a palette colour, or "No colour". */
export function colourPickerSpec(current: string | null | undefined, onPick: (hex: string | null) => unknown): PickerSpec<ColourChoice> {
  const items: ColourChoice[] = [{ hex: null, name: t('No colour') }, ...HUES.map((h) => ({ hex: h.hex, name: hueName(h.name) }))]
  return {
    title: t('Colour'), placeholder: t('Find a colour…'),
    source: items,
    getKey: (i) => i.hex ?? 'none',
    getLabel: (i) => i.name,
    pinned: ['none'],
    selected: [current ?? 'none'],
    renderLeading: (i) => (i.hex ? <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: i.hex }} /> : <span className="block h-3 w-3 rounded-full border border-dashed border-default" />),
    onPick: (i) => { void onPick(i.hex) },
  }
}
