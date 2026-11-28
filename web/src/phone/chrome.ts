// What a phone screen tells the shell (OpenSpec change phone-ui-trial, design D2):
// that it draws its own bar, so the shell leaves its phone bar out while the screen
// is shown. A screen says so itself, because a route can show something else (a
// habit's page on the task route), which keeps the shell's bar.
import { createContext, useEffect } from 'react'
import { createStore } from '../lib/store'

const ownBar = createStore<number>('phoneOwnBar', 0)

/** Whether a phone screen with its own bar is shown. */
export function usePhoneOwnBar(): boolean {
  return ownBar.use() > 0
}

/** For a phone screen: it draws its own bar while mounted. */
export function useOwnBar(): void {
  useEffect(() => {
    ownBar.set(ownBar.get() + 1)
    return () => ownBar.set(Math.max(0, ownBar.get() - 1))
  }, [])
}

/** The day's progress a screen hands its bar (phone-delight D9): Today's done and total, shown next to the bar's title. */
export const BarProgressContext = createContext<{ done: number; total: number } | null>(null)
