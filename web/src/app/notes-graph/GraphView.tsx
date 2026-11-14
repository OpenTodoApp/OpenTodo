// The graph page's canvas and its controls (OpenSpec change notes-graph-page, design
// D4 to D9): the layout run in slices (from the positions kept on the device when it
// can), one canvas redrawn only on a change, pan, zoom and pinch, hover and focus
// lighting a node's neighbours, click to open, double click or Space to centre with
// a depth, Backspace back, Find a note through the handle, the arrow keys between
// nodes with a live region, and Fit and zoom buttons. A topic dims, never moves.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type Ref } from 'react'
import { t } from '../../lib/i18n'
import { boundsOf, GraphLayout, inTopic, litMask, positionsOf, readPositions, stepToward, visibleMask, writePositions, type Direction, type GraphNode, type NotesGraph, type Placed } from '../../lib/notesGraph'
import { graphDepth, graphShow, type GraphDepth } from '../../lib/notesGraphPrefs'
import { IconButton, SegmentedControl, type HueName } from '../../ui'
import { clampZoom, drawFrame, fitCamera, HitGrid, nodeRadius, readPalette, toScreen, toWorld, type Camera, type Palette, type Size } from './draw'

/** The graph is drawn (the nightly benchmark's `notes-graph`), and each frame after a change (`notes-graph-frame`). */
export const GRAPH_READY_MARK = 'ot:notes-graph'
export const GRAPH_FRAME_MARK = 'ot:notes-graph-frame'
const SLICE_MS = 8
const FLY_MS = 250

export interface GraphHandle {
  /** Moves to the next (1) or previous (-1) match of the search and focuses it. */
  find: (step: 1 | -1) => void
}

export interface GraphViewProps {
  graph: NotesGraph
  /** The notes the list keeps under the chips (the topic), or null without a chip. */
  topic: ReadonlySet<string> | null
  /** Changes with the chips: a new topic fits the view (a sync does not). */
  topicKey: string
  /** The search's matches, best first; null without a search. */
  matches: readonly string[] | null
  hueOf: (projectId: string | null) => HueName | null
  onOpen: (node: GraphNode) => void
  /** Closes what the graph opened beside it; false when nothing was open. */
  onClosePane: () => boolean
  /** Keeps positions on the device (off in stories). */
  persist?: boolean
  /** An item to centre on once drawn (Open in graph, D10). */
  initialCentre?: string | null
  handle?: Ref<GraphHandle>
}

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const mark = (name: string) => {
  try {
    performance.clearMarks(name)
    performance.mark(name)
  } catch {
    // No performance timeline: nothing to record.
  }
}
const afterPaint = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(fn, 0)) : fn())

interface Shown { g: NotesGraph; p: Placed }

