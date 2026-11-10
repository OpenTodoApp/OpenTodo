// The graph of a workspace's notes (OpenSpec change notes-graph-page, design D2,
// D4, D5, D6): the nodes (the notes the Notes list shows, and the tasks and projects
// they link to that have no note), one line per linked pair from the device's link
// index, what is drawn and lit, the arrow keys' step, and the positions kept on the
// device. Pure apart from the positions' storage. Loaded with the graph page only.
import { readString, writeString } from './deviceStorage'
import { FULL_STEPS, ForceLayout, hash32, LOCAL_STEPS, placeNew } from './forceLayout'
import type { NoteEntry } from './noteList'
import type { GraphShow } from './notesGraphPrefs'

export type GraphKind = 'note' | 'task' | 'project'

export interface GraphNode {
  /** `<kind>:<id>`, as the link index and the Notes list key items. */
  key: string
  kind: GraphKind
  id: string
  title: string
  projectId: string | null
  labels: readonly string[]
  /** Listed on the Notes page (has a note); false for a secondary node. */
  listed: boolean
  /** A completed task or an archived project. */
  done: boolean
}

/** What the graph needs to know of an item that is not listed, or null when the device cannot read it. */
export type Resolve = (kind: GraphKind, id: string) => { title: string; projectId: string | null; labels?: readonly string[]; done: boolean } | null

export interface NotesGraph {
  nodes: GraphNode[]
  at: ReadonlyMap<string, number>
  /** Linked pairs as node indices [a0, b0, a1, b1, …], each pair once, a < b. */
  edges: Uint32Array
  /** The neighbours of each node, ascending. */
  adj: number[][]
  /** 1: some other shown item links to the node (the Unlinked filter's "nothing links here"). */
  linkedTo: Uint8Array
}

const kindOf = (key: string): GraphKind => key.slice(0, key.indexOf(':')) as GraphKind

/**
 * The graph (D2): every entry a node, every readable link target that is not an entry
 * a secondary node, one edge per linked pair whose source is an entry. Nodes are in
 * key order, so the same notes give the same graph.
 */
export function buildGraph(entries: readonly NoteEntry[], forEachLink: (fn: (source: string, target: string) => void) => void, resolve: Resolve): NotesGraph {
  const byKey = new Map<string, GraphNode>()
  for (const e of entries) {
    byKey.set(e.key, { key: e.key, kind: e.source, id: e.id, title: e.title, projectId: e.projectId, labels: e.labels, listed: true, done: !!e.marker })
  }
  const pairs: [string, string][] = []
  const missing = new Set<string>()
  forEachLink((source, target) => {
    if (!byKey.has(source) || source === target) return
    if (!byKey.has(target)) {
      if (missing.has(target)) return
      const kind = kindOf(target)
      const id = target.slice(kind.length + 1)
      const r = resolve(kind, id)
      if (!r) { missing.add(target); return }
      byKey.set(target, { key: target, kind, id, title: r.title, projectId: r.projectId, labels: r.labels ?? [], listed: false, done: r.done })
    }
    pairs.push([source, target])
  })
  const nodes = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const at = new Map(nodes.map((n, i) => [n.key, i]))
  const seen = new Set<number>()
  const list: number[] = []
  const linkedTo = new Uint8Array(nodes.length)
  for (const [s, t] of pairs) {
    const a = at.get(s)!
    const b = at.get(t)!
    linkedTo[b] = 1
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const id = lo * nodes.length + hi
    if (seen.has(id)) continue
    seen.add(id)
    list.push(lo, hi)
  }
  // Sorted pairs: the edges' order (and so the layout) does not depend on the index's.
  const order = [...Array(list.length / 2).keys()].sort((p, q) => list[p * 2] - list[q * 2] || list[p * 2 + 1] - list[q * 2 + 1])
  const edges = new Uint32Array(list.length)
  order.forEach((p, i) => { edges[i * 2] = list[p * 2]; edges[i * 2 + 1] = list[p * 2 + 1] })
  const adj: number[][] = nodes.map(() => [])
  for (let e = 0; e < edges.length; e += 2) { adj[edges[e]].push(edges[e + 1]); adj[edges[e + 1]].push(edges[e]) }
  for (const a of adj) a.sort((p, q) => p - q)
  return { nodes, at, edges, adj, linkedTo }
}

/** Which nodes are drawn (D2): hiding never moves anything, it only leaves nodes out. */
export function visibleMask(g: NotesGraph, show: GraphShow): Uint8Array {
  const out = new Uint8Array(g.nodes.length)
  g.nodes.forEach((n, i) => {
    if (!n.listed) out[i] = show.secondary ? 1 : 0
    else if (!show.orphans) out[i] = g.adj[i].some((j) => g.nodes[j].listed || show.secondary) ? 1 : 0
    else out[i] = 1
  })
  return out
}

