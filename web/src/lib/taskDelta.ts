// What changed between two task lists, and values derived from task lists that
// follow those changes (OpenSpec change incremental-list-updates, design D1). The
// shared task snapshot patches its lists from the rows a write changed (taskSnapshot)
// and notes here which rows those were; a value derived from a list (an index, the
// open tasks, a count, a view's tasks) is then worked out from the changed rows
// instead of all 10,000. Anything this cannot follow (a list read again, a list
// not noted, a link too far back) is worked out in full, which gives the same value.

import type { Task } from './types'

/** One row of a change: its version before and after (undefined when it was not, or is no longer, in the list). */
export interface TaskChange {
  id: string
  before: Task | undefined
  after: Task | undefined
}

/** How many links back a change is followed before the value is worked out in full. */
export const MAX_LINKS = 8
/** A change of more rows than this is worked out in full. */
export const MAX_CHANGES = 1_000

interface Link { prev: readonly Task[]; changes: readonly TaskChange[] }

// Each noted list links to the list it was made from. A WeakMap: a list nothing holds
// any more goes, and its link with it; the chain a consumer follows is only as long
// as the lists it still holds.
const links = new WeakMap<readonly Task[], Link>()

/** Notes that `next` is `prev` with `changes` applied (each id at most once, `before` from `prev`, `after` in `next`). */
export function noteChanges(prev: readonly Task[], next: readonly Task[], changes: readonly TaskChange[]): void {
  if (prev === next) return
  links.set(next, { prev, changes })
  // A link holds the list before it: cut the chain past what anyone follows, or every
  // list since the snapshot was first read would stay in memory.
  let at: readonly Task[] = prev
  for (let n = 1; n < MAX_LINKS; n++) {
    const link = links.get(at)
    if (!link) return
    at = link.prev
  }
  links.delete(at)
}

/**
 * The changes from `from` to `to` (each id once: its version in `from` and in `to`), or
 * null when `to` was not made from `from` by noted changes within MAX_LINKS links.
 */
export function changesBetween(from: readonly Task[], to: readonly Task[]): TaskChange[] | null {
  if (from === to) return []
  const chain: (readonly TaskChange[])[] = []
  let at: readonly Task[] = to
  while (at !== from) {
    const link = links.get(at)
    if (!link || chain.length >= MAX_LINKS) return null
    chain.push(link.changes)
    at = link.prev
  }
  if (chain.length === 1) return chain[0].length > MAX_CHANGES ? null : [...chain[0]]
  const merged = new Map<string, TaskChange>()
  for (let i = chain.length - 1; i >= 0; i--) {
    for (const c of chain[i]) {
      const was = merged.get(c.id)
      merged.set(c.id, was ? { id: c.id, before: was.before, after: c.after } : c)
    }
  }
  if (merged.size > MAX_CHANGES) return null
  return [...merged.values()].filter((c) => c.before !== c.after)
}

/** Index of `id` in `rows` (sorted by id), or where it would go: [index, found]. */
export function locateById(rows: readonly { id: string }[], id: string): [number, boolean] {
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid].id < id) lo = mid + 1
    else hi = mid
  }
  return [lo, lo < rows.length && rows[lo].id === id]
}

/**
 * A list sorted by id with the changes applied to the rows that pass `keep`: a changed
 * row is replaced, added or removed. Returns the list and the changes it saw (only
 * the rows whose entry differs), or `prev` itself when nothing it holds changed.
 */
export function patchSorted<T extends { id: string } = Task>(prev: readonly T[], changes: readonly { id: string; after: T | undefined }[], keep: (task: T) => boolean): { list: T[]; changes: { id: string; before: T | undefined; after: T | undefined }[] } {
  const seen: { id: string; before: T | undefined; after: T | undefined }[] = []
  let out: T[] | null = null
  for (const c of changes) {
    const list: readonly T[] = out ?? prev
    const [at, found] = locateById(list, c.id)
    const before = found ? list[at] : undefined
    const after = c.after && keep(c.after) ? c.after : undefined
    if (before === after) continue
    out ??= prev.slice()
    if (after && found) out[at] = after
    else if (after) out.splice(at, 0, after)
    else out.splice(at, 1)
    seen.push({ id: c.id, before, after })
  }
  return { list: out ?? (prev as T[]), changes: seen }
}

