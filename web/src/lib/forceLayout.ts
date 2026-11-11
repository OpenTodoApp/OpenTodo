// The graph page's layout (OpenSpec change notes-graph-page, design D6, D7): a
// small force layout of our own, deterministic and bounded. Springs on links, a
// Barnes–Hut quadtree for the repulsion between every pair, a weak pull toward the
// origin (so separate clusters and notes without links stay near), velocity decay
// and a fixed cooling schedule. Starting positions are a golden-angle spiral in a
// breadth-first order of the nodes, never random: the same nodes and links give the
// same picture. `fixed` nodes keep their place, so a new node is laid out among its
// neighbours while everything else stays put. Pure; run in slices by the caller.
// Loaded with the graph page only, never in the first load.

/** Steps of a full layout (the cooling reaches its floor at the last one). */
export const FULL_STEPS = 220
/** Steps of a local placement (only new nodes move). */
export const LOCAL_STEPS = 80
/** The rest length of a link and the strength of the repulsion, in layout units. */
const LINK_DISTANCE = 36
const CHARGE = -40
const GRAVITY = 0.04
const VELOCITY_DECAY = 0.6
const ALPHA_MIN = 0.001
/** Barnes–Hut: a cell this small for its distance acts as one body. */
const THETA2 = 1.44
const DISTANCE_MIN2 = 1

export interface LayoutGraph {
  /** Number of nodes. */
  n: number
  /** Links as pairs of node indices: [a0, b0, a1, b1, …]. */
  edges: Uint32Array
}

/** A layout in progress: positions, velocities, and how far the cooling has gone. */
export class ForceLayout {
  readonly x: Float64Array
  readonly y: Float64Array
  private readonly vx: Float64Array
  private readonly vy: Float64Array
  /** 1: the node keeps its place. */
  readonly fixed: Uint8Array
  private readonly degree: Uint32Array
  private readonly moving: Uint32Array
  private alpha: number
  private readonly alphaDecay: number
  private done = 0
  readonly steps: number
  private readonly tree: QuadTree

  constructor(private readonly g: LayoutGraph, opts: { steps?: number; start?: { x: Float64Array; y: Float64Array; fixed: Uint8Array }; alpha?: number } = {}) {
    const n = g.n
    this.x = opts.start?.x ?? new Float64Array(n)
    this.y = opts.start?.y ?? new Float64Array(n)
    this.vx = new Float64Array(n)
    this.vy = new Float64Array(n)
    this.fixed = opts.start?.fixed ?? new Uint8Array(n)
    this.degree = new Uint32Array(n)
    for (let e = 0; e < g.edges.length; e += 2) { this.degree[g.edges[e]]++; this.degree[g.edges[e + 1]]++ }
    if (!opts.start) seed(g, this.x, this.y)
    const moving: number[] = []
    for (let i = 0; i < n; i++) if (!this.fixed[i]) moving.push(i)
    this.moving = Uint32Array.from(moving)
    this.steps = opts.steps ?? FULL_STEPS
    this.alpha = opts.alpha ?? 1
    this.alphaDecay = 1 - (ALPHA_MIN / this.alpha) ** (1 / this.steps)
    this.tree = new QuadTree(n)
  }

  get finished(): boolean {
    return this.done >= this.steps || this.moving.length === 0
  }

  /** Steps taken so far. */
  get taken(): number {
    return this.done
  }

  /** One step of the simulation. */
  step(): void {
    if (this.finished) return
    const { x, y, vx, vy, fixed, degree, alpha } = this
    const edges = this.g.edges
    // Springs: each link pulls its ends toward the rest length, the lighter end more.
    for (let e = 0; e < edges.length; e += 2) {
      const s = edges[e]
      const t = edges[e + 1]
      if (fixed[s] && fixed[t]) continue
      let dx = x[t] + vx[t] - x[s] - vx[s]
      let dy = y[t] + vy[t] - y[s] - vy[s]
      if (dx === 0 && dy === 0) { dx = jiggle(s + t); dy = jiggle(s * 7 + t) }
      const l = Math.sqrt(dx * dx + dy * dy)
      const k = ((l - LINK_DISTANCE) / l) * alpha / Math.min(degree[s], degree[t])
      dx *= k
      dy *= k
      const bias = degree[s] / (degree[s] + degree[t])
      if (!fixed[t]) { vx[t] -= dx * bias; vy[t] -= dy * bias }
      if (!fixed[s]) { vx[s] += dx * (1 - bias); vy[s] += dy * (1 - bias) }
    }
    // Repulsion between every pair, through the quadtree; only moving nodes feel it.
    this.tree.build(x, y)
    for (const i of this.moving) this.tree.repel(i, x, y, vx, vy, CHARGE * alpha)
    for (const i of this.moving) {
      vx[i] += -x[i] * GRAVITY * alpha
      vy[i] += -y[i] * GRAVITY * alpha
      vx[i] *= 1 - VELOCITY_DECAY
      vy[i] *= 1 - VELOCITY_DECAY
      x[i] += vx[i]
      y[i] += vy[i]
    }
    this.alpha += (0 - this.alpha) * this.alphaDecay
    this.done++
  }

