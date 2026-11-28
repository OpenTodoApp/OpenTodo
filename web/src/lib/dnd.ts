import { t } from './i18n'
import { playHaptic } from './haptics'
import { resettable } from './moduleState'
// Pointer-based drag and drop (OpenSpec `board-view`, design D6): native pointer
// events, no library, works with mouse, pen and touch. A mouse or pen drag starts
// after a few pixels of movement; touch arms after a short long-press so a plain
// swipe still scrolls the board — moving after the hold lifts the drag, releasing
// still opens the row's actions menu (task-row-context-menu "Touch: hold and
// release"). A ghost label follows the pointer, the element
// under it carrying `data-drop-target` is the target and gets `data-drop-active`
// for styling. The primitive knows nothing about tasks: callers decide what a drop
// means (board-view moves a task to a section; `manual-ordering` will add
// within-list placement through `onMove`).

export interface DragOptions {
  /** Text of the ghost that follows the pointer. */
  label: string
  /** Called on every move once lifted with the target key under the pointer (null: none). */
  onMove?: (target: string | null, x: number, y: number) => void
  /** Called once on release over a target (never for a cancelled drag). */
  onDrop: (target: string, x: number, y: number) => void
  /** Called once on a lifted release over no target (never for a cancelled drag). */
  onMiss?: (x: number, y: number) => void
  /** Called when the drag lifts (after the threshold or long-press). */
  onStart?: () => void
  /** Called after a drop or a cancel; the drag is over. */
  onEnd?: () => void
  /**
   * Touch only: the hold elapsed without the press moving (true) and ended without
   * becoming a drag (false, from cleanup) — the pressed element's held feedback.
   */
  onHoldChange?: (held: boolean) => void
  /** Touch only: the pressed row, marked while the finger is on it (HoldOptions.press). */
  press?: Element | null
  /** A touch hold completed and the finger lifted without moving: open the row's menu here, on a fine or a coarse primary pointer alike (task-row-context-menu; the grip owns selection, so the body's hold is only ever the menu). */
  onHoldRelease?: (x: number, y: number) => void
  /**
   * Also resolve `data-task-drop` targets (OpenSpec change ux-feedback-2, D4: a
   * task dropped on a sidebar project, the Inbox or a label), reported as
   * `drop:<value>` and preferred over a `data-drop-target` on the same element.
   */
  taskDrops?: boolean
  /**
   * Touch: the hold itself means something (phone-v2 D8, long press selects — from the
   * row's grip since the touch-row rework). It is called when the hold elapses instead
   * of lifting; the drag lifts only if the finger then moves, and a release without
   * moving swallows the click (the task does not open).
   */
  onHold?: () => void
  /**
   * The press began on the row's grip, not its body. A grip never scrolls (its own
   * `touch-action: none`), so any movement past the threshold lifts the drag without
   * waiting for the hold; the hold still means select, and a release without either
   * falls through to the grip's own click (a tap ticks).
   */
  grip?: boolean
}

/** Pixels a mouse or pen must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 5
/** Milliseconds a touch must rest before it becomes a drag. */
export const TOUCH_HOLD_MS = 350

/** The press a shared hold follows (task-row-context-menu). */
export interface HoldPress {
  pointerId: number
  pointerType: string
  clientX: number
  clientY: number
}

export interface HoldOptions {
  /** The hold elapsed without the press moving: the gesture is armed (its held feedback starts). */
  onArmed: () => void
  /** The armed hold ended without a release — `stop()`, called by the caller on movement or a cancel. */
  onEnd: () => void
  /**
   * The pressed row: marked `data-touch-press` from the touch until the hold ends, so
   * it can rise while it is held, before it arms (row-lift-overscroll D1).
   */
  press?: Element | null
}

export interface Hold {
  /** The hold elapsed and has not ended since. */
  armed: () => boolean
  /** End the hold now: `onEnd` runs once if it was armed, and never again. */
  stop: () => void
}

const PRESS_ATTR = 'data-touch-press'

