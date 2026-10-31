// Open tabs after a server upgrade (OpenSpec change client-sync-robustness).
// A tab keeps running the release it loaded. When the server moves on, three
// things tell it so: a lazily loaded chunk of the old release is gone
// (`vite:preloadError`), the new service worker takes control of the page
// (`controllerchange`), or a newer tab upgrades the local database
// (Dexie `versionchange`, see db.ts). Each one leads to a reload, now or on the
// user's word, instead of a broken screen.
import { useSyncExternalStore } from 'react'
import { databaseOutdated, onDatabaseOutdated } from './db'
import { createStore } from './store'
import { readString, writeString } from './deviceStorage'

/** Why this tab should reload: a newer release is installed, or it took over the database. */
export type UpdateReason = 'release' | 'database'

const reason = createStore<UpdateReason | null>('appUpdate', null)

function set(next: UpdateReason): void {
  // The database reason wins: this tab can no longer save anything.
  if (reason.get() !== 'database') reason.set(next)
}

/** The current reason to reload, or null while this tab is current. */
export function updateReason(): UpdateReason | null {
  return reason.get() ?? (databaseOutdated() ? 'database' : null)
}

export function useUpdateReason(): UpdateReason | null {
  return useSyncExternalStore(reason.subscribe, updateReason, () => null)
}

/** A chunk failed to load this long after the last automatic reload: ask instead of looping. */
const RELOAD_GUARD_MS = 10_000
const RELOAD_KEY = 'opentodo.chunkReloadAt'

function readReloadedAt(): number {
  return Number(readString(RELOAD_KEY, 'session') ?? 0) || 0
}

function markReload(now: number): void {
  writeString(RELOAD_KEY, String(now), 'session') // storage unavailable: the guard below still holds within this page
}

interface UpdateTarget {
  addEventListener: (type: string, fn: (ev: Event) => void) => void
  location: { reload: () => void }
}

/**
 * Listens for the signs of a newer release. A missing chunk reloads at once
 * (the screen that needed it cannot open otherwise), at most once in ten
 * seconds; a new service worker or database version shows the reload prompt,
 * so nothing being typed is lost. Offline, a chunk that fails to load says
 * nothing about a release: the error reaches its caller and the page stays
 * (a reload would open an empty page while the service worker is not in control).
 */
export function watchAppUpdates(win: UpdateTarget = window, sw: Pick<ServiceWorkerContainer, 'addEventListener' | 'controller'> | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined, now: () => number = Date.now, online: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine !== false): void {
  win.addEventListener('vite:preloadError', (ev) => {
    if (!online()) return
    const at = now()
    if (at - readReloadedAt() < RELOAD_GUARD_MS) {
      // Reloaded a moment ago and still missing: show the prompt (and let the
      // error reach the screen's boundary) instead of reloading in a loop.
      set('release')
      return
    }
    ev.preventDefault()
    markReload(at)
    win.location.reload()
  })
  if (sw) {
    // The first controller of a fresh install is not an update; only a change
    // from one worker to another is.
    let hadController = !!sw.controller
    sw.addEventListener('controllerchange', () => {
      if (hadController) set('release')
      hadController = true
    })
  }
  onDatabaseOutdated(() => set('database'))
}

/** Logs promise rejections nobody handled, so a lost write leaves a trace in the console. */
export function logUnhandledRejections(win: Pick<Window, 'addEventListener'> = window): void {
  win.addEventListener('unhandledrejection', (ev) => {
    console.error('OpenTodo: unhandled rejection', (ev as PromiseRejectionEvent).reason)
  })
}

/** Test hook. */
export function resetAppUpdate(): void {
  reason.set(null)
}
