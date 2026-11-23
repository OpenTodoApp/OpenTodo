// Forward and back page transitions (OpenSpec changes page-transitions, design D1 to D3,
// and transitions-push-only D1, D2). A route change to or from a pushed page (a task's
// page, Settings and its sections and pages) runs inside a view transition with a
// direction: forward slides the new page in from the end edge, back slides it out. A
// change between list views applies at once, so the new list is never late for an
// animation. The CSS is in index.css (`:root[data-nav]`); this module is loaded after the
// first paint, so a navigation before it arrives swaps at once, as before.
import { flushSync } from 'react-dom'
import { resettable } from '../lib/moduleState'
import { noMotion, prefersReducedMotion } from './motion'
import { parseRoute, setRouteShow, type Route } from './router'
import { lastKeyAt } from './shortcuts/dispatch'

export type NavDirection = 'forward' | 'back' | 'none'

/** Where a back swipe left the page (swipe-back-follows D1): the old page's slide starts there, so the hand-off has no jump. */
export const NAV_FROM = '--nav-from'

/** How deep a route is pushed above the list views (0): Settings, its sections and pages, a task's page, the theme editor. */
export function routeDepth(r: Route): number {
  switch (r.view) {
    case 'settings': return r.page ? 3 : r.section ? 2 : 1
    case 'theme-editor': return 3
    case 'task': return 2
    default: return 0
  }
}

/** The direction of a change from `from` to `to`: none between list views or pushed pages of one depth, else a step back through history is always back. */
export function navDirection(from: Route, to: Route, popped: boolean): NavDirection {
  const a = routeDepth(from)
  const b = routeDepth(to)
  if (a === b) return 'none'
  if (popped) return 'back'
  return b > a ? 'forward' : 'back'
}

interface ViewTransition { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void>; skipTransition(): void }
type StartViewTransition = (update: () => void) => ViewTransition

function textFieldFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type))
}

// Whether a key came after the last tap or click. A view transition applies its change only
// after the browser has captured the old page, so keys typed straight after a shortcut
// (Escape, then j and c) would reach the page being left: a change made from the keyboard
// happens at once. The keys are the shortcut dispatcher's (one keydown listener).
let lastPointer = -Infinity
const fromPointer = () => { lastPointer = performance.now() }
const fromKeyboard = () => lastKeyAt() > lastPointer

/** The gates list reflow uses (motion-v2 D4), and the last input not being a key. */
export function canTransitionPage(): boolean {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition
  return typeof start === 'function' && !fromKeyboard() && !prefersReducedMotion() && !noMotion() && !textFieldFocused() && document.visibilityState !== 'hidden'
}

let running: ViewTransition | null = null
resettable('pageTransition', () => { running = null; lastPointer = -Infinity })

/** Shows a route change: inside a view transition with its direction when it has one and the gates hold, at once otherwise. */
export function showRouteChange(apply: () => void, from: string, to: string, popped: boolean): void {
  // The next navigation never waits: a transition still running jumps to its end.
  running?.skipTransition()
  const root = document.documentElement
  const dir = navDirection(parseRoute(from), parseRoute(to), popped)
  if (dir === 'none' || !canTransitionPage()) { apply(); root.style.removeProperty(NAV_FROM); return }
  root.dataset.nav = dir
  const start = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition.bind(document)
  const vt = start(() => flushSync(apply))
  running = vt
  // A skipped transition rejects `ready` (AbortError); the page has already changed, so that is not an error.
  void vt.ready?.catch(() => {})
  void vt.updateCallbackDone?.catch(() => {})
  void vt.finished.catch(() => {}).finally(() => {
    if (running !== vt) return
    running = null
    delete root.dataset.nav
    root.style.removeProperty(NAV_FROM)
  })
}

/** Installs the animated route change (main.tsx, after the first paint). */
export function installPageTransitions(): void {
  window.addEventListener('pointerdown', fromPointer, { capture: true, passive: true })
  setRouteShow(showRouteChange)
}