// How many holds and lifted drags want the page still under the finger (drag-edge-scroll D1).
let holding = 0
let blocker = false
// The standing listener stays; only the count of holds resets.
resettable('dnd', () => { holding = 0 })
/**
 * One touchmove listener for the page's lifetime, not one per press: iOS WebKit decides
 * whether a touch may scroll from the listeners present when it starts, so a listener
 * added by the press itself cannot stop the page moving with the finger.
 */
function holdPage(): () => void {
  if (!blocker && typeof window !== 'undefined') {
    blocker = true
    window.addEventListener('touchmove', (ev) => { if (holding > 0 && ev.cancelable) ev.preventDefault() }, { passive: false })
  }
  holding++
  let done = false
  return () => { if (!done) { done = true; holding-- } }
}
// A touch device gets the listener when this module loads, before its first press.
if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) holdPage()()

/**
 * The touch hold both row gestures share (task-row-context-menu, design D1): after
 * TOUCH_HOLD_MS still it arms (`onArmed`, once), and `stop()` ends it (`onEnd`, once).
 * The caller owns the rest — movement and release mean something different to a drag
 * (lift) than to a row without one (end the hold), so each calls `stop()` when its own
 * move passes DRAG_THRESHOLD. While armed the page must not scroll under the finger.
 * A press that is not a touch never arms.
 */
export function trackHold(e: HoldPress, opts: HoldOptions): Hold {
  if (e.pointerType !== 'touch') return { armed: () => false, stop: () => undefined }
  let armed = false
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let release = () => {}
  const stop = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    opts.press?.removeAttribute(PRESS_ATTR)
    release()
    if (armed) {
      armed = false
      opts.onEnd()
    }
  }
  opts.press?.setAttribute(PRESS_ATTR, '')
  timer = setTimeout(() => {
    if (done) return
    armed = true
    release = holdPage()
    opts.onArmed()
  }, TOUCH_HOLD_MS)
  return { armed: () => armed, stop }
}

const ACTIVE = 'data-drop-active'

/** The drop target key at a point: the nearest ancestor with `data-drop-target` (or `data-task-drop`, as `drop:<value>`). */
export function dropTargetAt(x: number, y: number, doc: Document = document, taskDrops = false): string | null {
  const el = doc.elementFromPoint?.(x, y)
  if (!(el instanceof Element)) return null
  const task = taskDrops ? el.closest('[data-task-drop]') : null
  if (task) return `drop:${task.getAttribute('data-task-drop')}`
  const hit = el.closest('[data-drop-target]')
  return hit ? hit.getAttribute('data-drop-target') : null
}

/**
 * The keys an element answers to: its `data-drop-target`, and `drop:` and its
 * `data-task-drop`. An attribute it lacks gives no key, so a row with only one of
 * them (a viewer's project row has no task drop) never matches "no target".
 */
const keysOf = (el: Element): string[] => {
  const keys: string[] = []
  const target = el.getAttribute('data-drop-target')
  if (target !== null) keys.push(target)
  if (el.hasAttribute('data-task-drop')) keys.push(`drop:${el.getAttribute('data-task-drop')}`)
  return keys
}

function markActive(key: string | null): void {
  for (const el of document.querySelectorAll(`[${ACTIVE}]`)) {
    if (key === null || !keysOf(el).includes(key)) el.removeAttribute(ACTIVE)
  }
  if (key === null) return
  for (const el of document.querySelectorAll('[data-drop-target], [data-task-drop]')) {
    if (keysOf(el).includes(key)) el.setAttribute(ACTIVE, '')
  }
}

function makeGhost(label: string): HTMLElement {
  const g = document.createElement('div')
  g.textContent = label || t('Untitled')
  g.setAttribute('aria-hidden', 'true')
  g.setAttribute('data-drag-ghost', '')
  // physical: the ghost follows the pointer's screen coordinates (translate).
  g.className = 'pointer-events-none fixed left-0 top-0 z-50 max-w-60 truncate rounded-md border border-accent bg-surface px-2 py-1 text-sm shadow-lg'
  document.body.appendChild(g)
  return g
}

