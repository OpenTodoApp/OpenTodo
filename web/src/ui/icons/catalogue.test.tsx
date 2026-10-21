// @vitest-environment happy-dom
// The icon catalogue (OpenSpec change icons-and-section-style, design-system "Icon
// catalogue"): its shape, the names list in the main bundle, the search order shared
// with the server (internal/iconset), and <CatalogueIcon>'s fallback.
import { afterEach, describe, expect, it } from 'vitest'
import { flush, render } from '../test-utils'
import { CatalogueIcon } from '../CatalogueIcon'
import catalogue from './catalogue.json'
import { CATALOGUE_NAMES } from './catalogue.names'
import { CATALOGUE_PATHS } from './catalogue.paths'
import { ICON_CATEGORIES, isCatalogueIcon, loadCatalogue, searchIcons, type CatalogueEntry } from './catalogue'
import { ICONS } from './lucide'

const entries = catalogue as CatalogueEntry[]
// The icons projects could carry before the catalogue (design D2: none may disappear).
const FORMER_PROJECT_ICONS = [
  'briefcase', 'house', 'heart', 'star', 'book-open', 'rocket', 'graduation-cap', 'plane', 'car', 'gift',
  'music', 'coffee', 'leaf', 'dumbbell', 'wallet', 'shopping-cart', 'camera', 'wrench', 'lightbulb', 'flame', 'anchor', 'globe', 'palette', 'folder',
]

afterEach(() => { document.body.innerHTML = '' })

describe('catalogue.json', () => {
  it('has at least 300 well-formed, unique entries in known categories', () => {
    expect(entries.length).toBeGreaterThanOrEqual(300)
    const names = new Set<string>()
    for (const e of entries) {
      expect(e.name).toMatch(/^[a-z0-9-]{1,64}$/)
      expect(names.has(e.name), `duplicate ${e.name}`).toBe(false)
      names.add(e.name)
      expect(ICON_CATEGORIES).toContain(e.category)
      expect(Array.isArray(e.keywords)).toBe(true)
    }
    expect(new Set(entries.map((e) => e.category)).size).toBeGreaterThanOrEqual(12)
  })

  it('keeps every former project icon', () => {
    const names = new Set(entries.map((e) => e.name))
    expect(FORMER_PROJECT_ICONS.filter((n) => !names.has(n))).toEqual([])
  })

  it('matches the generated names list and path data (re-run scripts/icons-sync.mjs)', () => {
    expect(CATALOGUE_NAMES.split(' ')).toEqual(entries.map((e) => e.name).sort())
    for (const e of entries) {
      const drawn = (ICONS as Record<string, string>)[e.name] ?? CATALOGUE_PATHS[e.name]
      expect(drawn, e.name).toBeTruthy()
    }
  })
})

describe('search', () => {
  it('orders exact name, name prefix, keyword, category', () => {
    const dog = searchIcons(entries, 'dog').map((e) => e.name)
    expect(dog[0]).toBe('dog')
    expect(dog).toContain('paw-print')
    expect(searchIcons(entries, 'plant').map((e) => e.name)).toEqual(expect.arrayContaining(['sprout', 'flower']))
    expect(searchIcons(entries, 'food').map((e) => e.name)).toContain('pizza')
    expect(searchIcons(entries, '')).toHaveLength(entries.length)
    expect(searchIcons(entries, 'zzzz-no-such-icon')).toEqual([])
  })

  it('knows a name without loading the catalogue', () => {
    expect(isCatalogueIcon('paw-print')).toBe(true)
    expect(isCatalogueIcon('chevron-right')).toBe(false)
    expect(isCatalogueIcon('from-a-newer-release')).toBe(false)
    expect(isCatalogueIcon(null)).toBe(false)
  })
})

describe('CatalogueIcon', () => {
  it('draws an interface icon at once', async () => {
    const r = await render(<CatalogueIcon name="briefcase" fallback={<i data-fallback />} />)
    expect(r.container.querySelector('svg[data-icon="briefcase"]')).not.toBeNull()
    expect(r.container.querySelector('[data-fallback]')).toBeNull()
    await r.unmount()
  })

  it('shows the fallback until the catalogue loads, then the icon', async () => {
    expect((ICONS as Record<string, string>)['paw-print']).toBeUndefined()
    const r = await render(<CatalogueIcon name="paw-print" fallback={<i data-fallback />} />)
    await loadCatalogue()
    await flush(10)
    expect(r.container.querySelector('svg[data-icon="paw-print"]')).not.toBeNull()
    expect(r.container.querySelector('[data-fallback]')).toBeNull()
    await r.unmount()
  })

  it('keeps the fallback for a name this device does not know', async () => {
    const r = await render(<CatalogueIcon name="from-a-newer-release" fallback={<i data-fallback />} />)
    await loadCatalogue()
    await flush(10)
    expect(r.container.querySelector('svg')).toBeNull()
    expect(r.container.querySelector('[data-fallback]')).not.toBeNull()
    await r.unmount()
  })
})
