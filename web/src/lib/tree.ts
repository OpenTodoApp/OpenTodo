// Generic tree helpers for entities that encode their hierarchy as a `parent_id`
// pointer in a last-writer-wins field store (tasks today, projects with
// `project-hierarchy`). The tree is derived, never written: a parent that is not
// part of the input set makes its children roots, and a cycle produced by
// concurrent moves is broken identically on every device by treating the member
// whose `parent_id` has the newest clock as a root. No repair op is ever issued.

export interface ClockStamp {
  ts: number
  device: string
}

export interface TreeOptions<T> {
  /** Entity id; defaults to `item.id`. */
  id: (item: T) => string
  /** Raw parent pointer; defaults to `item.parent_id`. */
  parentId: (item: T) => string | null | undefined
  /** LWW clock of the parent pointer; defaults to `item._clock?.parent_id`. */
  clockOf: (item: T) => ClockStamp | undefined
  /** Sibling order; defaults to `position`, then `created_at`, then id. */
  compare: (a: T, b: T) => number
}

export interface TreeNode<T> {
  item: T
  id: string
  /** Effective parent after orphan and cycle handling; null for a root. */
  parent: string | null
  depth: number
  children: TreeNode<T>[]
}

type Rec = { id: string; parent_id?: string | null; position?: number; created_at?: number; _clock?: Record<string, ClockStamp> }

function defaults<T>(opts?: Partial<TreeOptions<T>>): TreeOptions<T> {
  return {
    id: opts?.id ?? ((t) => (t as unknown as Rec).id),
    parentId: opts?.parentId ?? ((t) => (t as unknown as Rec).parent_id ?? null),
    clockOf: opts?.clockOf ?? ((t) => (t as unknown as Rec)._clock?.parent_id),
    compare: opts?.compare ?? ((a, b) => {
      const ra = a as unknown as Rec
      const rb = b as unknown as Rec
      return (ra.position ?? 0) - (rb.position ?? 0) || (ra.created_at ?? 0) - (rb.created_at ?? 0) || (ra.id < rb.id ? -1 : ra.id > rb.id ? 1 : 0)
    }),
  }
}

function newer(a: ClockStamp | undefined, b: ClockStamp | undefined): boolean {
  const at = a?.ts ?? 0
  const bt = b?.ts ?? 0
  if (at !== bt) return at > bt
  return (a?.device ?? '') > (b?.device ?? '')
}

/**
 * Resolve every item's effective parent: the raw parent when it is in the set,
 * otherwise null; then break each cycle at the member with the newest parent clock.
 */
export function effectiveParents<T>(items: T[], opts?: Partial<TreeOptions<T>>): Map<string, string | null> {
  const o = defaults(opts)
  const byId = new Map<string, T>()
  for (const it of items) byId.set(o.id(it), it)
  const parent = new Map<string, string | null>()
  for (const it of items) {
    const id = o.id(it)
    const p = o.parentId(it) ?? null
    parent.set(id, p !== null && p !== id && byId.has(p) ? p : null)
  }
  // 0 = unvisited, 1 = on the current path, 2 = settled.
  const state = new Map<string, number>()
  for (const it of items) {
    const start = o.id(it)
    if (state.get(start)) continue
    const path: string[] = []
    let cur: string | null = start
    while (cur !== null && !state.get(cur)) {
      state.set(cur, 1)
      path.push(cur)
      cur = parent.get(cur) ?? null
    }
    if (cur !== null && state.get(cur) === 1) {
      // path[k..] is the cycle; pick the member with the newest parent_id clock.
      const cycle = path.slice(path.indexOf(cur))
      let root = cycle[0]
      for (const id of cycle.slice(1)) {
        const a = o.clockOf(byId.get(id) as T)
        const b = o.clockOf(byId.get(root) as T)
        if (newer(a, b) || (!newer(b, a) && id > root)) root = id
      }
      parent.set(root, null)
    }
    for (const id of path) state.set(id, 2)
  }
  return parent
}

export interface Tree<T> {
  roots: TreeNode<T>[]
  nodes: Map<string, TreeNode<T>>
}

/** Build the forest. Children are ordered with `compare`; depth starts at 0. */
export function buildTree<T>(items: T[], opts?: Partial<TreeOptions<T>>): Tree<T> {
  const o = defaults(opts)
  const parents = effectiveParents(items, opts)
  const nodes = new Map<string, TreeNode<T>>()
  for (const it of items) {
    const id = o.id(it)
    nodes.set(id, { item: it, id, parent: parents.get(id) ?? null, depth: 0, children: [] })
  }
  const roots: TreeNode<T>[] = []
  for (const n of nodes.values()) {
    if (n.parent === null) roots.push(n)
    else nodes.get(n.parent)!.children.push(n)
  }
  const sortNodes = (list: TreeNode<T>[], depth: number) => {
    list.sort((a, b) => o.compare(a.item, b.item))
    for (const n of list) {
      n.depth = depth
      sortNodes(n.children, depth + 1)
    }
  }
  sortNodes(roots, 0)
  return { roots, nodes }
}

/** Depth-first order, skipping the children of collapsed nodes. One pass, linear. */
export function flattenTree<T>(roots: TreeNode<T>[], isCollapsed?: (id: string) => boolean): TreeNode<T>[] {
  const out: TreeNode<T>[] = []
  const visit = (n: TreeNode<T>) => {
    out.push(n)
    if (isCollapsed?.(n.id)) return
    for (const c of n.children) visit(c)
  }
  for (const r of roots) visit(r)
  return out
}

/** Ids of every descendant of `id` following raw parent pointers (cycle-safe). */
export function descendants<T>(id: string, items: T[], opts?: Partial<TreeOptions<T>>): Set<string> {
  const o = defaults(opts)
  const children = new Map<string, string[]>()
  for (const it of items) {
    const p = o.parentId(it) ?? null
    if (p === null) continue
    const list = children.get(p)
    if (list) list.push(o.id(it))
    else children.set(p, [o.id(it)])
  }
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    for (const c of children.get(stack.pop()!) ?? []) {
      if (c === id || out.has(c)) continue
      out.add(c)
      stack.push(c)
    }
  }
  return out
}

/** True when `candidate` is `ancestor` itself or sits somewhere below it. */
export function isDescendant<T>(candidate: string, ancestor: string, items: T[], opts?: Partial<TreeOptions<T>>): boolean {
  if (candidate === ancestor) return true
  const o = defaults(opts)
  const byId = new Map<string, T>()
  for (const it of items) byId.set(o.id(it), it)
  const seen = new Set<string>()
  let cur: string | null = candidate
  while (cur !== null && !seen.has(cur)) {
    if (cur === ancestor) return true
    seen.add(cur)
    const it = byId.get(cur)
    cur = it ? (o.parentId(it) ?? null) : null
  }
  return false
}

/** Ancestors from the nearest parent outwards, following raw pointers (cycle-safe). */
export function ancestors<T>(id: string, byId: Map<string, T>, opts?: Partial<TreeOptions<T>>): T[] {
  const o = defaults(opts)
  const out: T[] = []
  const seen = new Set<string>([id])
  let cur = byId.get(id)
  while (cur) {
    const p = o.parentId(cur) ?? null
    if (p === null || seen.has(p)) break
    seen.add(p)
    const parent = byId.get(p)
    if (!parent) break
    out.push(parent)
    cur = parent
  }
  return out
}