/** Swallow the click that follows a drop (or a held release), so it never also opens the task. */
export function swallowNextClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

/** How close to a scroller's top or bottom edge a lifted drag scrolls it, and its fastest step per frame (drag-edge-scroll D2). */
const EDGE_ZONE = 48
export const EDGE_STEP = 16

/** Sideways the zone is narrower (phone-board D2): on a phone the next column shows 35 px of itself, and a card held by its start should not turn the board. */
const SIDE_ZONE = 32
/** How long the pointer rests at the edge of a snapping scroller before it turns one column, and before each further one (phone-board D2). */
export const PAGE_ARM = 300
export const PAGE_DWELL = 700

/** The scroll step for a pointer at `y` in a scroller showing `top` to `bottom`: negative near the top, positive near the bottom, faster nearer the edge. */
export function edgeStep(y: number, top: number, bottom: number, edge = EDGE_ZONE): number {
  const zone = Math.min(edge, (bottom - top) / 4)
  if (zone <= 0) return 0
  if (y < top + zone) return -Math.ceil(EDGE_STEP * Math.min(1, (top + zone - y) / zone))
  if (y > bottom - zone) return Math.ceil(EDGE_STEP * Math.min(1, (y - (bottom - zone)) / zone))
  return 0
}

/** The scrollers a drag can scroll up and down: the main content, the sidebar's list, and one that asks for it (a board column's cards, phone-board D1). */
const SCROLLERS = '[data-main-scroller], [data-sidebar-scroll], [data-edge-scroll="y"]'
/** The scrollers a drag can scroll sideways: only one that asks for it (a board's row of columns). */
const SIDE_SCROLLERS = '[data-edge-scroll="x"]'

/** The step for `el` at `y`, when it can still move that way (a 1 px tolerance for fractional scroll positions). */
function edgeRoom(el: HTMLElement, y: number): number {
  const r = el.getBoundingClientRect()
  const step = edgeStep(y, Math.max(r.top, 0), Math.min(r.bottom, window.innerHeight))
  if (!step) return 0
  const room = step < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
  return room ? step : 0
}

/**
 * The scroller a pointer at (x, y) is near the edge of, with its step: the one holding the
 * element under the pointer (the open phone drawer's list, not the page behind it), else
 * by geometry the innermost one whose box holds the point and can still move that way, so
 * a bar floating over the list's bottom edge (the selection bar, the add button) does not
 * hide the list. Never a scroller inside an inert region, and never under a dialog.
 */
export function edgeScroller(x: number, y: number, doc: Document = document): { el: HTMLElement; step: number } | null {
  const under = doc.elementFromPoint?.(x, y)
  if (under?.closest('[data-overlay-root], [role="dialog"]')) return null
  const own = under?.closest<HTMLElement>(SCROLLERS)
  if (own && !own.closest('[inert]')) {
    const step = edgeRoom(own, y)
    if (step) return { el: own, step }
  }
  const inside = [...doc.querySelectorAll<HTMLElement>(SCROLLERS)].filter((el) => {
    if (el.closest('[inert]')) return false
    const r = el.getBoundingClientRect()
    return r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  })
  // Document order puts a nested scroller after the one around it: try the inner one first.
  for (const el of inside.reverse()) {
    const step = edgeRoom(el, y)
    if (step) return { el, step }
  }
  return null
}

/**
 * The neighbouring snap point (phone-board D2): of the scroll positions `starts` that put a
 * child at the scroller's start, each kept within `lo`..`hi`, the nearest one past `at`
 * towards `dir` (1: the right, -1: the left), or null at the end. A 1 px tolerance, as above.
 */
export function nextSnap(starts: readonly number[], at: number, dir: 1 | -1, lo: number, hi: number): number | null {
  let best: number | null = null
  for (const s of starts) {
    const p = Math.max(lo, Math.min(hi, s))
    if (dir > 0 ? p <= at + 1 : p >= at - 1) continue
    if (best === null || (dir > 0 ? p < best : p > best)) best = p
  }
  return best
}

/** A sideways scroller near the pointer: its step per frame, or `to`, the snap point it turns to when it snaps. */
export interface SideHit { el: HTMLElement; step: number; to?: number }

