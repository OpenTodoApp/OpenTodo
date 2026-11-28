// The day closes on a phone (OpenSpec change phone-delight, design D1): the moment
// Today's last open task is completed, the phone plays the success haptic once.
import { useEffect, useRef } from 'react'
import { playHaptic } from '../lib/haptics'

/** How long after the last completion the day's success plays: once that row has folded away (phone-delight D1). */
export const DAY_CLOSED_DELAY_MS = 400

/**
 * Today's last open task completed while Today is on screen: the success haptic plays once, after
 * the row's own feedback (phone-delight D1). Only a completion counts: the day's done count must
 * have grown since Today last had an open task, so moving the last task away plays nothing, and
 * opening a Today that is already empty plays nothing.
 */
export function useDayClosed(on: boolean, open: number, done: number): void {
  const before = useRef<{ open: number; done: number } | null>(null)
  const doneNow = useRef(done)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { doneNow.current = done }, [done])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const prev = before.current
    before.current = on ? { open, done: open > 0 ? doneNow.current : prev?.done ?? doneNow.current } : null
    if (!on || !prev || prev.open === 0 || open > 0) return
    const was = prev.done
    // The done count can arrive a render after the list empties; it is read when the moment comes.
    timer.current = setTimeout(() => { if (doneNow.current > was) playHaptic('success') }, DAY_CLOSED_DELAY_MS)
  }, [on, open])
}