/**
 * A list in the order `compare` (a total order: it ties only for the same task) with the
 * changes applied to the rows that pass `keep`: the changed rows are taken out and the
 * kept ones put in at their place. Sorting the filtered rows with `compare` gives the same.
 * `prev` itself when nothing it holds changed.
 */
export function patchOrdered(prev: readonly Task[], changes: readonly TaskChange[], keep: (task: Task) => boolean, compare: (a: Task, b: Task) => number): Task[] {
  const last = new Map<string, Task | undefined>()
  for (const c of changes) last.set(c.id, c.after)
  const ids = new Set(last.keys())
  const add = [...last.values()].filter((task): task is Task => !!task && keep(task))
  const out = prev.filter((task) => !ids.has(task.id))
  if (out.length === prev.length && !add.length) return prev as Task[]
  for (const task of add) {
    let lo = 0
    let hi = out.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (compare(out[mid], task) <= 0) lo = mid + 1
      else hi = mid
    }
    out.splice(lo, 0, task)
  }
  if (out.length === prev.length && out.every((task, i) => task === prev[i])) return prev as Task[]
  return out
}

/**
 * A value derived from a task list, kept from one list to the next (design D1): the
 * same list (and the same other inputs) gives the same value; a list noted as made
 * from the last one gives `patch` of the last value and the changes; anything else,
 * or a patch that returns null (a change it does not follow), gives `full`.
 */
export class Derived<V, A extends readonly unknown[] = []> {
  private last: { tasks: readonly Task[]; args: A; value: V } | null = null

  constructor(
    private readonly full: (tasks: readonly Task[], ...args: A) => V,
    private readonly patch?: (prev: V, changes: readonly TaskChange[], tasks: readonly Task[], ...args: A) => V | null,
  ) {}

  get(tasks: readonly Task[], ...args: A): V {
    const last = this.last
    if (last && last.tasks === tasks && sameArgs(last.args, args)) return last.value
    let value: V | null = null
    if (last && this.patch && sameArgs(last.args, args)) {
      const changes = changesBetween(last.tasks, tasks)
      if (changes) value = changes.length ? this.patch(last.value, changes, tasks, ...args) : last.value
    }
    if (value === null) value = this.full(tasks, ...args)
    this.last = { tasks, args, value }
    return value
  }
}

/**
 * A value derived once per task list, shared by every caller (design D1): cached by
 * list, and worked out from the last list's value with the changes between them
 * when the lists are linked (`patch` returning null works it out in full).
 */
export function perList<V>(full: (tasks: readonly Task[]) => V, patch: (prev: V, changes: readonly TaskChange[], tasks: readonly Task[]) => V | null): (tasks: readonly Task[]) => V {
  const cache = new WeakMap<readonly Task[], { v: V }>()
  let last: { tasks: readonly Task[]; value: V } | null = null
  return (tasks) => {
    const hit = cache.get(tasks)
    if (hit) return hit.v
    let value: V | null = null
    if (last) {
      const changes = changesBetween(last.tasks, tasks)
      if (changes) value = changes.length ? patch(last.value, changes, tasks) : last.value
    }
    if (value === null) value = full(tasks)
    cache.set(tasks, { v: value })
    last = { tasks, value }
    return value
  }
}

const sameArgs = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => Object.is(x, b[i]))

// ---- the keys a derived map changed ----

const keyLinks = new WeakMap<object, { prev: object; keys: ReadonlySet<string> }>()

/** Notes that `next` (a map or a view of tasks) answers as `prev` for every key outside `keys`. */
export function noteKeys(prev: object, next: object, keys: ReadonlySet<string>): void {
  if (prev === next) return
  keyLinks.set(next, { prev, keys })
  // As noteChanges: the chain is cut past MAX_LINKS so old maps can go.
  let at: object = prev
  for (let n = 1; n < MAX_LINKS; n++) {
    const link = keyLinks.get(at)
    if (!link) return
    at = link.prev
  }
  keyLinks.delete(at)
}