/** The positions for the graph: laid out in slices, carried over when the graph changes (D6). */
function usePlaced(graph: NotesGraph, persist: boolean): Shown | null {
  const [shown, setShown] = useState<Shown | null>(null)
  const current = useRef<Shown | null>(null)
  useEffect(() => {
    const prev = current.current
    if (prev?.g === graph) return
    const stored = prev ? positionsOf(prev.g, prev.p) : persist ? readPositions() : new Map()
    const layout = new GraphLayout(graph, stored)
    let timer = 0
    let stopped = false
    const done = () => {
      const next = { g: graph, p: layout.placed() }
      current.current = next
      setShown(next)
      if (persist) writePositions(graph, next.p, prev ? readPositions() : stored)
    }
    const slice = () => {
      if (stopped) return
      if (layout.layout.run(SLICE_MS)) done()
      else timer = window.setTimeout(slice, 0)
    }
    slice()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [graph, persist])
  return shown
}

/** What a frame shows, kept in a ref so the drawing reads the latest without re-rendering. */
interface View {
  shown: Shown | null
  visible: Uint8Array
  lit: Uint8Array | null
  focus: number | null
  centre: number | null
  always: Set<number>
}

/** The canvas: sized to its box at the device's pixel ratio, its palette from the tokens, one frame per change. */
function useCanvas(view: MutableRefObject<View>, hover: MutableRefObject<number | null>, hueOf: GraphViewProps['hueOf'], onResize: MutableRefObject<(() => void) | null>) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 })
  const size = useRef<Size>({ width: 0, height: 0 })
  const palette = useRef<Palette | null>(null)
  const frame = useRef(0)
  const drawn = useRef(false)
  const draw = useCallback(() => {
    frame.current = 0
    const c = canvas.current
    const v = view.current
    const ctx = c?.getContext?.('2d')
    if (!c || !ctx || !v.shown || !size.current.width) return
    palette.current ??= readPalette(host.current ?? c)
    drawFrame(ctx, {
      g: v.shown.g, x: v.shown.p.x, y: v.shown.p.y, visible: v.visible, lit: v.lit, hot: hover.current ?? (v.focus !== v.centre ? v.focus : null), focus: v.focus, centre: v.centre,
      always: v.always, cam: cam.current, size: size.current, dpr: window.devicePixelRatio || 1, palette: palette.current, hueOf,
    })
    const first = !drawn.current
    drawn.current = true
    afterPaint(() => mark(first ? GRAPH_READY_MARK : GRAPH_FRAME_MARK))
  }, [view, hover, hueOf])
  const invalidate = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw)
  }, [draw])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useLayoutEffect(() => {
    const el = host.current
    const c = canvas.current
    if (!el || !c) return
    const fit = () => {
      const w = Math.floor(el.clientWidth)
      const h = Math.floor(el.clientHeight)
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      const resized = size.current.width !== w || size.current.height !== h
      size.current = { width: w, height: h }
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      // A box that settles after the first fit (or a window resized before any move) is fitted again.
      if (resized) onResize.current?.()
      draw()
    }
    fit()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(el)
    // The palette follows the theme (light, dark, an accent or theme of the user's).
    const retheme = () => { palette.current = null; invalidate() }
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(retheme)
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-accent'] })
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    mq?.addEventListener?.('change', retheme)
    return () => { ro?.disconnect(); mo?.disconnect(); mq?.removeEventListener?.('change', retheme) }
  }, [draw, invalidate, onResize])
  return { host, canvas, cam, size, draw, invalidate }
}

/** Moving the view: flights in the motion token's time (none with reduced motion), zoom around a point, fitting a set. */
function useCamera(cam: MutableRefObject<Camera>, size: MutableRefObject<Size>, draw: () => void, invalidate: () => void) {
  const anim = useRef(0)
  useEffect(() => () => cancelAnimationFrame(anim.current), [])
  const moveTo = useCallback((to: Camera, animate = true) => {
    cancelAnimationFrame(anim.current)
    if (!animate || reducedMotion()) {
      cam.current = to
      invalidate()
      return
    }
    const from = { ...cam.current }
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / FLY_MS)
      const e = 1 - (1 - p) ** 3
      // Zoom moves on a log scale, so zooming in and out feel the same.
      cam.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e }
      draw()
      if (p < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [cam, draw, invalidate])
  const zoomBy = useCallback((f: number, at?: [number, number]) => {
    cancelAnimationFrame(anim.current)
    const s = size.current
    const c = cam.current
    const k = clampZoom(c.k * f)
    const [sx, sy] = at ?? [s.width / 2, s.height / 2]
    const [wx, wy] = toWorld(c, s, sx, sy)
    // The point under the pointer stays under it.
    cam.current = { k, x: wx - (sx - s.width / 2) / k, y: wy - (sy - s.height / 2) / k }
    invalidate()
  }, [cam, size, invalidate])
  const panBy = useCallback((dx: number, dy: number) => {
    cancelAnimationFrame(anim.current)
    cam.current = { ...cam.current, x: cam.current.x + dx / cam.current.k, y: cam.current.y + dy / cam.current.k }
    invalidate()
  }, [cam, invalidate])
  const fit = useCallback((p: Placed | undefined, which: (i: number) => boolean, animate = true) => {
    if (!p || !size.current.width) return
    const b = boundsOf(p.x, p.y, which)
    if (b) moveTo(fitCamera(b, size.current), animate)
  }, [size, moveTo])
  return { moveTo, zoomBy, panBy, fit }
}

