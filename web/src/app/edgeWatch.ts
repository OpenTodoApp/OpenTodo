// The edge swipe's wiring for the shell (edge-swipe-back, swipe-back-follows), loaded
// lazily: watch the edge where the page should, and on a swipe go Back when the page has
// one, else open the menu. Unless motion is reduced, the page (or the closed menu)
// follows the finger: a released Back continues as the back transition from where the
// finger left the page, a cancelled swipe springs back.
import { edgeEnv } from './edgeEnv'
import { edgeSwipeAction, watchEdgeSwipe, watchesEdge, type EdgeFollower } from './edgeSwipe'
import { noMotion, prefersReducedMotion } from './motion'
import { NAV_FROM } from './pageTransition'

const SPRING = 'transform var(--duration-ui) var(--ease-spring)'

/** Puts an element back where it was, with the interface duration; clears what the drag set once it is there. */
function springBack(el: HTMLElement, clear: () => void): void {
  el.style.transition = SPRING
  el.style.transform = ''
  let once = false
  const done = () => { if (once) return; once = true; el.removeEventListener('transitionend', done); clear() }
  el.addEventListener('transitionend', done)
  setTimeout(done, 300)
}

/** The page body moves with the finger over the surface, with the page shadow (D2). */
export function pageFollower(page: HTMLElement): EdgeFollower {
  const clear = () => { page.style.transition = ''; page.style.boxShadow = '' }
  return {
    move(dx) {
      page.style.transition = 'none'
      page.style.boxShadow = 'var(--shadow-3)'
      page.style.transform = `translateX(${dx}px)`
    },
    settle(commit, dx) {
      if (!commit) return springBack(page, clear)
      // The back transition takes over from here (D1): its old page starts at this offset.
      document.documentElement.style.setProperty(NAV_FROM, `${dx}px`)
      page.style.transform = ''
      clear()
    },
  }
}

/** The closed phone menu slides out with the finger; a release that commits lets it finish opening. */
export function menuFollower(drawer: HTMLElement): EdgeFollower {
  const width = drawer.offsetWidth || 320
  const clear = () => { drawer.style.transition = '' }
  return {
    move(dx) {
      drawer.style.transition = 'none'
      drawer.style.transform = `translateX(${Math.min(0, dx - width)}px)`
    },
    settle(commit) {
      if (!commit) return springBack(drawer, clear)
      drawer.style.transform = ''
      clear()
    },
  }
}

/** From 768 px, where the phone bar has none: the page header's visible Back, or a task page's Close (which goes back to the list). */
export function headerBack(): (() => void) | undefined {
  const link = document.querySelector<HTMLElement>('#content :is([data-page-back], [data-task-close])')
  return link && link.offsetParent ? () => link.click() : undefined
}

const moves = () => !prefersReducedMotion() && !noMotion()

/** Starts watching (or not, in the installed web app on iOS); returns the stop. */
export function watchEdge(back: () => (() => void) | undefined, openMenu: () => void, enabled: () => boolean): () => void {
  if (!watchesEdge(edgeEnv())) return () => {}
  const drawer = () => document.querySelector<HTMLElement>('aside[data-sidebar]')
  const page = () => document.getElementById('content')
  return watchEdgeSwipe(() => edgeSwipeAction(back(), openMenu)(), enabled, {
    width: () => (back() ? window.innerWidth : drawer()?.offsetWidth || 320),
    follow: () => {
      // Reduced motion: the swipe acts on release, nothing follows (the spec's last rule).
      if (!moves()) return null
      const hasBack = !!back()
      const el = hasBack ? page() : drawer()
      if (!el) return null
      return hasBack ? pageFollower(el) : menuFollower(el)
    },
  })
}
