// The screen inventory (OpenSpec change ux-audit-three-widths D1) and the lists it
// is checked against: the router's views, the layout check's screens and overlay
// openers, and the story titles of the workbench. Plain reads, no browser.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

export const inventory = () => JSON.parse(read('scripts/ux-audit/screens.json'))

/** Every `view: '…'` literal of the router's Route type. */
export function routerViews(src = read('web/src/app/router.ts')) {
  const type = src.slice(src.indexOf('export type Route'), src.indexOf('\n\n', src.indexOf('export type Route')))
  return [...new Set([...type.matchAll(/view: '([a-z-]+)'/g)].map((m) => m[1]))]
}

/** The layout check's screen names and overlay keys, read from its module the way it names them. */
export function layoutNames(src = read('scripts/ux-audit/layout-screens.mjs')) {
  const screens = new Set([...src.matchAll(/\{ name: '([a-z0-9-]+)'/g)].map((m) => m[1]))
  // Settings sections are generated from a list of [id, title] pairs.
  // Sections and sub-pages (settings-subpages): `account` and `account/security` name `settings-account` and `settings-account-security`.
  const list = src.match(/\.\.\.\[\n([\s\S]*?)\]\.map\(\(\[id, title, overlays\]\) => \(\{ name: `settings-\$\{id/)
  if (list) for (const m of list[1].matchAll(/\['([a-z/-]+)', '/g)) screens.add(`settings-${m[1].replace('/', '-')}`)
  const block = src.slice(src.indexOf('export const OVERLAYS = {'))
  const overlays = new Set([...block.matchAll(/^ {2}async (?:'([a-z0-9-]+)'|([a-z0-9]+))\(/gm)].map((m) => m[1] ?? m[2]))
  // Openers made from a list: `...Object.fromEntries([['name', …], …]` and the `${field}-picker` ones.
  for (const m of block.matchAll(/^ {2}\.\.\.Object\.fromEntries\(\[(.*?)\]\.map\(\(\[(\w+), \w+\]\) => \[(`\$\{\w+\}-picker`|\w+),/gm)) {
    for (const pair of m[1].matchAll(/\['([a-z0-9-]+)', /g)) overlays.add(m[3].startsWith('`') ? `${pair[1]}-picker` : pair[1])
  }
  return { screens, overlays }
}

/** Every story title in web/src (stories files only). */
export function storyTitles(dir = fileURLToPath(new URL('web/src/', root))) {
  const out = new Set()
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.stories.tsx')) for (const m of readFileSync(p, 'utf8').matchAll(/const meta[^=]*= \{[^}]*?title: '([^']+)'/g)) out.add(m[1])
    }
  }
  walk(dir)
  return out
}

/** Problems with the inventory against the router and the layout check (empty when it agrees). */
export function inventoryProblems(entries = inventory(), views = routerViews(), names = layoutNames()) {
  const out = []
  const ids = new Set()
  for (const e of entries) {
    if (ids.has(e.id)) out.push(`${e.id}: id used twice`)
    ids.add(e.id)
    if (!['daily', 'weekly', 'rare'].includes(e.frequency)) out.push(`${e.id}: frequency must be daily, weekly or rare`)
    if (e.core !== (e.frequency === 'daily' || e.frequency === 'weekly')) out.push(`${e.id}: core must be true exactly for daily and weekly entries`)
    if (!views.includes(e.route)) out.push(`${e.id}: route "${e.route}" is not a router view`)
    if (e.layoutCheck) {
      const known = e.kind === 'overlay' ? names.overlays : names.screens
      if (!known.has(e.layoutCheck)) out.push(`${e.id}: layout-check ${e.kind === 'overlay' ? 'overlay' : 'screen'} "${e.layoutCheck}" does not exist`)
    } else if (!e.layoutCheckReason) out.push(`${e.id}: not in the layout check and gives no reason`)
    if (e.kind === 'overlay' && e.tour !== false) {
      if (!e.layoutCheck && !e.open) out.push(`${e.id}: an overlay must name how it opens (a layout-check opener or open steps)`)
      if (!e.on || !names.screens.has(e.on)) out.push(`${e.id}: the screen it opens on ("${e.on}") is not a layout-check screen`)
      if (e.open?.overlay && !names.overlays.has(e.open.overlay)) out.push(`${e.id}: opener "${e.open.overlay}" does not exist`)
    }
    if (e.kind !== 'overlay' && !e.layoutCheck && e.tour !== false && (!e.path || !e.ready)) out.push(`${e.id}: a screen outside the layout check needs a path and a ready selector`)
    if (e.core && !e.story) out.push(`${e.id}: a core entry names the story that shows it`)
  }
  for (const v of views) if (!entries.some((e) => e.route === v)) out.push(`router view "${v}" has no inventory entry`)
  return out
}
