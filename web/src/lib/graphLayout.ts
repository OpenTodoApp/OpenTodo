// The Connections graph (OpenSpec change notes-graph, design D1, D2, D4): the
// two-ring neighbourhood of one item, read from the link index, and its radial
// layout. Pure and deterministic: positions depend only on the items, their order
// and the size of the box, so the same item draws the same picture every time.
// Loaded with the Connections dialog only, never in the first load.

export type GraphKind = 'note' | 'task' | 'project'

/** One item as the graph shows it. */
export interface GraphItem {
  /** `<kind>:<id>`, as the link index keys items. */
  key: string
  kind: GraphKind
  id: string
  title: string
  /** When it last changed (Unix ms): the caps keep the most recent. */
  updated: number
  /** A completed task or an archived project. */
  done?: boolean
}

/** The readable items linked with an item, in either direction. */
export type NeighboursOf = (key: string) => readonly GraphItem[]

export const RING1_CAP = 24
export const RING2_CAP = 48
/** Labels are cut to this many characters; the full title is the node's name. */
export const LABEL_MAX = 24

export interface Neighbourhood {
  centre: GraphItem
  /** Every item linked with the centre (at most RING1_CAP), in ring order. */
  ring1: GraphItem[]
  /** The items those link with that are not already shown (at most RING2_CAP), in ring order. */
  ring2: GraphItem[]
  /** A ring-2 key → the first ring-1 key (in ring order) that reaches it. */
  parent: ReadonlyMap<string, string>
  /** How many were left out of each ring by its cap. */
  more1: number
  more2: number
  /** One per linked pair shown, `[a, b]` with a < b, sorted. */
  edges: [string, string][]
}

const KIND_ORDER: Record<GraphKind, number> = { note: 0, task: 1, project: 2 }
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const byKey = (a: GraphItem, b: GraphItem) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
const recentFirst = (a: GraphItem, b: GraphItem) => b.updated - a.updated || byKey(a, b)
/** Ring order: notes, tasks, projects, each by title. */
export const ringOrder = (a: GraphItem, b: GraphItem) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || collator.compare(a.title, b.title) || byKey(a, b)

/** The neighbourhood of `centre`, two steps deep (D1). */
export function neighbourhood(centre: GraphItem, neighboursOf: NeighboursOf): Neighbourhood {
  const memo = new Map<string, readonly GraphItem[]>()
  const around = (key: string) => {
    let list = memo.get(key)
    if (!list) {
      const seen = new Set<string>([key])
      list = neighboursOf(key).filter((i) => !seen.has(i.key) && !!seen.add(i.key))
      memo.set(key, list)
    }
    return list
  }
  const direct = around(centre.key)
  const ring1 = [...direct].sort(recentFirst).slice(0, RING1_CAP).sort(ringOrder)
  // A direct link left out by the cap is still not a second step.
  const near = new Set([centre.key, ...direct.map((i) => i.key)])
  const reached = new Map<string, { item: GraphItem; parent: number }>()
  ring1.forEach((p, at) => {
    for (const i of around(p.key)) if (!near.has(i.key) && !reached.has(i.key)) reached.set(i.key, { item: i, parent: at })
  })
  const kept = [...reached.values()].sort((a, b) => recentFirst(a.item, b.item)).slice(0, RING2_CAP)
  kept.sort((a, b) => a.parent - b.parent || ringOrder(a.item, b.item))
  const ring2 = kept.map((r) => r.item)
  const parent = new Map(kept.map((r) => [r.item.key, ring1[r.parent].key]))
  const shown = new Set([centre.key, ...ring1.map((i) => i.key), ...ring2.map((i) => i.key)])
  const pairs = new Map<string, [string, string]>()
  for (const key of shown) {
    for (const i of around(key)) {
      if (!shown.has(i.key)) continue
      const pair: [string, string] = key < i.key ? [key, i.key] : [i.key, key]
      pairs.set(pair.join('\n'), pair)
    }
  }
  const edges = [...pairs.keys()].sort().map((k) => pairs.get(k)!)
  return { centre, ring1, ring2, parent, more1: direct.length - ring1.length, more2: reached.size - ring2.length, edges }
}

// ---- the layout ----

export interface Box {
  width: number
  height: number
}

export interface PlacedNode {
  item: GraphItem
  ring: 0 | 1 | 2
  /** The node's centre and size, in px from the box's top left. */
  x: number
  y: number
  w: number
  h: number
  /** The visible label ('' for a compact node). */
  label: string
  truncated: boolean
  /** An icon-only node; its title shows on focus or hover. */
  compact: boolean
  /** A ring-2 node's ring-1 node. */
  parent?: string
}

/** The "+n" marker of a ring over its cap. */
export interface PlacedMarker {
  ring: 1 | 2
  count: number
  x: number
  y: number
  w: number
  h: number
}

