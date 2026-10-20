// Favourites (OpenSpec change sidebar-favourites, design D1–D2): one synced, ordered
// list of `kind:id` entries in the user's own preferences row (`user_prefs.favourites`),
// so a pin is personal (a shared project never carries a member's pin) and the order
// across kinds is one last-writer-wins value. Saved filters keep their own `pinned`
// flag for the API, the CLI and older devices: a pinned filter the list does not name
// is a favourite after the listed entries, and pinning or unpinning one writes both.
import { db } from './db'
import { mutateMany, type Change } from './ops'
import type { Label, Project, UserPrefs, View } from './types'
import { USER_PREFS_ID } from './userPrefs'

export const FAVOURITE_KINDS = ['project', 'label', 'view'] as const
export type FavouriteKind = (typeof FAVOURITE_KINDS)[number]

export type Favourite =
  | { kind: 'project'; id: string; item: Project }
  | { kind: 'label'; id: string; item: Label }
  | { kind: 'view'; id: string; item: View }

export interface FavouriteSources {
  projects: readonly Project[]
  labels: readonly Label[]
  views: readonly View[]
}

const entryOf = (kind: string, id: string) => `${kind}:${id}`

/** The stored entries in order, de-duplicated; unknown kinds are kept as they are. */
export function parseFavourites(raw: string | null | undefined): string[] {
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const e = part.trim()
    if (e && e.includes(':') && !out.includes(e)) out.push(e)
  }
  return out
}

function split(entry: string): { kind: string; id: string } {
  const i = entry.indexOf(':')
  return { kind: entry.slice(0, i), id: entry.slice(i + 1) }
}

/**
 * The Favourites group (D2): the listed entries that resolve to a live item (a
 * project neither archived nor deleted, a live label, a live view whose pinned flag
 * is not false), then every pinned view the list does not name, by position. Nothing
 * is written: an entry that does not resolve stays in the row, so a restore brings it back.
 */
export function favouritesOf(prefs: Partial<UserPrefs> | null | undefined, src: FavouriteSources): Favourite[] {
  const projects = new Map(src.projects.filter((p) => !p.deleted_at && !p.archived).map((p) => [p.id, p]))
  const labels = new Map(src.labels.filter((l) => !l.deleted_at).map((l) => [l.id, l]))
  const views = new Map(src.views.filter((v) => !v.deleted_at).map((v) => [v.id, v]))
  const out: Favourite[] = []
  const named = new Set<string>()
  for (const entry of parseFavourites(prefs?.favourites)) {
    const { kind, id } = split(entry)
    if (kind === 'view') named.add(id)
    if (kind === 'project') { const item = projects.get(id); if (item) out.push({ kind, id, item }) }
    else if (kind === 'label') { const item = labels.get(id); if (item) out.push({ kind, id, item }) }
    else if (kind === 'view') { const item = views.get(id); if (item && item.pinned !== false) out.push({ kind, id, item }) }
  }
  const extra = [...views.values()].filter((v) => v.pinned === true && !named.has(v.id))
    .sort((a, b) => a.position - b.position || a.created_at - b.created_at || (a.id < b.id ? -1 : 1))
  for (const item of extra) out.push({ kind: 'view', id: item.id, item })
  return out
}

/** Whether an item is a favourite: a view by its pinned flag, a project or label by the list. */
export function isFavourite(prefs: Partial<UserPrefs> | null | undefined, kind: FavouriteKind, id: string, view?: Pick<View, 'pinned'>): boolean {
  if (kind === 'view') return view?.pinned === true
  return parseFavourites(prefs?.favourites).includes(entryOf(kind, id))
}

// Read-then-write on this device is serialised, so two quick pins never drop one another.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

async function storedList(): Promise<string[]> {
  return parseFavourites((await db.userPrefs.get(USER_PREFS_ID))?.favourites)
}

function prefsChange(list: string[]): Change {
  return { entity: 'user_prefs', entityId: USER_PREFS_ID, patch: { favourites: list.join(',') } }
}

/**
 * Pins an item: one preference op (plus the view's pinned flag, in the same batch,
 * for a saved filter). Never a project or label op, so pins stay personal.
 */
export function pin(kind: FavouriteKind, id: string): Promise<void> {
  return serial(async () => {
    const list = await storedList()
    const changes: Change[] = []
    if (!list.includes(entryOf(kind, id))) changes.push(prefsChange([...list, entryOf(kind, id)]))
    if (kind === 'view') {
      const view = await db.views.get(id)
      if (!view || view.deleted_at) return
      if (view.pinned !== true) changes.push({ entity: 'view', entityId: id, patch: { pinned: true } })
    }
    if (changes.length) await mutateMany(changes)
  })
}

/** Unpins an item: removes its entry and, for a saved filter, clears its pinned flag. */
export function unpin(kind: FavouriteKind, id: string): Promise<void> {
  return serial(async () => {
    const list = await storedList()
    const changes: Change[] = []
    if (list.includes(entryOf(kind, id))) changes.push(prefsChange(list.filter((e) => e !== entryOf(kind, id))))
    if (kind === 'view') {
      const view = await db.views.get(id)
      if (view && !view.deleted_at && view.pinned !== false) changes.push({ entity: 'view', entityId: id, patch: { pinned: false } })
    }
    if (changes.length) await mutateMany(changes)
  })
}

/** Pins or unpins, whichever the item is not. */
export async function setFavourite(kind: FavouriteKind, id: string, on: boolean): Promise<void> {
  await (on ? pin(kind, id) : unpin(kind, id))
}

async function liveSources(): Promise<FavouriteSources> {
  const [projects, labels, views] = await Promise.all([db.projects.toArray(), db.labels.toArray(), db.views.toArray()])
  return { projects, labels, views }
}

/**
 * Moves a favourite one step up (-1) or down (+1) in the group as shown. The new
 * order is written into the slots the shown entries had, so entries this device
 * cannot resolve (an unknown kind, an archived project) keep their place; a pinned
 * filter the list did not name is written into it at its new position.
 */
export function moveFavourite(kind: FavouriteKind, id: string, dir: -1 | 1): Promise<void> {
  return serial(async () => {
    const prefs = await db.userPrefs.get(USER_PREFS_ID)
    const shown = favouritesOf(prefs, await liveSources()).map((f) => entryOf(f.kind, f.id))
    const i = shown.indexOf(entryOf(kind, id))
    const j = i + dir
    if (i < 0 || j < 0 || j >= shown.length) return
    const moved = [...shown]
    ;[moved[i], moved[j]] = [moved[j], moved[i]]
    const visible = new Set(shown)
    const list = parseFavourites(prefs?.favourites)
    let k = 0
    const next = list.map((e) => (visible.has(e) ? moved[k++] : e))
    while (k < moved.length) next.push(moved[k++])
    await mutateMany([prefsChange(next)])
  })
}

/** Where a favourite sits in the group: whether Move up and Move down can apply. */
export function favouriteEdges(list: readonly Favourite[], kind: FavouriteKind, id: string): { first: boolean; last: boolean } {
  const i = list.findIndex((f) => f.kind === kind && f.id === id)
  return { first: i <= 0, last: i < 0 || i === list.length - 1 }
}
