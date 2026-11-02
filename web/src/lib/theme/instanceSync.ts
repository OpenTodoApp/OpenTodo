// Reading the server's themes again (OpenSpec change theme-instance-default, design
// D3): after sign-in when the version `auth/status` reports differs from the one
// this device remembers, and while the app is open when it comes back online or to
// the front (at most every five minutes). Lazy: the app imports it after sign-in;
// what the first frame needs is in choice.ts.
import { api } from '../api'
import { getInstanceThemes, setInstanceThemes } from './choice'

let pending: Promise<void> | null = null

/**
 * Reads the instance themes again when the server reports another version than
 * the one remembered (`version` from auth/status; absent on older servers: nothing).
 * Offline, or on a refused request, the remembered copy stays.
 */
export function refreshInstanceThemes(version: number | undefined, force = false): Promise<void> {
  if (!force && (typeof version !== 'number' || version === getInstanceThemes().version)) return Promise.resolve()
  pending ??= api.instanceThemes().then(setInstanceThemes, () => undefined).finally(() => { pending = null })
  return pending
}

const WATCH_INTERVAL_MS = 5 * 60_000
let lastCheck = 0
let watching = false

/**
 * Checks the version again when the device comes back online or the app comes
 * back to the front, at most every five minutes, so a change of the owner reaches
 * an app that stays open. Idempotent.
 */
export function watchInstanceThemes(now: () => number = Date.now): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  lastCheck = now()
  const check = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (now() - lastCheck < WATCH_INTERVAL_MS) return
    lastCheck = now()
    api.authStatus().then((s) => refreshInstanceThemes(s.themes?.version), () => undefined)
  }
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', check)
}

/** After sign-in: reads the instance themes when their version moved, and keeps checking while the app is open. */
export function followInstanceThemes(version: number | undefined): void {
  void refreshInstanceThemes(version)
  watchInstanceThemes()
}