export interface GraphLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  markers: PlacedMarker[]
  edges: [string, string][]
  /** No two nodes overlap; false when even the most compact picture does not fit (the List is offered first). */
  fits: boolean
}

export const NODE_H = 28
export const CENTRE_H = 32
export const COMPACT = 28
/** On a screen narrower than this the outer ring shows icons only, its titles on focus (D2). */
export const NARROW = 640
// Estimated widths of the labels (the renderer caps each pill at its width, so text never runs past it).
const CHAR_W = 6.8
const CENTRE_CHAR_W = 7.6
const PILL_PAD = 46
const CENTRE_PAD = 52
const MARKER_W = 40
const MARGIN = 8
const GAP = 6

/** The first `n` characters of a title, with an ellipsis when cut. */
export function cut(title: string, n: number): string {
  const chars = [...title]
  return chars.length <= n ? title : `${chars.slice(0, n - 1).join('').trimEnd()}…`
}

const pillWidth = (label: string) => Math.ceil(PILL_PAD + CHAR_W * [...label].length)

// From the most readable picture to the most compact: ring-1 and ring-2 label lengths (0: icons only).
const LEVELS: readonly (readonly [number, number])[] = [[24, 24], [24, 16], [24, 12], [20, 12], [24, 0], [20, 0], [16, 0], [12, 0], [10, 0], [0, 0]]
// The inner ring's size against the outer one, tried in turn at each level.
const RATIOS = [0.5, 0.62, 0.74]

/**
 * The radial layout of a neighbourhood in a box (D2): the most readable level where
 * nothing overlaps. `narrow`: a phone's screen, where the outer ring shows icons only.
 */
export function layout(n: Neighbourhood, box: Box, narrow = false): GraphLayout {
  const levels = LEVELS.filter(([, l2]) => !(narrow && l2 > 0) || n.ring2.length === 0)
  let last: GraphLayout | null = null
  for (const [l1, l2] of levels) {
    for (const ratio of n.ring2.length || n.more2 ? RATIOS : [1]) {
      for (const aligned of [true, false]) {
        last = place(n, box, l1, l2, ratio, aligned)
        if (last.fits) return last
      }
    }
  }
  return last!
}