  /** Steps until finished or `budget` ms have gone (the clock is injectable for tests). */
  run(budget = Infinity, now: () => number = () => performance.now()): boolean {
    const until = now() + budget
    while (!this.finished) {
      this.step()
      if (now() >= until) break
    }
    return this.finished
  }
}

/** A small, deterministic offset for nodes on the same spot. */
function jiggle(i: number): number {
  return (((i * 2654435761) >>> 0) / 4294967296 - 0.5) * 1e-3
}

/**
 * Starting positions: a golden-angle spiral, in breadth-first order from the most
 * linked node of each cluster (ties by index), so linked nodes start close.
 */
function seed(g: LayoutGraph, x: Float64Array, y: Float64Array): void {
  const n = g.n
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let e = 0; e < g.edges.length; e += 2) { adj[g.edges[e]].push(g.edges[e + 1]); adj[g.edges[e + 1]].push(g.edges[e]) }
  const byDegree = [...Array(n).keys()].sort((a, b) => adj[b].length - adj[a].length || a - b)
  const seen = new Uint8Array(n)
  let at = 0
  const place = (i: number) => {
    const r = 10 * Math.sqrt(0.5 + at)
    const a = at * Math.PI * (3 - Math.sqrt(5))
    x[i] = r * Math.cos(a)
    y[i] = r * Math.sin(a)
    at++
  }
  for (const root of byDegree) {
    if (seen[root]) continue
    seen[root] = 1
    const queue = [root]
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]
      place(i)
      for (const j of [...adj[i]].sort((a, b) => a - b)) if (!seen[j]) { seen[j] = 1; queue.push(j) }
    }
  }
}

/**
 * Starting points for nodes new to a stored picture (D6): each at the mean of its
 * placed neighbours, a little off it; a node without one on the picture's rim, at an
 * angle from its key's hash. Writes into `x`/`y` for every index not `placed`.
 */
export function placeNew(g: LayoutGraph, x: Float64Array, y: Float64Array, placed: Uint8Array, hashOf: (i: number) => number): void {
  const n = g.n
  const sum = new Float64Array(n * 2)
  const count = new Uint32Array(n)
  for (let e = 0; e < g.edges.length; e += 2) {
    const a = g.edges[e]
    const b = g.edges[e + 1]
    if (placed[a] && !placed[b]) { sum[b * 2] += x[a]; sum[b * 2 + 1] += y[a]; count[b]++ }
    if (placed[b] && !placed[a]) { sum[a * 2] += x[b]; sum[a * 2 + 1] += y[b]; count[a]++ }
  }
  let rim = 0
  for (let i = 0; i < n; i++) if (placed[i]) rim = Math.max(rim, Math.hypot(x[i], y[i]))
  rim += LINK_DISTANCE
  for (let i = 0; i < n; i++) {
    if (placed[i]) continue
    const h = hashOf(i)
    const a = (h / 4294967296) * 2 * Math.PI
    if (count[i]) {
      x[i] = sum[i * 2] / count[i] + Math.cos(a) * LINK_DISTANCE * 0.5
      y[i] = sum[i * 2 + 1] / count[i] + Math.sin(a) * LINK_DISTANCE * 0.5
    } else {
      x[i] = Math.cos(a) * rim
      y[i] = Math.sin(a) * rim
    }
  }
}

/** A 32-bit FNV-1a hash of a string (the rim angle of a new node). */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A quadtree over the positions, rebuilt each step in preallocated arrays: each cell
 * keeps its square, its children, the points in it (a leaf) and its centre of mass.
 */
class QuadTree {
  private cap: number
  private x0: Float64Array
  private y0: Float64Array
  private w: Float64Array
  private child: Int32Array
  /** The first point of a leaf (-1: none), the next point in the same leaf. */
  private first: Int32Array
  private next: Int32Array
  private mass: Float64Array
  private mx: Float64Array
  private my: Float64Array
  private cells = 0
  private stack: Int32Array

  constructor(private readonly n: number) {
    this.cap = Math.max(16, n * 4)
    this.x0 = new Float64Array(this.cap)
    this.y0 = new Float64Array(this.cap)
    this.w = new Float64Array(this.cap)
    this.child = new Int32Array(this.cap * 4)
    this.first = new Int32Array(this.cap)
    this.next = new Int32Array(Math.max(1, n))
    this.mass = new Float64Array(this.cap)
    this.mx = new Float64Array(this.cap)
    this.my = new Float64Array(this.cap)
    this.stack = new Int32Array(this.cap)
  }

  private grow(): void {
    const cap = this.cap * 2
    const g = <T extends Float64Array | Int32Array>(a: T, k = 1): T => {
      const b = new (a.constructor as new (n: number) => T)(cap * k)
      b.set(a)
      return b
    }
    this.x0 = g(this.x0); this.y0 = g(this.y0); this.w = g(this.w); this.child = g(this.child, 4); this.first = g(this.first)
    this.mass = g(this.mass); this.mx = g(this.mx); this.my = g(this.my); this.stack = g(this.stack)
    this.cap = cap
  }

