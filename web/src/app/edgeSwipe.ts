// The edge swipe on phones (OpenSpec changes edge-swipe-menu and edge-swipe-back,
// GitHub issues 1232 and 1323): a touch that starts at the left edge and moves right
// goes back on a page with a Back (a task, a note, a nested page) and opens the menu
// on a top-level page, as in an iOS app. The installed web app on iOS keeps the
// system's own back swipe, so the watcher is off there. The row swipes leave that
// strip alone (rowSwipe.ts SWIPE.edge); the lock is theirs. With a follower
// (swipe-back-follows) the page or the menu moves with the finger while it drags.
// Right to left the swipe starts at the right edge and moves left (arabic-rtl D4).
import { fromStartEdge, inlineDelta } from '../lib/direction'
import { lockOf, SWIPE } from './rowSwipe'

/** What a right edge swipe does: Back when the page has one, else the menu. */
export function edgeSwipeAction(back: (() => void) | undefined, openMenu: () => void): () => void {
  return back ?? openMenu
}

/**
 * Whether the page itself should watch the edge: not in the installed web app on an
 * iPhone or iPad (Safari's standalone mode), which has the system's back swipe and no
 * way to turn it off, so a watcher would make one swipe do two things.
 */
export function watchesEdge(env: { shell: boolean; standalone: boolean; ios: boolean }): boolean {
  return env.shell || !(env.standalone && env.ios)
}

/**
 * Whether a release goes through (swipe-back-follows D3): past a third of `width` (the
 * screen for Back, the drawer for the menu), or a flick (faster than SWIPE.flick) past
 * the reveal distance, so a tablet's flick goes back as a phone's does.
 */
export function edgeCommits(dx: number, velocity: number, width: number): boolean {
  return dx >= width / 3 || (dx > SWIPE.reveal && velocity > SWIPE.flick)
}

/** What moves with the finger: `move` on every step of the drag, `settle` once on release or cancel. */
export interface EdgeFollower {
  move(dx: number): void
  settle(commit: boolean, dx: number): void
}

export interface EdgeOptions {
  /** The width a release is measured against; without it, three times the row's commit distance (the fixed 96 px of before). */
  width?: () => number
  /** What follows this drag, read when the swipe is taken; none with reduced motion. */
  follow?: () => EdgeFollower | null
}

/**
 * Listens for edge swipes on the window while `enabled()` says the swipe may act, and
 * calls `open` on a right swipe that commits (edgeCommits). Returns a function that
 * stops listening.
 */
export function watchEdgeSwipe(open: () => void, enabled: () => boolean, opts: EdgeOptions = {}): () => void {
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || fromStartEdge(e.clientX) >= SWIPE.edge || !enabled()) return
    const x0 = e.clientX
    const y0 = e.clientY
    let taken = false
    let dx = 0
    let last = { x: x0, t: performance.now() }
    let velocity = 0
    let follower: EdgeFollower | null = null
    let width = 3 * SWIPE.commit
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const cancel = () => {
      stop()
      follower?.settle(false, Math.max(0, dx))
    }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      dx = inlineDelta(ev.clientX - x0)
      if (!taken) {
        const lock = lockOf(dx, ev.clientY - y0)
        if (lock === 'scroll' || (lock === 'swipe' && dx < 0)) return stop()
        if (lock !== 'swipe') return
        taken = true
        width = opts.width?.() ?? width
        follower = opts.follow?.() ?? null
      }
      follower?.move(Math.max(0, dx))
      const now = performance.now()
      if (now > last.t) velocity = inlineDelta(ev.clientX - last.x) / (now - last.t)
      last = { x: ev.clientX, t: now }
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      stop()
      if (!taken) return
      const commit = edgeCommits(dx, velocity, width) && enabled()
      follower?.settle(commit, Math.max(0, dx))
      if (commit) open()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
  window.addEventListener('pointerdown', down, { passive: true })
  return () => window.removeEventListener('pointerdown', down)
}
