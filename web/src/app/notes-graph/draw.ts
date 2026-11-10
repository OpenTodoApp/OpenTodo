// Drawing the graph page on a canvas (OpenSpec change notes-graph-page, design D3,
// D7): the camera, the colours read from the tokens, the labels by level of detail,
// a uniform grid for hit tests, and one frame. No DOM node per graph node.
import type { NotesGraph } from '../../lib/notesGraph'
import { HUES, type HueName } from '../../ui'

/** The view: the world point at the canvas's middle and the zoom (screen px per layout unit). */
export interface Camera {
  x: number
  y: number
  k: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
/** At most this many labels in one frame, besides the lit ones (D7). */
export const LABEL_CAP = 150
/** A label is cut to this many characters (the full title shows on hover and focus). */
const LABEL_CHARS = 28

export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

export function toScreen(cam: Camera, size: Size, wx: number, wy: number): [number, number] {
  return [(wx - cam.x) * cam.k + size.width / 2, (wy - cam.y) * cam.k + size.height / 2]
}

export function toWorld(cam: Camera, size: Size, sx: number, sy: number): [number, number] {
  return [(sx - size.width / 2) / cam.k + cam.x, (sy - size.height / 2) / cam.k + cam.y]
}

/** The camera that shows a box with `pad` px of room, at most at zoom `max`. */
export function fitCamera(b: { x0: number; y0: number; x1: number; y1: number }, size: Size, pad = 48, max = 2.4): Camera {
  const w = Math.max(b.x1 - b.x0, 1)
  const h = Math.max(b.y1 - b.y0, 1)
  const k = clampZoom(Math.min((size.width - 2 * pad) / w, (size.height - 2 * pad) / h, max))
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, k }
}

/** A node's radius in layout units: larger with more links (square root, capped). */
export const radiusOf = (links: number) => 3 + Math.min(7, Math.sqrt(links) * 1.4)

/**
 * A node's radius on screen (px): it grows with the zoom more slowly than the
 * distances do (square root), so a close view has room between nodes and a far
 * one keeps them visible; a secondary node is smaller.
 */
export const nodeRadius = (links: number, listed: boolean, k: number) => Math.max(radiusOf(links) * (listed ? 1 : 0.7) * Math.sqrt(k), 2)

/**
 * The nodes that get a label this frame (D7): `always` first (hovered, focused,
 * centred, found, and their neighbours), then the others in view whose node is drawn
 * at least 7 px across, most linked first, LABEL_CAP at most.
 */
export function labelsFor(g: NotesGraph, x: Float64Array, y: Float64Array, visible: Uint8Array, cam: Camera, size: Size, always: ReadonlySet<number>): number[] {
  const out: number[] = []
  const inView = (i: number) => {
    const [sx, sy] = toScreen(cam, size, x[i], y[i])
    return sx > -120 && sx < size.width + 20 && sy > -20 && sy < size.height + 20
  }
  for (const i of always) if (visible[i] && inView(i)) out.push(i)
  const rest: number[] = []
  for (let i = 0; i < g.nodes.length; i++) {
    if (!visible[i] || always.has(i)) continue
    if (nodeRadius(g.adj[i].length, g.nodes[i].listed, cam.k) < 3.5 || !inView(i)) continue
    rest.push(i)
  }
  rest.sort((a, b) => g.adj[b].length - g.adj[a].length || a - b)
  for (const i of rest.slice(0, LABEL_CAP)) out.push(i)
  return out
}

/** A uniform grid over the drawn nodes, for the node under the pointer. */
export class HitGrid {
  private cells = new Map<number, number[]>()
  private readonly size: number

  constructor(private readonly x: Float64Array, private readonly y: Float64Array, visible: Uint8Array, size = 32) {
    this.size = size
    for (let i = 0; i < x.length; i++) {
      if (!visible[i]) continue
      const key = this.key(Math.floor(x[i] / size), Math.floor(y[i] / size))
      const list = this.cells.get(key)
      if (list) list.push(i)
      else this.cells.set(key, [i])
    }
  }

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  /** The drawn node nearest (wx, wy) at any distance (the arrow keys' first step), or null. */
  nearestAny(wx: number, wy: number): number | null {
    let best: number | null = null
    let bestD = Infinity
    for (const list of this.cells.values()) {
      for (const i of list) {
        const d = (this.x[i] - wx) ** 2 + (this.y[i] - wy) ** 2
        if (d < bestD || (d === bestD && best !== null && i < best)) { bestD = d; best = i }
      }
    }
    return best
  }