  private cell(x0: number, y0: number, w: number): number {
    if (this.cells === this.cap) this.grow()
    const c = this.cells++
    this.x0[c] = x0; this.y0[c] = y0; this.w[c] = w
    this.child.fill(-1, c * 4, c * 4 + 4)
    this.first[c] = -1
    this.mass[c] = 0; this.mx[c] = 0; this.my[c] = 0
    return c
  }

  build(x: Float64Array, y: Float64Array): void {
    const n = this.n
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < n; i++) {
      if (x[i] < minX) minX = x[i]
      if (x[i] > maxX) maxX = x[i]
      if (y[i] < minY) minY = y[i]
      if (y[i] > maxY) maxY = y[i]
    }
    this.cells = 0
    if (n === 0) return
    const w = Math.max(maxX - minX, maxY - minY, 1) * 1.0001
    this.cell(minX, minY, w)
    for (let i = 0; i < n; i++) this.insert(i, x, y)
    // Children are made after their parents: from the last cell back, every child is done before its parent.
    for (let c = this.cells - 1; c >= 0; c--) {
      let m = 0, sx = 0, sy = 0
      for (let p = this.first[c]; p >= 0; p = this.next[p]) { m++; sx += x[p]; sy += y[p] }
      for (let q = 0; q < 4; q++) {
        const ch = this.child[c * 4 + q]
        if (ch < 0 || this.mass[ch] === 0) continue
        m += this.mass[ch]
        sx += this.mx[ch] * this.mass[ch]
        sy += this.my[ch] * this.mass[ch]
      }
      this.mass[c] = m
      if (m) { this.mx[c] = sx / m; this.my[c] = sy / m }
    }
  }

  private insert(i: number, x: Float64Array, y: Float64Array): void {
    let c = 0
    for (;;) {
      const internal = this.child[c * 4] >= 0 || this.child[c * 4 + 1] >= 0 || this.child[c * 4 + 2] >= 0 || this.child[c * 4 + 3] >= 0
      if (!internal) {
        const p = this.first[c]
        // An empty leaf, or a cell too small to split (points on the same spot): keep the point here.
        if (p < 0 || this.w[c] < 1e-3) {
          this.next[i] = p
          this.first[c] = i
          return
        }
        // Split: the leaf's points move into a child, then the new point goes on down.
        this.first[c] = -1
        for (let q = p; q >= 0;) {
          const nq = this.next[q]
          const ch = this.quadrant(c, x[q], y[q])
          this.next[q] = this.first[ch]
          this.first[ch] = q
          q = nq
        }
      }
      c = this.quadrant(c, x[i], y[i])
    }
  }

  /** The child of `c` holding (px, py), made when missing. */
  private quadrant(c: number, px: number, py: number): number {
    const half = this.w[c] / 2
    const right = px >= this.x0[c] + half ? 1 : 0
    const bottom = py >= this.y0[c] + half ? 1 : 0
    const slot = c * 4 + bottom * 2 + right
    let ch = this.child[slot]
    if (ch < 0) {
      ch = this.cell(this.x0[c] + right * half, this.y0[c] + bottom * half, half)
      this.child[slot] = ch
    }
    return ch
  }

  /** Adds the repulsion on node `i` from every other node to its velocity. */
  repel(i: number, x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array, strength: number): void {
    if (this.cells === 0) return
    const xi = x[i]
    const yi = y[i]
    let top = 0
    this.stack[top++] = 0
    while (top > 0) {
      const c = this.stack[--top]
      if (this.mass[c] === 0) continue
      let dx = this.mx[c] - xi
      let dy = this.my[c] - yi
      let l = dx * dx + dy * dy
      const w = this.w[c]
      const leaf = this.first[c] >= 0
      if (!leaf && (w * w) / THETA2 < l) {
        if (l < DISTANCE_MIN2) l = Math.sqrt(DISTANCE_MIN2 * l)
        const k = (strength * this.mass[c]) / l
        vx[i] += dx * k
        vy[i] += dy * k
        continue
      }
      if (leaf) {
        for (let p = this.first[c]; p >= 0; p = this.next[p]) {
          if (p === i) continue
          dx = x[p] - xi
          dy = y[p] - yi
          if (dx === 0 && dy === 0) { dx = jiggle(i * 31 + p); dy = jiggle(p * 17 + i) }
          l = dx * dx + dy * dy
          if (l < DISTANCE_MIN2) l = Math.sqrt(DISTANCE_MIN2 * l)
          const k = strength / l
          vx[i] += dx * k
          vy[i] += dy * k
        }
        continue
      }
      for (let q = 0; q < 4; q++) {
        const ch = this.child[c * 4 + q]
        if (ch >= 0) {
          if (top === this.stack.length) {
            const s = new Int32Array(this.stack.length * 2)
            s.set(this.stack)
            this.stack = s
          }
          this.stack[top++] = ch
        }
      }
    }
  }
}
