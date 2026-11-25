// How one phone screen follows another (OpenSpec change phone-ui-trial, design D6):
// opening a task pushes its page in from the end edge, the page's Back and the edge
// swipe slide it out. The browser's view transition does the drawing (the keyframes
// are in index.css, keyed on `data-phone-nav`); this file only says which way and
// waits for the new screen. Without the API, with reduced motion or in Display
// mode the screens simply change. The system's Back arrives as a history event that
// has already happened, so it returns without the slide.
import { noMotion, prefersReducedMotion } from '../app/motion'
import { openTaskPage, taskTrail } from '../app/taskTrail'

export type ScreenDirection = 'push' | 'pop'
interface Transition { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> }
type StartViewTransition = (update: () => Promise<void>) => Transition

/** How long the new screen may take to appear before the transition goes on with what is there. */
const SCREEN_WAIT_MS = 250
const STEP_MS = 16
const quiet = () => {}

/**
 * Wait until `shown` holds, in timer steps. Not animation frames: the browser draws no
 * frame while a view transition's update runs, so a frame callback would never come.
 */
function until(shown: () => boolean, limit = SCREEN_WAIT_MS): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now()
    const step = () => (shown() || Date.now() - started >= limit ? resolve() : void setTimeout(step, STEP_MS))
    setTimeout(step, 0)
  })
}

const screenShown = (name: string) => () => !!document.querySelector(`[data-phone-screen="${name}"]`)

/** Whether a change of screen is animated here. */
export function animatesScreens(): boolean {
  return typeof document !== 'undefined' && typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function'
    && !noMotion() && !prefersReducedMotion()
}

/**
 * Run `update` (a navigation) as a push or a pop. `update` may return a promise that ends
 * when the address has changed; `shown` says when the new screen is in the document.
 */
export function withScreenTransition(direction: ScreenDirection, update: () => void | Promise<void>, shown: () => boolean = () => true): void {
  if (!animatesScreens()) { void update(); return }
  const root = document.documentElement
  const done = () => { if (root.dataset.phoneNav === direction) delete root.dataset.phoneNav }
  root.dataset.phoneNav = direction
  try {
    const start = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition
    const transition = start.call(document, async () => { await update(); await until(shown) })
    // A transition the browser skips (a hidden tab, another one starting) rejects these; the screen has changed all the same.
    transition.ready?.catch(quiet)
    transition.updateCallbackDone?.catch(quiet)
    transition.finished.then(done, done)
  } catch {
    done()
    void update()
  }
}

/** Open a task from a phone list: its page pushes in. */
export function openTaskFromList(id: string): void {
  withScreenTransition('push', () => openTaskPage(id), screenShown('task'))
}

/** How long a Back waits for the history to move before the transition goes on without it. */
const BACK_WAIT_MS = 300

/**
 * Leave a pushed page: it slides out. `back` is the page's own way back, which either
 * changes the address at once or asks the history to go back, which arrives a moment
 * later. The list is put back where it was before the slide shows it, so it does not
 * come in at its top and jump.
 */
export function leaveScreen(back: () => void): void {
  const scroll = taskTrail()?.scroll ?? 0
  withScreenTransition('pop', async () => {
    await new Promise<void>((resolve) => {
      const before = location.pathname + location.search
      const timer = setTimeout(finish, BACK_WAIT_MS)
      function finish() { clearTimeout(timer); window.removeEventListener('popstate', finish); resolve() }
      window.addEventListener('popstate', finish)
      back()
      if (location.pathname + location.search !== before) finish()
    })
    await until(() => !document.querySelector('[data-phone-screen="task"]'))
    const content = document.getElementById('content')
    if (content && scroll > 0) {
      await until(() => content.scrollHeight - content.clientHeight >= scroll)
      content.scrollTop = scroll
    }
  })
}