interface Gesture { moved: boolean; x: number; y: number; cam: Camera; pinch?: { d: number; mid: [number, number] } }

/**
 * Pointer, touch and wheel (D4, D9): drag or one finger pans, two fingers pinch, a
 * mouse wheel or a trackpad pinch zooms, a two-finger scroll pans; a click opens, a
 * first tap lights and a second opens, a double click centres, hover lights.
 */
function useGestures(o: {
  canvas: MutableRefObject<HTMLCanvasElement | null>; cam: MutableRefObject<Camera>; size: MutableRefObject<Size>; grid: HitGrid | null
  hover: MutableRefObject<number | null>; invalidate: () => void; zoomBy: (f: number, at?: [number, number]) => void; panBy: (dx: number, dy: number) => void
  onTap: (i: number | null, touch: boolean) => void; onCentre: (i: number) => void; onMove: () => void
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)
  const { canvas, cam, size, grid, hover, invalidate, zoomBy, panBy, onTap, onCentre, onMove } = o
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const hit = (sx: number, sy: number, touch = false): number | null => {
    if (!grid) return null
    const [wx, wy] = toWorld(cam.current, size.current, sx, sy)
    // Room around the pointer: 12 px, 22 for a finger, at least the largest node.
    return grid.nearest(wx, wy, Math.max(nodeRadius(64, true, cam.current.k), touch ? 22 : 12) / cam.current.k).node
  }
  const setCursor = (c: string) => { if (canvas.current) canvas.current.style.cursor = c }
  const pinchOf = (pts: { x: number; y: number }[]) => ({ d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mid: [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] as [number, number] })
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    pointers.current.set(e.pointerId, { x: p[0], y: p[1] })
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const pts = [...pointers.current.values()]
    gesture.current = pts.length >= 2 ? { moved: true, x: p[0], y: p[1], cam: { ...cam.current }, pinch: pinchOf(pts) } : { moved: false, x: p[0], y: p[1], cam: { ...cam.current } }
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const gs = gesture.current
    if (!pointers.current.has(e.pointerId) || !gs) {
      if (e.pointerType !== 'mouse') return
      const h = hit(p[0], p[1])
      if (h === hover.current) return
      hover.current = h
      setCursor(h !== null ? 'pointer' : '')
      invalidate()
      return
    }
    pointers.current.set(e.pointerId, { x: p[0], y: p[1] })
    const pts = [...pointers.current.values()]
    if (gs.pinch && pts.length >= 2) {
      const now = pinchOf(pts)
      const k = clampZoom(gs.cam.k * (now.d / (gs.pinch.d || 1)))
      const [wx, wy] = toWorld(gs.cam, size.current, gs.pinch.mid[0], gs.pinch.mid[1])
      cam.current = { k, x: wx - (now.mid[0] - size.current.width / 2) / k, y: wy - (now.mid[1] - size.current.height / 2) / k }
      onMove()
      invalidate()
      return
    }
    const dx = p[0] - gs.x
    const dy = p[1] - gs.y
    if (!gs.moved && Math.hypot(dx, dy) < 5) return
    gs.moved = true
    onMove()
    cam.current = { ...gs.cam, x: gs.cam.x - dx / gs.cam.k, y: gs.cam.y - dy / gs.cam.k }
    setCursor('grabbing')
    invalidate()
  }
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const gs = gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) {
      // One finger left after a pinch: it pans from here.
      const [rest] = [...pointers.current.values()]
      gesture.current = { moved: true, x: rest.x, y: rest.y, cam: { ...cam.current } }
      return
    }
    gesture.current = null
    setCursor('')
    if (!gs || gs.moved || e.type === 'pointercancel') return
    const p = local(e)
    const touch = e.pointerType !== 'mouse'
    onTap(hit(p[0], p[1], touch), touch)
  }
  const onPointerLeave = () => {
    if (hover.current === null) return
    hover.current = null
    invalidate()
  }
  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const p = local(e)
    const i = hit(p[0], p[1])
    if (i !== null) onCentre(i)
  }
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      // A trackpad pinch (Ctrl) or a mouse wheel's steps zoom; a two-finger scroll pans (D4).
      const wheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY))
      if (e.ctrlKey || e.metaKey || wheel) {
        const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1
        zoomBy(Math.exp((-e.deltaY * unit) / (e.ctrlKey ? 100 : 500)), [e.clientX - r.left, e.clientY - r.top])
      } else panBy(e.deltaX, e.deltaY)
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [canvas, zoomBy, panBy])
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave, onDoubleClick }
}