function place(n: Neighbourhood, box: Box, l1: number, l2: number, ratio: number, aligned: boolean): GraphLayout {
  const { width, height } = box
  const cx = width / 2
  const cy = height / 2
  const ax = width / 2 - MARGIN
  const ay = height / 2 - MARGIN
  const centreLabel = cut(n.centre.title, LABEL_MAX)
  const nodes: PlacedNode[] = [{
    item: n.centre, ring: 0, x: cx, y: cy, h: CENTRE_H, label: centreLabel, truncated: centreLabel !== n.centre.title, compact: false,
    w: Math.min(Math.ceil(CENTRE_PAD + CENTRE_CHAR_W * [...centreLabel].length), width - 2 * MARGIN),
  }]
  const markers: PlacedMarker[] = []
  const sized = (item: GraphItem, ring: 1 | 2, chars: number): PlacedNode => {
    if (chars === 0) return { item, ring, x: 0, y: 0, w: COMPACT, h: COMPACT, label: '', truncated: true, compact: true }
    const label = cut(item.title, chars)
    return { item, ring, x: 0, y: 0, w: pillWidth(label), h: NODE_H, label, truncated: label !== item.title, compact: false }
  }
  const r1 = n.ring1.map((i) => sized(i, 1, l1))
  const r2 = n.ring2.map((i) => ({ ...sized(i, 2, l2), parent: n.parent.get(i.key) }))
  const slots1 = r1.length + (n.more1 > 0 ? 1 : 0)
  const slots2 = r2.length + (n.more2 > 0 ? 1 : 0)
  const half = (list: PlacedNode[], marker: boolean) => Math.max(marker ? MARKER_W / 2 : 0, ...list.map((p) => p.w / 2))
  const tall = (list: PlacedNode[]) => Math.max(NODE_H, ...list.map((p) => p.h)) / 2
  let rx1: number, ry1: number
  let rx2 = 0, ry2 = 0
  if (slots2 > 0) {
    rx2 = Math.max(0, ax - half(r2, n.more2 > 0))
    ry2 = Math.max(0, ay - tall(r2))
    rx1 = rx2 * ratio
    ry1 = ry2 * ratio
  } else {
    rx1 = Math.max(0, ax - half(r1, n.more1 > 0))
    ry1 = Math.max(0, ay - tall(r1))
  }
  // Ring 1 evenly spaced from the top, clockwise; the marker takes the last slot.
  const angle1 = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / slots1
  r1.forEach((p, i) => { p.x = cx + rx1 * Math.cos(angle1(i)); p.y = cy + ry1 * Math.sin(angle1(i)) })
  if (n.more1 > 0) markers.push({ ring: 1, count: n.more1, x: cx + rx1 * Math.cos(angle1(r1.length)), y: cy + ry1 * Math.sin(angle1(r1.length)), w: MARKER_W, h: NODE_H })
  // Ring 2, aligned: each node within its parent's share of the circle, centred on the
  // parent (one child sits straight behind it); the marker in the gap before the top.
  if (slots2 > 0 && aligned) {
    const sector = (2 * Math.PI) / slots1
    const groups = new Map<string, number[]>()
    n.ring2.forEach((i, at) => {
      const k = n.parent.get(i.key) ?? ''
      groups.set(k, [...(groups.get(k) ?? []), at])
    })
    n.ring1.forEach((parent, pi) => {
      const kids = groups.get(parent.key) ?? []
      kids.forEach((at, j) => {
        const a = angle1(pi) + ((j + 0.5) / kids.length - 0.5) * sector * 0.9
        r2[at].x = cx + rx2 * Math.cos(a)
        r2[at].y = cy + ry2 * Math.sin(a)
      })
    })
    const gap = angle1(slots1 - 0.5)
    if (n.more2 > 0) markers.push({ ring: 2, count: n.more2, x: cx + rx2 * Math.cos(gap), y: cy + ry2 * Math.sin(gap), w: MARKER_W, h: NODE_H })
  }
  // Ring 2, by count: one slot per node, grouped by parent, so each parent's sector is
  // sized by its children; the first parent's group is centred on its angle.
  if (slots2 > 0 && !aligned) {
    const step = (2 * Math.PI) / slots2
    const first = n.ring2.length ? n.parent.get(n.ring2[0].key) : undefined
    const firstCount = n.ring2.filter((i) => n.parent.get(i.key) === first).length
    const firstAt = Math.max(0, n.ring1.findIndex((i) => i.key === first))
    const start = angle1(firstAt) - ((firstCount - 1) / 2) * step
    const angle2 = (i: number) => start + i * step
    r2.forEach((p, i) => { p.x = cx + rx2 * Math.cos(angle2(i)); p.y = cy + ry2 * Math.sin(angle2(i)) })
    if (n.more2 > 0) markers.push({ ring: 2, count: n.more2, x: cx + rx2 * Math.cos(angle2(r2.length)), y: cy + ry2 * Math.sin(angle2(r2.length)), w: MARKER_W, h: NODE_H })
  }
  nodes.push(...r1, ...r2)
  for (const p of nodes) { p.x = round(p.x); p.y = round(p.y) }
  for (const m of markers) { m.x = round(m.x); m.y = round(m.y) }
  return { width, height, nodes, markers, edges: n.edges, fits: !overlaps([...nodes, ...markers], box) }
}

const round = (v: number) => Math.round(v * 10) / 10

type Rect = { x: number; y: number; w: number; h: number }

/** Whether any two rectangles (centre and size) come closer than GAP, or one leaves the box. */
export function overlaps(rects: readonly Rect[], box?: Box): boolean {
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]
    if (box && (a.x - a.w / 2 < -0.5 || a.y - a.h / 2 < -0.5 || a.x + a.w / 2 > box.width + 0.5 || a.y + a.h / 2 > box.height + 0.5)) return true
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP) return true
    }
  }
  return false
}

// ---- moving between nodes (D4) ----

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * The node an arrow key moves to: Left and Right around a ring (the centre's go to
 * the inner ring's last and first), Up toward the centre, Down outward (to a node's
 * first child, else the nearest outer node by angle); null when there is none.
 */
export function stepFrom(l: GraphLayout, key: string, dir: Direction): string | null {
  const at = l.nodes.find((p) => p.item.key === key)
  if (!at) return null
  const ring = (r: number) => l.nodes.filter((p) => p.ring === r)
  const centre = l.nodes[0]
  if (at.ring === 0) {
    const r1 = ring(1)
    if (!r1.length || dir === 'up') return null
    return (dir === 'left' ? r1[r1.length - 1] : r1[0]).item.key
  }
  if (dir === 'left' || dir === 'right') {
    const list = ring(at.ring)
    const i = list.indexOf(at)
    return list[(i + (dir === 'right' ? 1 : -1) + list.length) % list.length].item.key
  }
  if (dir === 'up') return at.ring === 2 ? at.parent ?? centre.item.key : centre.item.key
  if (at.ring === 2) return null
  const outer = ring(2)
  const child = outer.find((p) => p.parent === at.item.key)
  if (child) return child.item.key
  if (!outer.length) return null
  const theta = (p: PlacedNode) => Math.atan2(p.y - centre.y, p.x - centre.x)
  const dist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  return outer.reduce((best, p) => (dist(theta(p), theta(at)) < dist(theta(best), theta(at)) ? p : best)).item.key
}
