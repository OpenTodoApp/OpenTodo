// Whether the start guide was asked for again (OpenSpec change lean-chrome D5, D6;
// first-run "Three-step first run", open-loops "Choosing how you work in Settings").
// A tiny store after helpRequest.ts: Settings → Account → How you work calls
// openStartGuide(), and the guide the Shell mounts (app/FirstRun.tsx FirstRunGuide)
// opens over the current screen at its first step. Nothing is stored or synced:
// the request lives in memory on this device, and closing the guide clears it.
// The guide's own first-visit opening does not go through here; it follows the
// synced `first_run` preference (useFirstRun). The sidebar's "Start guide" entry
// (moments-and-onboarding D5) opens it at its last view, "Your first day".
import { createStore } from './store'

export type StartGuideRequest = 'start' | 'first-day'
const store = createStore<StartGuideRequest | null>('startGuide', null)

/** Opens the start guide at its first step on this device (an open guide stays where it is). */
export function openStartGuide(): void {
  if (!store.get()) store.set('start')
}

/** Opens the start guide at its last view, the first-day checklist. */
export function openFirstDay(): void {
  store.set('first-day')
}

/** Closes a guide opened with openStartGuide (writes nothing). */
export function closeStartGuide(): void {
  store.set(null)
}

/** Where the start guide was asked to open, or null when it was not asked for (or closed since). */
export const useStartGuideRequest = store.use
