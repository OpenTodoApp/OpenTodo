// The task page's composer is pinned with `position: sticky` to the bottom of the page's
// scroller. Chromium reveals the caret of a sticky field at the field's place in the
// flow, which is the end of the page, so every key typed in the composer scrolled the
// page there and the thread jumped under the reader (GitHub issue 1689). The pinned
// footer is in view wherever the page is scrolled, so the scroll a key starts there is
// undone; the reader's own scrolling (wheel, touch, a press) is left alone.
import { useEffect } from 'react'
import { scrollParent } from '../task-list/revealRow'

/** How long after a key in the footer a scroll of the page counts as the key's, in ms. */
export const KEY_SCROLL_MS = 600

export function useFooterKeepsScroll(footer: HTMLElement | null) {
  useEffect(() => {
    if (!footer) return
    let scroller: HTMLElement | null = null
    let keep = 0
    let until = 0
    const onScroll = () => {
      if (!scroller || performance.now() > until) return
      if (scroller.scrollTop !== keep) scroller.scrollTop = keep
    }
    const stop = () => { until = 0 }
    const onKey = (e: Event) => {
      // A shortcut (Ctrl or Cmd with a key: send, bold) is not typing, and sending scrolls
      // the new comment into view (CommentsTab).
      if (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey || e.altKey)) return stop()
      const next = scrollParent(footer)
      if (next !== scroller) {
        scroller?.removeEventListener('scroll', onScroll)
        for (const type of ['wheel', 'touchstart', 'pointerdown'] as const) scroller?.removeEventListener(type, stop)
        scroller = next
        scroller?.addEventListener('scroll', onScroll, { passive: true })
        for (const type of ['wheel', 'touchstart', 'pointerdown'] as const) scroller?.addEventListener(type, stop, { passive: true })
      }
      if (!scroller) return
      // A second key while the first one's scroll still runs keeps the place from before it.
      if (performance.now() > until) keep = scroller.scrollTop
      until = performance.now() + KEY_SCROLL_MS
    }
    footer.addEventListener('keydown', onKey, true)
    footer.addEventListener('beforeinput', onKey, true)
    return () => {
      footer.removeEventListener('keydown', onKey, true)
      footer.removeEventListener('beforeinput', onKey, true)
      scroller?.removeEventListener('scroll', onScroll)
      for (const type of ['wheel', 'touchstart', 'pointerdown'] as const) scroller?.removeEventListener(type, stop)
    }
  }, [footer])
}