/**
 * Whether the topic holds a node (D5). The topic is the notes the Notes list keeps
 * under the search field's chips (`in:`, `label:`, `kind:`…, notes-space); a secondary
 * node (a task or project without a note) is in it when a note in it links with it.
 */
export function inTopic(g: NotesGraph, i: number, topic: ReadonlySet<string>): boolean {
  const n = g.nodes[i]
  return n.listed ? topic.has(n.key) : g.adj[i].some((j) => g.nodes[j].listed && topic.has(g.nodes[j].key))
}

/** The nodes within `depth` links of `centre` among the visible ones (D4). */
export function around(g: NotesGraph, centre: number, depth: number, visible: Uint8Array): Uint8Array {
  const out = new Uint8Array(g.nodes.length)
  out[centre] = 1
  let ring = [centre]
  for (let d = 0; d < depth && ring.length; d++) {
    const next: number[] = []
    for (const i of ring) for (const j of g.adj[i]) if (visible[j] && !out[j]) { out[j] = 1; next.push(j) }
    ring = next
  }
  return out
}

/**
 * What stays lit (D4, D5): the topic, the search's matches and the centre's depth,
 * each narrowing the others; null when nothing narrows (everything lit).
 */
export function litMask(g: NotesGraph, opts: { topic: ReadonlySet<string> | null; matches: ReadonlySet<string> | null; centre: number | null; depth: number; visible: Uint8Array }): Uint8Array | null {
  const { topic, matches, centre, depth, visible } = opts
  if (!topic && !matches && centre === null) return null
  const near = centre !== null ? around(g, centre, depth, visible) : null
  const out = new Uint8Array(g.nodes.length)
  for (let i = 0; i < g.nodes.length; i++) {
    out[i] = (!topic || inTopic(g, i, topic)) && (!matches || matches.has(g.nodes[i].key)) && (!near || near[i]) ? 1 : 0
  }
  return out
}

export type Direction = 'left' | 'right' | 'up' | 'down'
const ANGLE: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }

/**
 * The node an arrow key moves to (D8): the linked node nearest that direction (within
 * 60° of it), else the nearest drawn node within 45°; null when there is none.
 */
export function stepToward(g: NotesGraph, x: Float64Array, y: Float64Array, visible: Uint8Array, from: number, dir: Direction): number | null {
  const want = ANGLE[dir]
  const off = (j: number) => {
    const a = Math.atan2(y[j] - y[from], x[j] - x[from])
    return Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)))
  }
  const dist = (j: number) => Math.hypot(x[j] - x[from], y[j] - y[from])
  // Closer to the direction first, then nearer: an angle counts as much as its share of the distance.
  const score = (j: number) => dist(j) * (1 + 2 * off(j))
  const best = (cands: Iterable<number>, cone: number) => {
    let pick: number | null = null
    let s = Infinity
    for (const j of cands) {
      if (j === from || !visible[j] || off(j) > cone) continue
      const v = score(j)
      if (v < s) { s = v; pick = j }
    }
    return pick
  }
  return best(g.adj[from], Math.PI / 3) ?? best(g.nodes.keys(), Math.PI / 4)
}

// ---- the positions, kept on the device (D6) ----

export const POSITIONS_KEY = 'opentodo.notes.graph.positions'
/** At most this many positions are kept (the current graph's first, then older ones). */
const POSITIONS_MAX = 6_000
/** A stored picture is reused when it holds at least this share of the linked nodes. */
export const REUSE_SHARE = 0.7

/** A node's place; `orphan` when it was placed on the rim for having no link (it joins the layout once it has one). */
export interface Place { x: number; y: number; orphan: boolean }
export type Positions = Map<string, Place>

export function readPositions(): Positions {
  try {
    const v = JSON.parse(readString(POSITIONS_KEY) ?? 'null') as { v?: number; p?: Record<string, unknown> } | null
    if (!v || v.v !== 2 || !v.p || typeof v.p !== 'object') return new Map()
    const out: Positions = new Map()
    for (const [k, xy] of Object.entries(v.p)) {
      if (Array.isArray(xy) && Number.isFinite(xy[0]) && Number.isFinite(xy[1])) out.set(k, { x: xy[0] as number, y: xy[1] as number, orphan: xy[2] === 1 })
    }
    return out
  } catch {
    return new Map()
  }
}

/** Stores the graph's positions (whole numbers), keeping older ones for nodes not drawn now. */
export function writePositions(g: NotesGraph, placed: Placed, before: Positions): void {
  const p: Record<string, number[]> = {}
  let n = 0
  g.nodes.forEach((node, i) => {
    p[node.key] = placed.orphan[i] ? [Math.round(placed.x[i]), Math.round(placed.y[i]), 1] : [Math.round(placed.x[i]), Math.round(placed.y[i])]
    n++
  })
  for (const [k, at] of before) {
    if (n >= POSITIONS_MAX) break
    if (!(k in p)) { p[k] = at.orphan ? [at.x, at.y, 1] : [at.x, at.y]; n++ }
  }
  writeString(POSITIONS_KEY, JSON.stringify({ v: 2, p })) // storage refused: the next visit lays out again, the same way
}

