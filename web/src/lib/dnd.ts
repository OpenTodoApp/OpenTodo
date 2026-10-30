import { t } from './i18n'
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
  /** Called when the drag lifts (after the threshold or long-press). */
  onStart?: () => void
  /** Called after a drop or a cancel; the drag is over. */
  onEnd?: () => void
  /**
   * Touch only: the hold elapsed without the press moving (true) and ended without
   * becoming a drag (false, from cleanup) — the pressed element's held feedback.
   */
  onHoldChange?: (held: boolean) => void
  /** Touch only: a hold completed and the finger lifted without moving: open the row's menu here (task-row-context-menu). */
  onHoldRelease?: (x: number, y: number) => void
  /**
   * Also resolve `data-task-drop` targets (OpenSpec change ux-feedback-2, D4: a
   * task dropped on a sidebar project, the Inbox or a label), reported as
   * `drop:<value>` and preferred over a `data-drop-target` on the same element.
   */
  taskDrops?: boolean
  /**
   * Touch: the hold itself means something (phone-v2 D8, long press selects). It is
   * called when the hold elapses instead of lifting; the drag lifts only if the finger
   * then moves, and a release without moving swallows the click (the task does not open).
   */
  onHold?: () => void
}

/** Pixels a mouse or pen must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 5
/** Milliseconds a touch must rest before it becomes a drag. */
export const TOUCH_HOLD_MS = 350

/**
 * True when the primary pointer is a fine one (a mouse, a trackpad, a precise pen).
 * The row's hold menu is for a fine pointer only: a coarse one (a phone) keeps its
 * own long-press meaning — tick the row, or scroll (task-row-context-menu).
 */
export function finePointer(): boolean {
  return typeof window === 'undefined' || window.matchMedia?.('(pointer: fine)').matches !== false
}

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
}

export interface Hold {
  /** The hold elapsed and has not ended since. */
  armed: () => boolean
  /** End the hold now: `onEnd` runs once if it was armed, and never again. */
  stop: () => void
}

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
  const blockScroll = (ev: TouchEvent) => { if (armed) ev.preventDefault() }
  const stop = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    window.removeEventListener('touchmove', blockScroll)
    if (armed) {
      armed = false
      opts.onEnd()
    }
  }
  timer = setTimeout(() => {
    if (done) return
    armed = true
    opts.onArmed()
  }, TOUCH_HOLD_MS)
  window.addEventListener('touchmove', blockScroll, { passive: false })
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
  })

  const lift = () => {
    if (lifted) return
    lifted = true
    hold.stop()
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
  const cleanup = () => {
    hold.stop()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('touchmove', blockScroll)
    ghost?.remove()
    markActive(null)
    document.body.style.userSelect = ''
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    if (!lifted) {
      const far = Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD
      if (e.pointerType === 'touch') {
        // Moving before the hold elapses is a scroll (or a swipe), not a drag; after a hold that selected, it carries the selection.
        if (!hold.armed()) { if (far) cancel(); return }
        if (!far) return
        lift()
        ev.preventDefault()
        place(ev.clientX, ev.clientY)
        return
      }
      if (!far) return
      lift()
    }
    ev.preventDefault()
    place(ev.clientX, ev.clientY)
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
        if (!heldSelected && finePointer()) opts.onHoldRelease?.(ev.clientX, ev.clientY)
      }
      return
    }
    swallowNextClick()
    if (at !== null) opts.onDrop(at, ev.clientX, ev.clientY)
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
  // While a touch drag is lifted the page must not scroll under the finger; while it
  // is merely armed, trackHold blocks the scroll for both holders of a hold.
  const blockScroll = (ev: TouchEvent) => {
    if (lifted) ev.preventDefault()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  window.addEventListener('touchmove', blockScroll, { passive: false })
  return cancel
}