  /** The nearest node within `r` layout units of (wx, wy), and how many nodes were looked at. */
  nearest(wx: number, wy: number, r: number): { node: number | null; visited: number } {
    const s = this.size
    let best: number | null = null
    let bestD = r * r
    let visited = 0
    for (let cx = Math.floor((wx - r) / s); cx <= Math.floor((wx + r) / s); cx++) {
      for (let cy = Math.floor((wy - r) / s); cy <= Math.floor((wy + r) / s); cy++) {
        for (const i of this.cells.get(this.key(cx, cy)) ?? []) {
          visited++
          const d = (this.x[i] - wx) ** 2 + (this.y[i] - wy) ** 2
          if (d <= bestD) { bestD = d; best = i }
        }
      }
    }
    return { node: best, visited }
  }
}

/** The colours of a frame, resolved from the tokens (light, dark and themes follow). */
export interface Palette {
  edge: string
  accent: string
  focus: string
  text: string
  strong: string
  muted: string
  halo: string
  surface: string
  hue: Record<HueName, string>
  font: string
}

/** Reads the tokens through a probe element inside `host`, so every value is a resolved colour the canvas accepts. */
export function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  host.appendChild(probe)
  const read = (token: string, fallback: string) => {
    probe.style.color = ''
    probe.style.color = `var(${token})`
    const v = getComputedStyle(probe).color
    return v && !v.includes('var(') ? v : fallback
  }
  const hue = Object.fromEntries(HUES.map(({ name }) => [name, read(`--ot-hue-${name}-solid`, 'gray')])) as Record<HueName, string>
  const palette: Palette = {
    edge: read('--ot-line-strong', 'gray'), accent: read('--ot-accent', 'blue'), focus: read('--ot-focus', 'blue'),
    text: read('--ot-text', 'black'), strong: read('--ot-text-strong', 'black'), muted: read('--ot-muted', 'gray'),
    halo: read('--ot-surface', 'white'), surface: read('--ot-surface', 'white'), hue,
    font: getComputedStyle(host).fontFamily || 'sans-serif',
  }
  probe.remove()
  return palette
}

export interface Frame {
  g: NotesGraph
  x: Float64Array
  y: Float64Array
  visible: Uint8Array
  /** What stays lit; null: everything. */
  lit: Uint8Array | null
  /** The hovered or focused node: it and its neighbours light, the rest dims. */
  hot: number | null
  /** The node with keyboard focus (the focus ring). */
  focus: number | null
  centre: number | null
  /** Nodes whose label is always drawn (besides the hot node's neighbourhood). */
  always: ReadonlySet<number>
  cam: Camera
  size: Size
  dpr: number
  palette: Palette
  hueOf: (projectId: string | null) => HueName | null
}

const DIM = 0.16