/**
 * The marked sideways scroller a pointer at (x, y) is near the left or right edge of, when
 * it can still move that way (phone-board D2): the innermost one whose box holds the point.
 * Never one in an inert region, and never under a dialog.
 */
export function sideScroller(x: number, y: number, doc: Document = document): SideHit | null {
  if (doc.elementFromPoint?.(x, y)?.closest('[data-overlay-root], [role="dialog"]')) return null
  for (const el of [...doc.querySelectorAll<HTMLElement>(SIDE_SCROLLERS)].reverse()) {
    if (el.closest('[inert]')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) continue
    const step = edgeStep(x, Math.max(r.left, 0), Math.min(r.right, window.innerWidth), SIDE_ZONE)
    if (!step) continue
    // Right to left the positions run from -max to 0; the edges stay the screen's.
    const style = getComputedStyle(el)
    const rtl = style.direction === 'rtl'
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const lo = rtl ? -max : 0, hi = rtl ? 0 : max
    const at = el.scrollLeft
    if (step < 0 ? at <= lo + 1 : at >= hi - 1) continue
    const snap = style.scrollSnapType ?? ''
    if (!/mandatory/.test(snap) || /^(y|block)\b/.test(snap)) return { el, step }
    const starts = [...el.children].filter((c) => { const a = getComputedStyle(c).scrollSnapAlign; return !!a && a !== 'none' })
      .map((c) => { const b = c.getBoundingClientRect(); return rtl ? b.right - r.right + at : b.left - r.left + at })
    const to = nextSnap(starts, at, step < 0 ? -1 : 1, lo, hi)
    if (to !== null) return { el, step, to }
  }
  return null
}

/**
 * Start tracking a press from an element's onPointerDown. Only the primary button
 * of a mouse starts a drag; presses on buttons inside the element (the completion
 * circle) still work because nothing happens until the pointer moves or holds.
 * Returns a cancel function.
 */
