// Whether the start guide was asked for again (OpenSpec change lean-chrome D5, D6;
// first-run "Three-step first run", open-loops "Choosing how you work in Settings").
// A tiny store after helpRequest.ts: Settings → Account → How you work calls
// openStartGuide(), and the guide the Shell mounts (app/FirstRun.tsx FirstRunGuide)
// opens over the current screen at its first step. Nothing is stored or synced:
// the request lives in memory on this device, and closing the guide clears it.
// The guide's own first-visit opening does not go through here; it follows the
// synced `first_run` preference (useFirstRun).
import { useSyncExternalStore } from 'react'

let requested = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Opens the start guide at its first step on this device. */
export function openStartGuide(): void {
  if (requested) return
  requested = true
  emit()
}

/** Closes a guide opened with openStartGuide (writes nothing). */
export function closeStartGuide(): void {
  if (!requested) return
  requested = false
  emit()
}

/** Whether the start guide was asked for and not closed since. */
export function useStartGuideRequest(): boolean {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => requested, () => false)
}
