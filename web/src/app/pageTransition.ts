// Forward and back page transitions (OpenSpec change page-transitions, design D1 to D3).
// A route change runs inside a view transition with a direction: forward (deeper: a
// project, a task's page, a note, a settings section) slides the new page in from the
// end edge, back slides it out, and a switch between destinations cross-fades. The CSS is
// in index.css (`:root[data-nav]`); this module is loaded after the first paint, so a
// navigation before it arrives swaps at once, as before.
import { flushSync } from 'react-dom'
import { resettable } from '../lib/moduleState'
import { noMotion, prefersReducedMotion } from './motion'
import { parseRoute, setRouteShow, type Route } from './router'

export type NavDirection = 'forward' | 'back' | 'none'

/** How deep a route sits below the destinations of the sidebar and the tab bar (0). */
export function routeDepth(r: Route): number {
  switch (r.view) {
    case 'task': return 2
    case 'theme-editor': return 2
    case 'settings': return r.page ? 2 : r.section ? 1 : 0
    case 'project': case 'label': case 'place': case 'view': case 'import': return 1
    case 'notes': return r.id ? 1 : 0
    case 'rules': return r.id || r.create || r.run ? 1 : 0
    default: return 0
  }
}

/** The direction of a change from `from` to `to`; a step back through history is always back. */
export function navDirection(from: Route, to: Route, popped: boolean): NavDirection {
  if (popped) return 'back'
  const a = routeDepth(from)
  const b = routeDepth(to)
  return b > a ? 'forward' : b < a ? 'back' : 'none'
}

interface ViewTransition { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void>; skipTransition(): void }
type StartViewTransition = (update: () => void) => ViewTransition

function textFieldFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type))
}

// The input that came last. A view transition applies its change only after the browser
// has captured the old page, so keys typed straight after a shortcut (Escape, then j and c)
// would reach the page being left: a change made from the keyboard happens at once.
let keyboard = false
const fromKeyboard = () => { keyboard = true }
const fromPointer = () => { keyboard = false }

/** The gates list reflow uses (motion-v2 D4), and the last input not being a key. */
export function canTransitionPage(): boolean {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition
  return typeof start === 'function' && !keyboard && !prefersReducedMotion() && !noMotion() && !textFieldFocused() && document.visibilityState !== 'hidden'
}

let running: ViewTransition | null = null
resettable('pageTransition', () => { running = null; keyboard = false })

/** Shows a route change: inside a view transition with its direction when the gates hold, at once otherwise. */
export function showRouteChange(apply: () => void, from: string, to: string, popped: boolean): void {
  // The next navigation never waits: a transition still running jumps to its end.
  running?.skipTransition()
  if (!canTransitionPage()) { apply(); return }
  const root = document.documentElement
  root.dataset.nav = navDirection(parseRoute(from), parseRoute(to), popped)
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
  })
}

/** Installs the animated route change (main.tsx, after the first paint). */
export function installPageTransitions(): void {
  window.addEventListener('keydown', fromKeyboard, { capture: true, passive: true })
  window.addEventListener('pointerdown', fromPointer, { capture: true, passive: true })
  setRouteShow(showRouteChange)
}