export function GraphView({ graph, topic, topicKey, matches, hueOf, onOpen, onClosePane, persist = true, initialCentre = null, handle }: GraphViewProps) {
  const shown = usePlaced(graph, persist)
  const show = graphShow.use()
  const depth = graphDepth.use()
  const hover = useRef<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const [trail, setTrail] = useState<string[]>([])
  const [announce, setAnnounce] = useState('')
  const findAt = useRef(-1)
  const pendingCentre = useRef<string | null>(initialCentre)
  const fitted = useRef(false)

  const g = shown?.g ?? null
  const visible = useMemo(() => (g ? visibleMask(g, show) : new Uint8Array(0)), [g, show])
  const matchSet = useMemo(() => (matches ? new Set(matches) : null), [matches])
  const centreKey = trail.length ? trail[trail.length - 1] : null
  const centre = g && centreKey !== null ? g.at.get(centreKey) ?? null : null
  const lit = useMemo(() => (g ? litMask(g, { topic, matches: matchSet, centre, depth, visible }) : null), [g, topic, matchSet, centre, depth, visible])
  const grid = useMemo(() => (shown ? new HitGrid(shown.p.x, shown.p.y, visible) : null), [shown, visible])
  // A focused node that left the picture (hidden, deleted) loses focus.
  const focusIdx = g && focus !== null && focus < g.nodes.length && visible[focus] ? focus : null

  const view = useRef<View>({ shown, visible, lit, focus: focusIdx, centre, always: new Set() })
  const always = new Set<number>()
  if (g && matches) for (const k of matches.slice(0, 40)) { const i = g.at.get(k); if (i !== undefined) always.add(i) }
  if (g && centre !== null) for (const j of [centre, ...g.adj[centre]]) always.add(j)
  view.current = { shown, visible, lit, focus: focusIdx, centre, always }

  // What a resize fits again while the person has not moved the view (cleared by any move).
  const refit = useRef<(() => void) | null>(null)
  const { host, canvas, cam, size, draw, invalidate } = useCanvas(view, hover, hueOf, refit)
  const { moveTo: flyCamera, zoomBy: zoomCamera, panBy: panCamera, fit } = useCamera(cam, size, draw, invalidate)
  const moveTo = useCallback((to: Camera, animate?: boolean) => { refit.current = null; flyCamera(to, animate) }, [flyCamera])
  const zoomBy = useCallback((f: number, at?: [number, number]) => { refit.current = null; zoomCamera(f, at) }, [zoomCamera])
  const panBy = useCallback((dx: number, dy: number) => { refit.current = null; panCamera(dx, dy) }, [panCamera])
  useEffect(invalidate, [invalidate, shown, visible, lit, focusIdx, centre, matches])
  const fitAll = useCallback((animate = true) => {
    refit.current = () => fit(view.current.shown?.p, (i) => !!view.current.visible[i], false)
    fit(view.current.shown?.p, (i) => !!view.current.visible[i], animate)
  }, [fit])
  const flyTo = useCallback((i: number) => {
    const p = view.current.shown?.p
    if (p) moveTo({ x: p.x[i], y: p.y[i], k: Math.max(cam.current.k, 1.2) })
  }, [moveTo, cam])

  // ---- naming, focusing, centring ----
  const nameOf = (i: number) => {
    const n = g!.nodes[i]
    return t('{title}, {kind, select, note {note} task {task} other {project}}, {n, plural, one {# link} other {# links}}', { title: n.title.trim() || t('Untitled note'), kind: n.kind, n: g!.adj[i].length })
  }
  const focusNode = (i: number, say?: string) => {
    setFocus(i)
    setAnnounce(say ?? nameOf(i))
    const p = view.current.shown?.p
    if (!p) return
    // Keep the focused node in view.
    const [sx, sy] = toScreen(cam.current, size.current, p.x[i], p.y[i])
    if (sx < 40 || sy < 40 || sx > size.current.width - 40 || sy > size.current.height - 40) moveTo({ ...cam.current, x: p.x[i], y: p.y[i] })
  }
  const centreOn = (i: number) => {
    const key = g!.nodes[i].key
    setTrail((tr) => (tr[tr.length - 1] === key ? tr : [...tr, key]))
    focusNode(i)
    flyTo(i)
  }
  const back = () => {
    if (trail.length === 0) return false
    const next = trail.slice(0, -1)
    setTrail(next)
    const i = next.length && g ? g.at.get(next[next.length - 1]) : undefined
    if (i !== undefined) { focusNode(i); flyTo(i) }
    return true
  }

  // First drawing: fit what is drawn, then the centre asked for (Open in graph).
  useEffect(() => {
    if (!shown || fitted.current || !size.current.width) return
    fitted.current = true
    fitAll(false)
    const i = pendingCentre.current ? shown.g.at.get(pendingCentre.current) : undefined
    pendingCentre.current = null
    if (i !== undefined) centreOn(i)
  })
  // A new topic: fit what it lights (nothing moves, the view does).
  const lastTopic = useRef(topicKey)
  useEffect(() => {
    if (lastTopic.current === topicKey || !g) return
    lastTopic.current = topicKey
    const p = view.current.shown?.p
    if (topic) {
      const which = (i: number) => !!view.current.visible[i] && inTopic(g, i, topic)
      refit.current = () => fit(view.current.shown?.p, which, false)
      fit(p, which)
    } else fitAll()
  }, [topicKey, g, topic, fit, fitAll])

  useImperativeHandle(handle, () => ({
    find: (step) => {
      if (!g || !matches) return
      const list = matches.map((k) => g.at.get(k)).filter((i): i is number => i !== undefined && !!visible[i])
      if (!list.length) { setAnnounce(t('No note matches.')); return }
      findAt.current = (findAt.current + step + list.length) % list.length
      const i = list[findAt.current]
      focusNode(i, t('{at} of {n}: {title}', { at: findAt.current + 1, n: list.length, title: g.nodes[i].title.trim() || t('Untitled note') }))
      flyTo(i)
    },
  }))
  // A new search starts at its best match again.
  useEffect(() => { findAt.current = -1 }, [matches])

  const gestures = useGestures({
    canvas, cam, size, grid, hover, invalidate, zoomBy, panBy, onCentre: centreOn, onMove: () => { refit.current = null },
    onTap: (i, touch) => {
      if (i === null) {
        // The background: lights everything again.
        hover.current = null
        setFocus(null)
        invalidate()
      } else if (!touch || focusIdx === i) {
        focusNode(i)
        onOpen(g!.nodes[i])
      } else focusNode(i)
    },
  })

  // ---- the keyboard (D8) ----
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey || !g || !shown) return
    const done = () => { e.preventDefault(); e.stopPropagation() }
    const dir = ARROWS[e.key]
    if (dir) {
      done()
      // From nothing: the node nearest the middle of the view.
      const next = focusIdx === null ? grid?.nearestAny(cam.current.x, cam.current.y) ?? null : stepToward(g, shown.p.x, shown.p.y, visible, focusIdx, dir)
      if (next !== null) focusNode(next)
    } else if (e.key === 'Enter' && focusIdx !== null) { done(); onOpen(g.nodes[focusIdx]) }
    else if (e.key === ' ' && focusIdx !== null) { done(); centreOn(focusIdx) }
    else if (e.key === 'Backspace') { if (back()) done() }
    else if (e.key === '+' || e.key === '=') { done(); zoomBy(1.25) }
    else if (e.key === '-' || e.key === '_') { done(); zoomBy(0.8) }
    else if (e.key === '0') { done(); fitAll() }
    else if (e.key === 'Escape') {
      if (onClosePane()) done()
      else if (trail.length) { done(); setTrail([]) }
      else if (focusIdx !== null) { done(); setFocus(null) }
    }
  }

  const centreNode = centre !== null && g ? g.nodes[centre] : null
  const count = (m: Uint8Array | null) => (m ? m.reduce((n, v) => n + v, 0) : undefined)
  return (
    <div className="notes-graph" data-notes-graph data-ready={shown ? '' : undefined}>
      <div ref={host} role="application" aria-roledescription={t('graph')} aria-label={t('Graph of notes')} aria-describedby="notes-graph-keys" tabIndex={0}
        className="notes-graph__area" onKeyDown={onKeyDown} data-notes-graph-area data-nodes={shown ? count(visible) : undefined}
        data-focus={focusIdx !== null && g ? g.nodes[focusIdx].key : undefined} data-centre={centreKey ?? undefined} data-lit={count(lit)}>
        <canvas ref={canvas} className="notes-graph__canvas" aria-hidden="true" {...gestures} />
        {shown && !visible.includes(1) && <p className="notes-graph__empty text-body text-muted" data-notes-graph-empty>{t('No note links to another yet.')}</p>}
      </div>
      <p id="notes-graph-keys" className="sr-only">{t('Arrow keys move between linked notes, Enter opens, Space centres, Backspace goes back, plus and minus zoom, 0 fits.')}</p>
      <p className="sr-only" role="status" aria-live="polite" data-notes-graph-announce>{announce}</p>
      {centreNode && (
        <div className="notes-graph__centre" data-notes-graph-centre={centreNode.key}>
          <span className="user-text min-w-0 truncate text-meta text-default">{centreNode.title.trim() || t('Untitled note')}</span>
          <SegmentedControl<`${GraphDepth}`> label={t('Depth')} value={`${depth}`} onChange={(v) => graphDepth.set(Number(v) as GraphDepth)} data-notes-graph-depth={`${depth}`}
            options={[{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }]} />
          <IconButton icon="x" size="sm" label={t('Clear the centre')} onClick={() => setTrail([])} data-notes-graph-clear />
        </div>
      )}
      <div className="notes-graph__zoom">
        <IconButton icon="plus" size="sm" label={t('Zoom in')} shortcut="+" className="max-md:hidden" onClick={() => zoomBy(1.25)} data-notes-graph-zoom="in" />
        <IconButton icon="minus" size="sm" label={t('Zoom out')} shortcut="-" className="max-md:hidden" onClick={() => zoomBy(0.8)} data-notes-graph-zoom="out" />
        <IconButton icon="locate-fixed" size="sm" label={t('Fit to view')} shortcut="0" onClick={() => fitAll()} data-notes-graph-fit />
      </div>
    </div>
  )
}
