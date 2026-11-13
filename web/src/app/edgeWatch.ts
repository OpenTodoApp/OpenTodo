// The edge swipe's wiring for the shell (edge-swipe-back), loaded lazily: watch the
// edge where the page should, and on a swipe go Back when the page has one, else
// open the menu.
import { edgeEnv } from './edgeEnv'
import { edgeSwipeAction, watchEdgeSwipe, watchesEdge } from './edgeSwipe'

/** Starts watching (or not, in the installed web app on iOS); returns the stop. */
export function watchEdge(back: () => (() => void) | undefined, openMenu: () => void, enabled: () => boolean): () => void {
  if (!watchesEdge(edgeEnv())) return () => {}
  return watchEdgeSwipe(() => edgeSwipeAction(back(), openMenu)(), enabled)
}
