// Whether the start guide was asked for again (OpenSpec change lean-chrome D5, D6;
// first-run "Three-step first run", open-loops "Choosing how you work in Settings").
// A tiny store after helpRequest.ts: Settings → Account → How you work calls
// openStartGuide(), and the guide the Shell mounts (app/FirstRun.tsx FirstRunGuide)
// opens over the current screen at its first step. Nothing is stored or synced:
// the request lives in memory on this device, and closing the guide clears it.
// The guide's own first-visit opening does not go through here; it follows the
// synced `first_run` preference (useFirstRun). The sidebar's "Start guide" entry
// (moments-and-onboarding D5) opens it at its last view, "Your first day".
import { useSyncExternalStore } from 'react'

export type StartGuideRequest = 'start' | 'first-day'
let requested: StartGuideRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Opens the start guide at its first step on this device. */
export function openStartGuide(): void {
  if (requested) return
  requested = 'start'
  emit()
}

/** Opens the start guide at its last view, the first-day checklist. */
export function openFirstDay(): void {
  if (requested === 'first-day') return
  requested = 'first-day'
  emit()
}

/** Closes a guide opened with openStartGuide (writes nothing). */
export function closeStartGuide(): void {
  if (!requested) return
  requested = null
  emit()
}

/** Where the start guide was asked to open, or null when it was not asked for (or closed since). */
export function useStartGuideRequest(): StartGuideRequest | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => requested, () => null)
}