/** Every node's place: the layout's for linked nodes, the rim's for the rest. */
export interface Placed {
  x: Float64Array
  y: Float64Array
  orphan: Uint8Array
}

/** The positions of a placed graph, as a store holds them (a graph shown while a sync lands carries them over). */
export function positionsOf(g: NotesGraph, placed: Placed): Positions {
  const out: Positions = new Map()
  g.nodes.forEach((node, i) => out.set(node.key, { x: placed.x[i], y: placed.y[i], orphan: !!placed.orphan[i] }))
  return out
}

/**
 * The layout of a graph (D6, D7). Only linked nodes take part in the force layout:
 * from the stored positions when they hold most of them (only the new ones move,
 * LOCAL_STEPS steps), else a full layout from the deterministic start. Nodes without
 * a link sit on a band around the picture at an angle and distance from their key's
 * hash (or where they were stored), so they never move one another. Step `layout`,
 * then read `placed()`.
 */
export class GraphLayout {
  readonly layout: ForceLayout
  readonly local: boolean
  private readonly members: number[]

  constructor(private readonly g: NotesGraph, private readonly stored: Positions) {
    this.members = g.nodes.flatMap((_, i) => (g.adj[i].length ? [i] : []))
    const sub = new Map(this.members.map((i, j) => [i, j]))
    const edges = new Uint32Array(g.edges.length)
    for (let e = 0; e < g.edges.length; e++) edges[e] = sub.get(g.edges[e])!
    const graph = { n: this.members.length, edges }
    const known = this.members.filter((i) => { const at = stored.get(g.nodes[i].key); return at && !at.orphan }).length
    this.local = graph.n > 0 && known >= graph.n * REUSE_SHARE
    if (!this.local) {
      this.layout = new ForceLayout(graph, { steps: FULL_STEPS })
      return
    }
    const x = new Float64Array(graph.n)
    const y = new Float64Array(graph.n)
    const fixed = new Uint8Array(graph.n)
    this.members.forEach((i, j) => {
      const at = stored.get(g.nodes[i].key)
      if (at && !at.orphan) { x[j] = at.x; y[j] = at.y; fixed[j] = 1 }
    })
    placeNew(graph, x, y, fixed, (j) => hash32(g.nodes[this.members[j]].key))
    this.layout = new ForceLayout(graph, { steps: LOCAL_STEPS, start: { x, y, fixed }, alpha: 0.3 })
  }

  /** Every node's place, once the layout has finished. */
  placed(): Placed {
    const { g, layout, members } = this
    const n = g.nodes.length
    const x = new Float64Array(n)
    const y = new Float64Array(n)
    const orphan = new Uint8Array(n)
    let rim = 0
    members.forEach((i, j) => {
      x[i] = layout.x[j]
      y[i] = layout.y[j]
      rim = Math.max(rim, Math.hypot(x[i], y[i]))
    })
    rim = Math.max(rim, 60) + 40
    for (let i = 0; i < n; i++) {
      if (g.adj[i].length) continue
      orphan[i] = 1
      const at = this.stored.get(g.nodes[i].key)
      if (at?.orphan) { x[i] = at.x; y[i] = at.y; continue }
      const h = hash32(g.nodes[i].key)
      const a = (h / 4294967296) * 2 * Math.PI
      const r = rim * (1 + 0.35 * Math.sqrt(hash32(`${g.nodes[i].key}/r`) / 4294967296))
      x[i] = Math.cos(a) * r
      y[i] = Math.sin(a) * r
    }
    return { x, y, orphan }
  }
}

/** Whether two graphs draw the same picture (a sync that changed nothing shown keeps the graph it has). */
export function sameGraph(a: NotesGraph, b: NotesGraph): boolean {
  if (a === b) return true
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false
  for (let i = 0; i < a.edges.length; i++) if (a.edges[i] !== b.edges[i]) return false
  for (let i = 0; i < a.nodes.length; i++) {
    const x = a.nodes[i]
    const y = b.nodes[i]
    if (x.key !== y.key || x.title !== y.title || x.projectId !== y.projectId || x.listed !== y.listed || x.done !== y.done
      || x.labels.length !== y.labels.length || x.labels.some((l, j) => l !== y.labels[j])) return false
  }
  return true
}

/** The bounding box of the given nodes, or null when there are none. */
export function boundsOf(x: Float64Array, y: Float64Array, which: (i: number) => boolean): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < x.length; i++) {
    if (!which(i)) continue
    if (x[i] < x0) x0 = x[i]
    if (x[i] > x1) x1 = x[i]
    if (y[i] < y0) y0 = y[i]
    if (y[i] > y1) y1 = y[i]
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 }
}
