// Pull to sync on touch devices (OpenSpec change pull-to-sync, GitHub issue 1342): a
// finger that pulls the page's scroller down from its top asks for a sync now. Touch
// events only, so a mouse, a trackpad or a wheel never starts it, and listened to on
// the window only while one eligible touch is down: a list that is not at its top
// scrolls without this code running. The gesture leaves alone what another gesture
// owns: the row swipes and the edge swipe (a sideways move, the left strip), a lifted
// drag (its touchmove is already prevented), a scroller inside the page, a focused
// text field, a selection, a handle with `touch-action: none` and an open dialog.
import { SWIPE } from './rowSwipe'

/** The gesture's numbers. */
export const PULL = {
  /** Downward finger travel that takes the gesture. */
  lock: 12,
  /** The indicator moves this much per pixel of finger travel. */
  resistance: 0.5,
  /** Indicator travel from which a release syncs (the row swipes' reveal distance). */
  threshold: SWIPE.reveal,
  /** The indicator never travels further. */
  max: 96,
} as const

/** What is known when a finger lands. */
export interface PullStart {
  /** Fingers on the screen. */
  touches: number
  /** Where the finger landed, from the left edge. */
  x: number
  /** The page scroller's position. */
  scrollTop: number
  /** A pulled sync is still running. */
  busy: boolean
  /** A dialog or a sheet is open. */
  modal: boolean
  /** Text is selected. */
  selecting: boolean
  /** Something under the finger has its own vertical gesture (`ownsTouch`). */
  owned: boolean
}

/** Whether a touch may become a pull: one finger, on a page at its top, that nothing else owns. */
export function pullStarts(s: PullStart): boolean {
  return s.touches === 1 && s.scrollTop <= 0 && s.x >= SWIPE.edge && !s.busy && !s.modal && !s.selecting && !s.owned
}

/**
 * Whether the move so far is a pull, belongs to something else ('leave': a sideways
 * move is a row's or the edge's, a diagonal one is nobody's), or is undecided. A pull
 * is at least twice as far down as sideways.
 */
export function pullLockOf(dx: number, dy: number): 'pull' | 'leave' | null {
  if (Math.abs(dx) >= SWIPE.lockX) return 'leave'
  if (dy < PULL.lock) return null
  return dy >= 2 * Math.abs(dx) ? 'pull' : 'leave'
}

/** The indicator's travel for a finger travel: damped, never negative, clamped. */
export function pullOffset(dy: number): number {
  return Math.max(0, Math.min(PULL.max, dy * PULL.resistance))
}

/** Whether a release at this indicator travel syncs. */
export const pullFires = (offset: number): boolean => offset >= PULL.threshold

/**
 * Whether something between the touched element and the page scroller has its own
 * vertical gesture: a scroller with something to scroll, an element that told the
 * browser not to pan (a drag handle), the focused text field (its caret and
 * selection handles) or a dialog.
 */
export function ownsTouch(target: Element | null, scroller: Element): boolean {
  const active = scroller.ownerDocument.activeElement
  for (let el = target; el && el !== scroller; el = el.parentElement) {
    if (el === active && el.matches('input, textarea, select, [contenteditable]')) return true
    if (el.matches('[role="dialog"], [aria-modal="true"]')) return true
    const style = getComputedStyle(el)
    if (style.touchAction === 'none') return true
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return true
  }
  return false
}

export interface PullHandlers {
  /** A pulled sync is still running: a new pull does not start. */
  busy: () => boolean
  /** Every move once the gesture is a pull: the indicator's travel. */
  onPull: (offset: number) => void
  /** The pull ended: `fire` when it was released past the threshold. */
  onEnd: (fire: boolean) => void
}

const touchOf = (list: TouchList, id: number): Touch | undefined => Array.from(list).find((t) => t.identifier === id)

/**
 * Watches the page scroller for pulls. The scroller only gets a passive touchstart
 * listener; the move listeners exist while an eligible touch is down. Returns a
 * function that stops watching.
 */
export function watchPull(scroller: HTMLElement, h: PullHandlers): () => void {
  const doc = scroller.ownerDocument
  const win = doc.defaultView!
  // Ends the touch being followed, if any: its listeners go and a pull that began is called off.
  let abort: () => void = () => {}
  const start = (e: TouchEvent) => {
    abort()
    const first = e.touches[0]
    if (!first) return
    const selection = doc.getSelection()
    const eligible = pullStarts({
      touches: e.touches.length,
      x: first.clientX,
      scrollTop: scroller.scrollTop,
      busy: h.busy(),
      modal: !!doc.querySelector('[aria-modal="true"]'),
      selecting: !!selection && !selection.isCollapsed,
      owned: ownsTouch(e.target instanceof Element ? e.target : null, scroller),
    })
    if (!eligible) return
    const id = first.identifier
    const x0 = first.clientX
    const y0 = first.clientY
    let taken = false
    let offset = 0
    const end = (fire: boolean) => {
      abort = () => {}
      win.removeEventListener('touchmove', move)
      win.removeEventListener('touchend', up)
      win.removeEventListener('touchcancel', cancel)
      if (taken) h.onEnd(fire)
    }
    const move = (ev: TouchEvent) => {
      const p = touchOf(ev.touches, id)
      // A second finger (a pinch), a page that scrolled meanwhile, or a move another
      // gesture already took (a lifted drag prevents it) ends the pull.
      if (!p || ev.touches.length > 1 || scroller.scrollTop > 0 || ev.defaultPrevented) return end(false)
      const dy = p.clientY - y0
      if (!taken) {
        const lock = pullLockOf(p.clientX - x0, dy)
        if (lock === 'leave') return end(false)
        if (!lock) return
        taken = true
      }
      // The page stays put under the indicator (and a browser's own pull never starts).
      if (ev.cancelable) ev.preventDefault()
      offset = pullOffset(dy)
      h.onPull(offset)
    }
    const up = (ev: TouchEvent) => {
      if (!touchOf(ev.touches, id)) end(pullFires(offset))
    }
    const cancel = () => end(false)
    win.addEventListener('touchmove', move, { passive: false })
    win.addEventListener('touchend', up)
    win.addEventListener('touchcancel', cancel)
    abort = cancel
  }
  scroller.addEventListener('touchstart', start, { passive: true })
  return () => {
    abort()
    scroller.removeEventListener('touchstart', start)
  }
}
