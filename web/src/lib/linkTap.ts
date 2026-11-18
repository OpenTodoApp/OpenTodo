// A tap on a link in the notes editor (OpenSpec change touch-note-links): on a touch
// screen a short tap that stays on one link opens it, as a tap on a link does
// everywhere else on a phone, instead of putting the caret there and raising the
// keyboard. A finger that moves (a scroll, a text selection) or stays down (a long
// press, which iOS keeps for its own menu) is not a tap. A mouse, a pen and a
// keyboard keep the editor's rules: a plain click places the caret, Ctrl or Cmd
// and a click opens.

/** Further than this a finger has moved: a scroll or a selection, not a tap. */
const SLOP_PX = 10
/** Longer than this a finger stayed down: a long press. */
const TAP_MS = 500

interface Start { x: number; y: number; at: number; link: HTMLAnchorElement }

type Touchy = Pick<TouchEvent, 'touches' | 'changedTouches' | 'target' | 'timeStamp'>

/** The link a touch starts on: an address the editor shows as a link, or a link node's chip. */
function linkAt(target: EventTarget | null): HTMLAnchorElement | null {
  const el = target as Element | null
  if (!el || typeof el.closest !== 'function') return null
  return el.closest('a[href]')
}

/** Follows the touches of one element; `end` answers the link a tap landed on, or null. */
export function linkTaps(): { start(e: Touchy): void; end(e: Touchy): HTMLAnchorElement | null } {
  let start: Start | null = null
  return {
    start(e) {
      const t = e.touches[0]
      const link = e.touches.length === 1 && t ? linkAt(e.target) : null
      start = link && t ? { x: t.clientX, y: t.clientY, at: e.timeStamp, link } : null
    },
    end(e) {
      const s = start
      start = null
      const t = e.changedTouches[0]
      if (!s || !t || e.touches.length > 0) return null
      if (Math.abs(t.clientX - s.x) > SLOP_PX || Math.abs(t.clientY - s.y) > SLOP_PX) return null
      if (e.timeStamp - s.at > TAP_MS) return null
      return linkAt(e.target) === s.link ? s.link : null
    },
  }
}
