// Pull to sync on a phone list (OpenSpec change phone-delight, design D3): at the top
// of the scroller a pull down shows a pill under the bar that follows the finger at
// half its distance; past PULL_ARM_PX of finger travel a tick plays once and the pill
// says to release; a release there asks for a sync at once and the pill follows the
// sync until it ends, then says how it ended for a moment. The list itself does not
// move: the scroller contains its overscroll, and nothing here prevents a scroll.
import { useEffect, useRef, useState } from 'react'
import { playHaptic } from '../lib/haptics'
import { syncNow } from '../lib/sync'

/** The finger's travel that arms the pull. */
export const PULL_ARM_PX = 64
/** How far the pill follows the finger at most. */
const PULL_MAX_PX = 80
/** How long the pill says how the sync ended. */
export const PULL_DONE_MS = 1200

export type PullPhase = 'idle' | 'pulling' | 'armed' | 'syncing' | 'done'
export interface PullState { phase: PullPhase; offset: number }

const IDLE: PullState = { phase: 'idle', offset: 0 }

/** The element the phone screens scroll in. */
function scroller(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('content')
}

/** Follows touches on the phone scroller while `on`; the state draws the pill. */
export function usePullToSync(on: boolean): PullState {
  const [state, setState] = useState<PullState>(IDLE)
  const busy = useRef(false)
  useEffect(() => {
    const el = scroller()
    if (!on || !el) return
    let startY: number | null = null
    let armed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const reset = () => { startY = null; armed = false; if (!busy.current) setState(IDLE) }
    const start = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || el.scrollTop > 0) { startY = null; return }
      startY = e.touches[0].clientY
      armed = false
    }
    const move = (e: TouchEvent) => {
      if (startY === null || busy.current) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0 || el.scrollTop > 0) { reset(); return }
      const now = dy >= PULL_ARM_PX
      if (now && !armed) playHaptic('tick')
      armed = now
      setState({ phase: now ? 'armed' : 'pulling', offset: Math.min(PULL_MAX_PX, dy / 2) })
    }
    const end = () => {
      if (startY === null || busy.current) return
      const fire = armed
      startY = null
      armed = false
      if (!fire) { setState(IDLE); return }
      busy.current = true
      setState({ phase: 'syncing', offset: PULL_ARM_PX / 2 })
      void syncNow().catch(() => {}).finally(() => {
        setState({ phase: 'done', offset: PULL_ARM_PX / 2 })
        timer = setTimeout(() => { busy.current = false; setState(IDLE) }, PULL_DONE_MS)
      })
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', reset)
      clearTimeout(timer)
      busy.current = false
    }
  }, [on])
  return state
}