export function beginDrag(e: { pointerId: number; pointerType: string; button: number; clientX: number; clientY: number }, opts: DragOptions): () => void {
  if (e.pointerType === 'mouse' && e.button !== 0) return () => undefined
  const startX = e.clientX
  const startY = e.clientY
  let lifted = false
  /** phone-v2's hold selected this press: it belongs to the selection, not to the menu. */
  let heldSelected = false
  let ghost: HTMLElement | null = null
  let target: string | null = null
  let releasePage = () => {}
  let lastX = startX
  let lastY = startY
  let frame = 0
  // The shared hold (task-row-context-menu): it arms the drag instead of lifting it.
  const hold = trackHold(e, {
    onArmed: () => {
      // The hold arms: phone-v2's hold selects (and is remembered, so the release does
      // not open the menu); otherwise the release opens the row's menu.
      opts.onHoldChange?.(true)
      if (opts.onHold) {
        heldSelected = true
        opts.onHold()
      }
    },
    // Armed and not lifted any more: the tint hands over to the drag's own feedback (a lift), or simply ends (cleanup, a cancel).
    onEnd: () => opts.onHoldChange?.(false),
    press: opts.press,
  })

  const lift = () => {
    if (lifted) return
    lifted = true
    hold.stop()
    // haptic-kinds D2: the lift ticks on touch, once (a hold that selected ticked already).
    if (e.pointerType !== 'mouse' && !heldSelected) playHaptic('tick')
    if (e.pointerType === 'touch') releasePage = holdPage()
    ghost = makeGhost(opts.label)
    document.body.style.userSelect = 'none'
    opts.onStart?.()
  }
  const place = (x: number, y: number) => {
    if (ghost) ghost.style.transform = `translate(${x + 12}px, ${y + 8}px)`
    const next = dropTargetAt(x, y, document, opts.taskDrops)
    if (next !== target) {
      target = next
      markActive(target)
    }
    opts.onMove?.(target, x, y)
  }
  // Near a scroller's edge the list keeps scrolling under a still pointer, so a row
  // reaches places off screen; each step re-reads the target under the pointer.
  // Sideways a marked scroller moves too (phone-board D2): steadily, or one snap point at a
  // time after the pointer has rested at its edge; the target is re-read while it slides.
  let turn: { el: HTMLElement; dir: number; due: number } | null = null
  let settle = 0
  const scrollSide = (now: number): boolean => {
    const side = sideScroller(lastX, lastY)
    if (!side || side.to === undefined) turn = null
    if (!side) return false
    const { el, step, to } = side
    if (to === undefined) {
      const before = el.scrollLeft
      el.scrollLeft = before + step
      return el.scrollLeft !== before
    }
    const dir = Math.sign(step)
    if (!turn || turn.el !== el || turn.dir !== dir) turn = { el, dir, due: now + PAGE_ARM }
    else if (now >= turn.due) {
      turn.due = settle = now + PAGE_DWELL
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (el.scrollTo) el.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' })
      else el.scrollLeft = to
    }
    return true
  }
  const scrollEdge = () => {
    frame = 0
    if (!lifted) return
    const now = performance.now()
    let live = now < settle
    const hit = edgeScroller(lastX, lastY)
    if (hit) {
      const before = hit.el.scrollTop
      hit.el.scrollTop = before + hit.step
      if (hit.el.scrollTop !== before) live = true
    }
    if (scrollSide(now)) live = true
    if (!live) return
    place(lastX, lastY)
    frame = requestAnimationFrame(scrollEdge)
  }
  const follow = (x: number, y: number) => {
    lastX = x
    lastY = y
    place(x, y)
    if (!frame) frame = requestAnimationFrame(scrollEdge)
  }
  const cleanup = () => {
    hold.stop()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    releasePage()
    cancelAnimationFrame(frame)
    frame = 0
    ghost?.remove()
    // Only a lifted drag marks drop targets; a click (the completion circle) skips
    // looking for marks in the whole page, a 2,000-row list's (list-rendering-at-scale).
    if (lifted) markActive(null)
    document.body.style.userSelect = ''
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    if (!lifted) {
      const far = Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD
      if (e.pointerType === 'touch') {
        // A grip never scrolls: any movement past the threshold drags (task-row-context-menu follow-up).
        if (opts.grip) {
          if (!far) return
          lift()
          ev.preventDefault()
          follow(ev.clientX, ev.clientY)
          return
        }
        // Moving before the hold elapses is a scroll (or a swipe), not a drag; after a hold that selected, it carries the selection.
        if (!hold.armed()) { if (far) cancel(); return }
        if (!far) return
        lift()
        ev.preventDefault()
        follow(ev.clientX, ev.clientY)
        return
      }
      if (!far) return
      lift()
    }
    ev.preventDefault()
    follow(ev.clientX, ev.clientY)
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    const wasLifted = lifted
    const heldStill = hold.armed()
    const at = wasLifted ? dropTargetAt(ev.clientX, ev.clientY, document, opts.taskDrops) ?? target : null
    cleanup()
    if (!wasLifted) {
      // A touch held still and released is a long press: not a tap, and nothing was
      // dropped. On a fine pointer it opens the row's actions menu at the finger
      // (task-row-context-menu "Touch: hold and release"); a coarse pointer (a phone)
      // keeps the press as phone-v2 gave it — a selection, or nothing.
      if (heldStill && e.pointerType === 'touch') {
        swallowNextClick()
        // Every pointer (the grip took selection): a held release on the row body opens
        // its actions menu — on a phone as on a desktop. A grip press is never the menu's.
        if (!heldSelected && !opts.grip) opts.onHoldRelease?.(ev.clientX, ev.clientY)
      }
      return
    }
    swallowNextClick()
    if (at !== null) opts.onDrop(at, ev.clientX, ev.clientY)
    else opts.onMiss?.(ev.clientX, ev.clientY)
    opts.onEnd?.()
  }
  const cancel = () => {
    const wasLifted = lifted
    cleanup()
    if (wasLifted) opts.onEnd?.()
  }
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    ev.stopPropagation()
    cancel()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  return cancel
}
