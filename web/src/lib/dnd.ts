import { t } from './i18n'
// Pointer-based drag and drop (OpenSpec `board-view`, design D6): native pointer
// events, no library, works with mouse, pen and touch. A mouse or pen drag starts
// after a few pixels of movement; touch starts after a short long-press so a plain
// swipe still scrolls the board. A ghost label follows the pointer, the element
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
   * Also resolve `data-task-drop` targets (OpenSpec change ux-feedback-2, D4: a
   * task dropped on a sidebar project, the Inbox or a label), reported as
   * `drop:<value>` and preferred over a `data-drop-target` on the same element.
   */
  taskDrops?: boolean
}

/** Pixels a mouse or pen must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 5
/** Milliseconds a touch must rest before it becomes a drag. */
export const TOUCH_HOLD_MS = 350

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

/** The key an element answers to: its `data-drop-target`, or `drop:` and its `data-task-drop`. */
const keysOf = (el: Element) => [el.getAttribute('data-drop-target'), el.hasAttribute('data-task-drop') ? `drop:${el.getAttribute('data-task-drop')}` : null]

function markActive(key: string | null): void {
  for (const el of document.querySelectorAll(`[${ACTIVE}]`)) {
    if (!keysOf(el).includes(key)) el.removeAttribute(ACTIVE)
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

/** Swallow the click that follows a drop, so dropping never also opens the task. */
function swallowNextClick(): void {
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
  let ghost: HTMLElement | null = null
  let target: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const lift = () => {
    if (lifted) return
    lifted = true
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
    clearTimeout(timer)
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
        // Moving before the hold elapses is a scroll, not a drag.
        if (far) cancel()
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
    const at = wasLifted ? dropTargetAt(ev.clientX, ev.clientY, document, opts.taskDrops) ?? target : null
    cleanup()
    if (!wasLifted) return
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
  // While a touch drag is lifted the page must not scroll under the finger.
  const blockScroll = (ev: TouchEvent) => {
    if (lifted) ev.preventDefault()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  window.addEventListener('touchmove', blockScroll, { passive: false })
  if (e.pointerType === 'touch') {
    timer = setTimeout(() => {
      lift()
      place(startX, startY)
    }, TOUCH_HOLD_MS)
  }
  return cancel
}
