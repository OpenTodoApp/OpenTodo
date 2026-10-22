// Swipe actions on task rows (OpenSpec change phone-v2, design D3): a touch row
// follows the finger sideways once the move is clearly horizontal, shows the action
// it will take at the reveal distance and fires it at the commit distance or on a
// flick; anything shorter springs back. Pointer events only, beside the long-press
// drag of lib/dnd.ts: a hold without movement is still a drag, a swipe that began
// never is (dnd cancels a touch drag once the finger moves).

/** The gesture's numbers (design D3, "Gesture value" table). */
export const SWIPE = {
  /** Horizontal travel that takes the row, while the vertical travel stays under `lockY`. */
  lockX: 12,
  lockY: 8,
  /** The action is named. */
  reveal: 64,
  /** The action fires on release. */
  commit: 96,
  /** Or a release this fast (px per ms) past `reveal`. */
  flick: 0.5,
  /** Released or returned under this, nothing happens. */
  cancel: 32,
  /** The row never travels further. */
  max: 120,
  /** The return, in ms (the ui duration token). */
  returnMs: 120,
} as const

export type SwipeDir = 'right' | 'left'

/** Whether a move so far takes the row ('swipe'), belongs to the list ('scroll'), or is undecided. */
export function lockOf(dx: number, dy: number): 'swipe' | 'scroll' | null {
  if (Math.abs(dy) >= SWIPE.lockY) return 'scroll'
  if (Math.abs(dx) >= SWIPE.lockX) return 'swipe'
  return null
}

/** The row's offset for a finger travel: clamped to the maximum. */
export function offsetOf(dx: number): number {
  return Math.max(-SWIPE.max, Math.min(SWIPE.max, dx))
}

/** What a release does: fire the action in the swipe's direction, or spring back. */
export function releaseOf(dx: number, velocity: number): SwipeDir | null {
  const d = Math.abs(dx)
  if (d < SWIPE.cancel) return null
  if (d >= SWIPE.commit || (d > SWIPE.reveal && Math.abs(velocity) > SWIPE.flick)) return dx > 0 ? 'right' : 'left'
  return null
}

/** Whether the action is named at this travel. */
export const revealed = (dx: number): boolean => Math.abs(dx) >= SWIPE.reveal

export interface SwipeHandlers {
  /** Asked when the move locks: false leaves the row alone (a hold already selected it). */
  canStart?: () => boolean
  /** The gesture took the row, in this direction (once per gesture; the direction may flip). */
  onLock: (dir: SwipeDir) => void
  /** Every move while the row is taken: the clamped offset. */
  onMove: (offset: number) => void
  /** The release: the action to fire, or null for a return. */
  onEnd: (fire: SwipeDir | null) => void
}

/**
 * Follows a touch press on a row. Only touch and pen start a swipe; a mouse never
 * does. Returns a function that stops listening. While the row is taken, the next
 * click is swallowed so a swipe never also opens the task.
 */
export function beginSwipe(e: { pointerId: number; pointerType: string; clientX: number; clientY: number }, h: SwipeHandlers): () => void {
  if (e.pointerType === 'mouse') return () => undefined
  const x0 = e.clientX
  const y0 = e.clientY
  let state: 'pending' | 'swipe' | 'scroll' = 'pending'
  let dir: SwipeDir | null = null
  let dx = 0
  let last = { x: x0, t: performance.now() }
  let velocity = 0

  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    const mx = ev.clientX - x0
    if (state === 'pending') {
      const lock = lockOf(mx, ev.clientY - y0)
      if (lock === 'scroll') { state = 'scroll'; stop(); return }
      if (lock !== 'swipe') return
      if (h.canStart && !h.canStart()) { state = 'scroll'; stop(); return }
      state = 'swipe'
    }
    const now = performance.now()
    if (now > last.t) velocity = (ev.clientX - last.x) / (now - last.t)
    last = { x: ev.clientX, t: now }
    dx = mx
    const next: SwipeDir = dx >= 0 ? 'right' : 'left'
    if (next !== dir) { dir = next; h.onLock(next) }
    h.onMove(offsetOf(dx))
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    stop()
    if (state !== 'swipe') return
    swallowClick()
    h.onEnd(releaseOf(dx, velocity))
  }
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    stop()
    if (state === 'swipe') h.onEnd(null)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  return stop
}

function swallowClick(): void {
  const stopClick = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
  window.addEventListener('click', stopClick, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0)
}