/**
 * The keys `to` may answer differently from `from` (each link's keys together), or null
 * when `to` was not noted as made from `from` within MAX_LINKS links. The list's rows
 * use it to compare only the rows a write could have changed (design D3).
 */
export function keysBetween(from: object, to: object): ReadonlySet<string> | null {
  if (from === to) return EMPTY_KEYS
  let at = to
  let keys: Set<string> | null = null
  let first: ReadonlySet<string> | null = null
  for (let n = 0; at !== from; n++) {
    const link = keyLinks.get(at)
    if (!link || n >= MAX_LINKS) return null
    if (!first) first = link.keys
    else {
      keys ??= new Set(first)
      for (const k of link.keys) keys.add(k)
    }
    at = link.prev
  }
  return keys ?? first ?? EMPTY_KEYS
}

const EMPTY_KEYS: ReadonlySet<string> = new Set()

const GONE = Symbol('gone')

/**
 * A read-only map by id made from the previous one and a few changes, without copying
 * its 10,000 entries (design D2): `get` and `has` look in the changes, then in the map
 * before; anything else (size, iteration) copies the entries once, on first use. A chain
 * deeper than MAX_LINKS is copied when made, so a lookup stays a few steps.
 */
export class LayeredMap<V> extends Map<string, V> {
  private readonly own: Map<string, V | typeof GONE>
  private base: Map<string, V> | null
  private readonly depth: number
  private filled = false

  constructor(base: Map<string, V> | null = null, own: Map<string, V | typeof GONE> = new Map()) {
    super()
    this.own = own
    this.base = base
    this.depth = base instanceof LayeredMap ? base.depth + 1 : 0
    if (this.depth > MAX_LINKS || !base) this.fill()
  }

  /** `prev` with each change applied (an entry set, or removed when the value is undefined). */
  static patched<V>(prev: Map<string, V>, changes: Iterable<readonly [string, V | undefined]>): LayeredMap<V> {
    const own = new Map<string, V | typeof GONE>()
    for (const [k, v] of changes) own.set(k, v === undefined ? GONE : v)
    return new LayeredMap(prev, own)
  }

  private fill(): void {
    if (this.filled) return
    const layers: LayeredMap<V>[] = []
    let at: Map<string, V> | null = this
    while (at instanceof LayeredMap && !at.filled) { layers.push(at); at = at.base }
    const all = new Map<string, V>(at ?? [])
    for (let i = layers.length - 1; i >= 0; i--) for (const [k, v] of layers[i].own) { if (v === GONE) all.delete(k); else all.set(k, v) }
    for (const [k, v] of all) super.set(k, v)
    this.filled = true
    this.base = null
  }

  override get(key: string): V | undefined {
    if (this.filled) return super.get(key)
    let at: Map<string, V> | null = this
    while (at instanceof LayeredMap && !at.filled) {
      const v = at.own.get(key)
      if (v !== undefined) return v === GONE ? undefined : v
      at = at.base
    }
    return at?.get(key)
  }

  override has(key: string): boolean { return this.get(key) !== undefined }
  override get size(): number { this.fill(); return super.size }
  override forEach(fn: (value: V, key: string, map: Map<string, V>) => void, thisArg?: unknown): void { this.fill(); super.forEach(fn, thisArg) }
  override entries(): ReturnType<Map<string, V>['entries']> { this.fill(); return super.entries() }
  override keys(): ReturnType<Map<string, V>['keys']> { this.fill(); return super.keys() }
  override values(): ReturnType<Map<string, V>['values']> { this.fill(); return super.values() }
  override [Symbol.iterator](): ReturnType<Map<string, V>['entries']> { this.fill(); return super[Symbol.iterator]() }
  // Read-only once made: fill() writes through Map itself.
  override set(): this { throw new Error('LayeredMap is read-only') }
  override delete(): boolean { throw new Error('LayeredMap is read-only') }
  override clear(): void { throw new Error('LayeredMap is read-only') }
}