/** Draws one frame; returns how many labels it drew. */
export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame): number {
  const { g, x, y, visible, cam, size, dpr, palette: p } = f
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  const hotSet = f.hot !== null ? new Set([f.hot, ...g.adj[f.hot].filter((j) => visible[j])]) : null
  const bright = (i: number) => (hotSet ? hotSet.has(i) : f.lit ? !!f.lit[i] : true)
  const dims = !!hotSet || !!f.lit
  // The view in layout units, with a margin: lines and nodes outside it are skipped.
  const [vx0, vy0] = toWorld(cam, size, -40, -40)
  const [vx1, vy1] = toWorld(cam, size, size.width + 40, size.height + 40)
  const out = (i: number) => x[i] < vx0 || x[i] > vx1 || y[i] < vy0 || y[i] > vy1

  ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (size.width / 2 - cam.x * cam.k), dpr * (size.height / 2 - cam.y * cam.k))
  ctx.lineWidth = 1 / cam.k
  const lit = new Path2D()
  const dim = new Path2D()
  const hot = new Path2D()
  const edges = g.edges
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e]
    const b = edges[e + 1]
    if (!visible[a] || !visible[b] || (out(a) && out(b))) continue
    const path = f.hot !== null && (a === f.hot || b === f.hot) ? hot : bright(a) && bright(b) ? lit : dim
    path.moveTo(x[a], y[a])
    path.lineTo(x[b], y[b])
  }
  ctx.strokeStyle = p.edge
  ctx.globalAlpha = DIM
  ctx.stroke(dim)
  ctx.globalAlpha = dims ? 1 : 0.85
  ctx.stroke(lit)
  ctx.globalAlpha = 1
  ctx.strokeStyle = p.accent
  ctx.lineWidth = 1.5 / cam.k
  ctx.stroke(hot)

  // Nodes: the dimmed first, so the lit ones sit on top.
  const order: number[] = []
  for (let i = 0; i < g.nodes.length; i++) if (visible[i] && !out(i) && !bright(i)) order.push(i)
  for (let i = 0; i < g.nodes.length; i++) if (visible[i] && !out(i) && bright(i)) order.push(i)
  for (const i of order) {
    const n = g.nodes[i]
    const r = nodeRadius(g.adj[i].length, n.listed, cam.k) / cam.k
    const hue = f.hueOf(n.projectId)
    const colour = hue ? p.hue[hue] : p.muted
    ctx.globalAlpha = (bright(i) ? 1 : DIM) * (n.done ? 0.55 : 1)
    shape(ctx, n.kind, x[i], y[i], r)
    if (n.listed) {
      ctx.fillStyle = colour
      ctx.fill()
    } else {
      ctx.fillStyle = p.surface
      ctx.fill()
      ctx.strokeStyle = colour
      ctx.lineWidth = 1.5 / cam.k
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  const ring = (i: number | null, colour: string, gap: number) => {
    if (i === null || !visible[i]) return
    const n = g.nodes[i]
    shape(ctx, n.kind, x[i], y[i], (nodeRadius(g.adj[i].length, n.listed, cam.k) + gap) / cam.k)
    ctx.strokeStyle = colour
    ctx.lineWidth = 2 / cam.k
    ctx.stroke()
  }
  ring(f.centre, p.accent, 3)
  ring(f.focus, p.focus, 3)

  // Labels in screen pixels, with a halo in the page colour.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // The hot, focused and centred nodes first, then their neighbours and the found ones.
  const always = new Set([f.hot, f.focus, f.centre].filter((i): i is number => i !== null))
  if (hotSet) for (const i of hotSet) always.add(i)
  for (const i of f.always) always.add(i)
  const labels = labelsFor(g, x, y, visible, cam, size, always)
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const taken: { x: number; y: number; w: number; h: number }[] = []
  const draws: { text: string; font: string; x: number; y: number; alpha: number; colour: string }[] = []
  for (const i of labels) {
    const n = g.nodes[i]
    const isHot = i === f.hot || i === f.focus || i === f.centre
    // While something is lit, the dimmed nodes keep quiet: no label.
    if (dims && !bright(i) && !isHot) continue
    const [sx, sy] = toScreen(cam, size, x[i], y[i])
    const r = nodeRadius(g.adj[i].length, n.listed, cam.k)
    const title = n.title.trim() || '…'
    const text = isHot || [...title].length <= LABEL_CHARS ? title : `${[...title].slice(0, LABEL_CHARS - 1).join('').trimEnd()}…`
    const font = `${isHot ? '600 13px' : '12px'} ${p.font}`
    ctx.font = font
    const box = { x: sx + r + 3, y: sy - 9, w: ctx.measureText(text).width + 4, h: 18 }
    // A label that would overlap one already placed is left out (the hot ones are placed first and always drawn).
    if (!isHot && taken.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) continue
    taken.push(box)
    draws.push({ text, font, x: sx + r + 5, y: sy, alpha: bright(i) ? 1 : 0.35, colour: isHot ? p.strong : bright(i) && dims ? p.text : p.muted })
  }
  // The first placed (the hot ones) are drawn last, on top.
  for (const d of draws.reverse()) {
    ctx.font = d.font
    ctx.globalAlpha = d.alpha
    ctx.strokeStyle = p.halo
    ctx.lineWidth = 3
    ctx.strokeText(d.text, d.x, d.y)
    ctx.fillStyle = d.colour
    ctx.fillText(d.text, d.x, d.y)
  }
  ctx.globalAlpha = 1
  return draws.length
}

/** A node's outline by its kind (D3): a note a circle, a task a rounded square, a project a diamond. */
function shape(ctx: CanvasRenderingContext2D, kind: 'note' | 'task' | 'project', cx: number, cy: number, r: number): void {
  ctx.beginPath()
  if (kind === 'note') ctx.arc(cx, cy, r, 0, Math.PI * 2)
  else if (kind === 'task') {
    const s = r * 0.9
    const c = s * 0.4
    ctx.moveTo(cx - s + c, cy - s)
    ctx.arcTo(cx + s, cy - s, cx + s, cy + s, c)
    ctx.arcTo(cx + s, cy + s, cx - s, cy + s, c)
    ctx.arcTo(cx - s, cy + s, cx - s, cy - s, c)
    ctx.arcTo(cx - s, cy - s, cx + s, cy - s, c)
    ctx.closePath()
  } else {
    const s = r * 1.2
    ctx.moveTo(cx, cy - s)
    ctx.lineTo(cx + s, cy)
    ctx.lineTo(cx, cy + s)
    ctx.lineTo(cx - s, cy)
    ctx.closePath()
  }
}
