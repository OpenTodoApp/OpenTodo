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
export const LABEL_MAX = 22

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

/** One line of the picture: the pair it joins and its ends on the two pills' borders. */
export interface PlacedEdge {
  a: string
  b: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface GraphLayout {
  width: number
  height: number
  nodes: PlacedNode[]
  markers: PlacedMarker[]
  /**
   * The lines drawn: the centre to the inner ring and each outer node to its inner
   * node always, any other linked pair only when its line passes no other node (the
   * List keeps every link).
   */
  edges: PlacedEdge[]
  /** No two nodes overlap and no drawn line passes behind a node; false when no level manages it (the List comes first). */
  fits: boolean
}

export const NODE_H = 28
export const CENTRE_H = 32
export const COMPACT = 28
/** On a screen narrower than this a picture that needs icon-only nodes opens on the List (D2). */
export const NARROW = 640
// Estimated widths of the labels (the renderer caps each pill at its width, so text never runs past it).
const CHAR_W = 6.8
const CENTRE_CHAR_W = 7.6
const PILL_PAD = 46
const CENTRE_PAD = 52
const MARKER_W = 40
/** Room between the outermost pills and the canvas's edges. */
const MARGIN = 20
const GAP = 6

/** The first `n` characters of a title, with an ellipsis when cut. */
export function cut(title: string, n: number): string {
  const chars = [...title]
  return chars.length <= n ? title : `${chars.slice(0, n - 1).join('').trimEnd()}…`
}

const pillWidth = (label: string) => Math.ceil(PILL_PAD + CHAR_W * [...label].length)

// From the most readable picture to the most compact: ring-1 and ring-2 label lengths (0: icons only).
// The labelled levels go from the longest shortest label down (most titles whole first).
const LEVELS: readonly (readonly [number, number])[] = [
  ...[22, 18, 16, 14, 12, 10].flatMap((l1) => [22, 18, 16, 14, 12, 10, 8].map((l2) => [l1, l2] as const))
    .sort((a, b) => Math.min(b[0], b[1]) - Math.min(a[0], a[1]) || b[0] - a[0] || b[1] - a[1]),
  [22, 0], [16, 0], [10, 0], [0, 0],
]
// Where the inner ring sits between the centre and the outer ring (0: close to the centre).
const SPREADS = [0.35, 0.1, 0.6, 0.85]

/**
 * The radial layout of a neighbourhood in a box (D2): the most readable level where
 * no two nodes overlap and no line passes behind a node. `narrow`, a phone's screen:
 * every node keeps a label; when none fits, the result says so and the List opens first.
 */
export function layout(n: Neighbourhood, box: Box, narrow = false): GraphLayout {
  const outer = n.ring2.length > 0 || n.more2 > 0
  // Without an outer ring only the inner ring's label length matters: one level per length.
  const seen = new Set<number>()
  const levels = LEVELS.filter(([l1, l2]) => !narrow || (l1 > 0 && (l2 > 0 || !outer)))
    .filter(([l1]) => outer || (!seen.has(l1) && !!seen.add(l1)))
  let last: GraphLayout | null = null
  for (const [l1, l2] of levels) {
    for (const spread of outer ? SPREADS : [0]) {
      last = place(n, box, l1, l2, spread)
      if (last.fits) return lengthen(n, box, l1, l2, spread, last)
    }
  }
  // Nothing fits: the most compact picture this screen allows, flagged.
  return last!
}

/**
 * Gives each cut label, shortest title first, as much of its title as still fits (up to
 * LABEL_MAX), so one long title does not shorten every other.
 */
function lengthen(n: Neighbourhood, box: Box, l1: number, l2: number, spread: number, fitted: GraphLayout): GraphLayout {
  const own = new Map<string, number>()
  let best = fitted
  // Shortest titles first: the most of them shown whole.
  const shortened = fitted.nodes.filter((p) => p.ring !== 0 && !p.compact && p.truncated)
    .sort((a, b) => [...a.item.title].length - [...b.item.title].length || (a.item.key < b.item.key ? -1 : 1))
  for (const p of shortened) {
    const full = Math.min(LABEL_MAX, [...p.item.title].length)
    for (let chars = full; chars > [...p.label].length; chars -= 3) {
      own.set(p.item.key, chars)
      const next = place(n, box, l1, l2, spread, own)
      if (next.fits) { best = next; break }
      own.delete(p.item.key)
    }
  }
  return best
}

function place(n: Neighbourhood, box: Box, l1: number, l2: number, spread: number, own?: ReadonlyMap<string, number>): GraphLayout {
  const { width, height } = box
  const cx = width / 2
  const cy = height / 2
  const ax = width / 2 - MARGIN
  const ay = height / 2 - MARGIN
  // The centre's title is cut no shorter than the inner ring's (and at 24 at most).
  const centreLabel = cut(n.centre.title, Math.max(12, Math.min(LABEL_MAX, l1 + 4)))
  const nodes: PlacedNode[] = [{
    item: n.centre, ring: 0, x: cx, y: cy, h: CENTRE_H, label: centreLabel, truncated: centreLabel !== n.centre.title, compact: false,
    w: Math.min(Math.ceil(CENTRE_PAD + CENTRE_CHAR_W * [...centreLabel].length), width - 2 * MARGIN),
  }]
  const markers: PlacedMarker[] = []
  const sized = (item: GraphItem, ring: 1 | 2, level: number): PlacedNode => {
    const chars = level === 0 ? 0 : own?.get(item.key) ?? level
    if (chars === 0) return { item, ring, x: 0, y: 0, w: COMPACT, h: COMPACT, label: '', truncated: true, compact: true }
    const label = cut(item.title, chars)
    return { item, ring, x: 0, y: 0, w: pillWidth(label), h: NODE_H, label, truncated: label !== item.title, compact: false }
  }
  const r1 = n.ring1.map((i) => sized(i, 1, l1))
  const r2 = n.ring2.map((i) => ({ ...sized(i, 2, l2), parent: n.parent.get(i.key) }))
  const slots1 = r1.length + (n.more1 > 0 ? 1 : 0)
  const outer = r2.length > 0 || n.more2 > 0
  // Each node's inner edge sits on its ring (an ellipse with radii rx, ry), so a wide
  // pill reaches outward, never back toward the centre.
  const half = (list: PlacedNode[], marker: boolean) => Math.max(marker ? MARKER_W / 2 : 0, ...list.map((p) => p.w / 2))
  const tall = (list: PlacedNode[]) => Math.max(NODE_H, ...list.map((p) => p.h)) / 2
  const cw = nodes[0].w / 2 + 2 * GAP
  const ch = CENTRE_H / 2 + 2 * GAP
  const w1 = half(r1, n.more1 > 0)
  const h1 = tall(r1)
  let rx1: number, ry1: number
  let rx2 = 0, ry2 = 0
  if (outer) {
    // Wide pills at the sides are kept in the canvas by the clamp below, so the outer
    // ring keeps at least half the canvas's width.
    rx2 = Math.max(ax - 2 * half(r2, n.more2 > 0), ax * 0.55)
    ry2 = ay - 2 * tall(r2)
    // The inner ring between the centre and the outer ring, `spread` of the way out.
    rx1 = cw + spread * Math.max(0, rx2 - 2 * w1 - 3 * GAP - cw)
    ry1 = ch + spread * Math.max(0, ry2 - 2 * h1 - 3 * GAP - ch)
  } else {
    // A few items stay near the centre; a busy ring takes the whole canvas.
    const room = slots1 > 8 ? Infinity : 1
    rx1 = Math.max(cw, Math.min(ax - 2 * w1, cw + 150 * room))
    ry1 = Math.max(ch, Math.min(ay - 2 * h1, ch + 100 * room))
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const at = (a: number, rx: number, ry: number, size: { w: number; h: number }) => ({
    x: clamp(cx + Math.cos(a) * (rx + size.w / 2), MARGIN + size.w / 2, width - MARGIN - size.w / 2),
    y: clamp(cy + Math.sin(a) * (ry + size.h / 2), MARGIN + size.h / 2, height - MARGIN - size.h / 2),
  })
  const markerSize = { w: MARKER_W, h: NODE_H }
  // Ring 1 evenly spaced from the top, clockwise; the marker takes the last slot.
  // Equal steps along the ellipse (not equal angles), so a flat ring is not crowded at its ends.
  const angle1 = arcAngles(rx1 + w1, ry1 + h1, slots1)
  r1.forEach((p, i) => Object.assign(p, at(angle1(i), rx1, ry1, p)))
  if (n.more1 > 0) markers.push({ ring: 1, count: n.more1, ...at(angle1(r1.length), rx1, ry1, markerSize), ...markerSize })
  // Ring 2: each parent's children spread across its share of the circle, around its
  // angle but never on it, so no child sits behind its parent and no line runs under it.
  if (outer) {
    const sector = (2 * Math.PI) / Math.max(slots1, 2)
    n.ring1.forEach((parent, pi) => {
      const kids = r2.filter((p) => p.parent === parent.key)
      const step = (sector * 0.8) / Math.max(kids.length, 2)
      kids.forEach((p, j) => {
        // Odd counts shift half a step clockwise, so the middle child is off the parent's ray.
        const offset = (j - (kids.length - 1) / 2 + (kids.length % 2 ? 0.5 : 0)) * step
        Object.assign(p, at(angle1(pi) + offset, rx2, ry2, p))
      })
    })
    if (n.more2 > 0) markers.push({ ring: 2, count: n.more2, ...at((angle1(slots1 - 1) + (angle1(0) + 2 * Math.PI)) / 2, rx2, ry2, markerSize), ...markerSize })
  }
  nodes.push(...r1, ...r2)
  // Centre the drawing, not the item: the nodes' bounding box sits in the middle both ways.
  const all = [...nodes, ...markers]
  const left = Math.min(...all.map((p) => p.x - p.w / 2))
  const right = Math.max(...all.map((p) => p.x + p.w / 2))
  const top = Math.min(...all.map((p) => p.y - p.h / 2))
  const bottom = Math.max(...all.map((p) => p.y + p.h / 2))
  const dx = width / 2 - (left + right) / 2
  const dy = height / 2 - (top + bottom) / 2
  for (const p of all) { p.x += dx; p.y += dy }
  for (const p of nodes) { p.x = round(p.x); p.y = round(p.y) }
  for (const m of markers) { m.x = round(m.x); m.y = round(m.y) }
  const { edges, clear } = lines(n, nodes, markers)
  return { width, height, nodes, markers, edges, fits: clear && !overlaps([...nodes, ...markers], box) }
}

/** The pairs drawn, clipped to the pills' borders; `clear` is false when a structural line passes behind a node. */
function lines(n: Neighbourhood, nodes: PlacedNode[], markers: PlacedMarker[]): { edges: PlacedEdge[]; clear: boolean } {
  const byKey = new Map(nodes.map((p) => [p.item.key, p]))
  const centre = n.centre.key
  const solid = (a: PlacedNode, b: PlacedNode) =>
    (a.item.key === centre && b.ring === 1) || (b.item.key === centre && a.ring === 1) || a.parent === b.item.key || b.parent === a.item.key
  const edges: PlacedEdge[] = []
  let clear = true
  for (const [ka, kb] of n.edges) {
    const a = byKey.get(ka)
    const b = byKey.get(kb)
    if (!a || !b) continue
    const e = clip(a, b)
    const blocked = [...nodes, ...markers].some((o) => o !== a && o !== b && crosses(e, o))
    if (!blocked) edges.push(e)
    else if (solid(a, b)) {
      clear = false
      edges.push(e)
    }
  }
  return { edges, clear }
}

/** The segment between two nodes' centres, cut where it leaves each pill (a circle for a compact node). */
function clip(a: PlacedNode, b: PlacedNode): PlacedEdge {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const exit = (p: PlacedNode) => {
    if (p.compact) return p.w / 2 / Math.hypot(dx, dy || 1e-9)
    const tx = dx ? p.w / 2 / Math.abs(dx) : Infinity
    const ty = dy ? p.h / 2 / Math.abs(dy) : Infinity
    return Math.min(tx, ty)
  }
  // Pills that touch leave no line (they never do in a picture that fits).
  const ta = Math.min(1, exit(a))
  const tb = Math.min(1 - ta, exit(b))
  return { a: a.item.key, b: b.item.key, x1: round(a.x + dx * ta), y1: round(a.y + dy * ta), x2: round(b.x - dx * tb), y2: round(b.y - dy * tb) }
}

/** Whether a segment passes through a rectangle (centre and size), with a hair of room (Liang–Barsky). */
export function crosses(e: Pick<PlacedEdge, 'x1' | 'y1' | 'x2' | 'y2'>, r: Rect): boolean {
  const pad = 2
  const [minX, maxX, minY, maxY] = [r.x - r.w / 2 - pad, r.x + r.w / 2 + pad, r.y - r.h / 2 - pad, r.y + r.h / 2 + pad]
  const dx = e.x2 - e.x1
  const dy = e.y2 - e.y1
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [[-dx, e.x1 - minX], [dx, maxX - e.x1], [-dy, e.y1 - minY], [dy, maxY - e.y1]]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

const round = (v: number) => Math.round(v * 10) / 10

/**
 * The angles of `count` points spread evenly by length along an ellipse, the first at
 * the top, clockwise: `(i) => angle` (any real i, wrapping, for points between slots).
 */
function arcAngles(rx: number, ry: number, count: number): (i: number) => number {
  const STEPS = 720
  const lengths = [0]
  let prev = { x: 0, y: -ry }
  for (let k = 1; k <= STEPS; k++) {
    const t = -Math.PI / 2 + (k / STEPS) * 2 * Math.PI
    const p = { x: rx * Math.cos(t), y: ry * Math.sin(t) }
    lengths.push(lengths[k - 1] + Math.hypot(p.x - prev.x, p.y - prev.y))
    prev = p
  }
  const total = lengths[STEPS] || 1
  return (i: number) => {
    const turns = Math.floor(i / Math.max(count, 1))
    const want = ((i / Math.max(count, 1)) - turns) * total
    let k = 1
    while (k < STEPS && lengths[k] < want) k++
    const f = (want - lengths[k - 1]) / ((lengths[k] - lengths[k - 1]) || 1)
    return -Math.PI / 2 + ((k - 1 + f) / STEPS) * 2 * Math.PI + turns * 2 * Math.PI
  }
}

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
