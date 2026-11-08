// Open tabs after a server upgrade (OpenSpec change client-sync-robustness).
// A tab keeps running the release it loaded. When the server moves on, three
// things tell it so: a lazily loaded chunk of the old release is gone
// (`vite:preloadError`), the service worker installed a verified new version
// (its `ready` message, OpenSpec change signed-web-app), or a newer tab upgrades
// the local database (Dexie `versionchange`, see db.ts). Each one leads to a
// reload, now or on the user's word, instead of a broken screen. Once refusal
// is on, the worker also says when it refused an update (`refused`): that one
// is shown with its cause and no reload.
import { useSyncExternalStore } from 'react'
import { databaseOutdated, onDatabaseOutdated } from './db'
import { createStore } from './store'
import { resettable } from './moduleState'
import { readString, writeString } from './deviceStorage'
import type { CheckResult } from './appTrust'

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

/** A refused update (signed-web-app D6): what the worker checked, and whether the device trusts its own key. */
export interface Refusal { check: CheckResult; ownKey: boolean }

const refusal = createStore<Refusal | null>('appRefusal', null)

/** The update the worker refused last, until dismissed; null otherwise. */
export const useRefusal = refusal.use
export const currentRefusal = refusal.get

/** Hides the refusal banner; Settings → About keeps the state. */
export function dismissRefusal(): void {
  refusal.set(null)
}

/** The time of the last refusal shown on this device: each refused list is announced once. */
const SHOWN_KEY = 'opentodo.refusalShown'

let shownAt: string | null = null
resettable('appRefusalShown', () => { shownAt = null })

function showRefusal(r: Refusal): void {
  const at = String(r.check.at)
  if (shownAt === at || readString(SHOWN_KEY) === at) return
  shownAt = at
  writeString(SHOWN_KEY, at) // storage unavailable: once per page instead
  refusal.set(r)
}

interface WorkerMessage { type?: string; state?: string; check?: CheckResult; ownKey?: boolean }

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
  // The worker checks for updates after navigations; a tab left open asks it
  // again when it comes back online or into focus (the worker checks at most once a minute).
  const ask = () => sw?.controller?.postMessage({ type: 'opentodo-app', check: true })
  win.addEventListener('online', ask)
  win.addEventListener('focus', ask)
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
    // The worker says when it installed a new version (`ready`) or refused one.
    // A new worker taking control is not itself a new version (it may have
    // refused the update, or the old worker installed it already), so the page
    // asks it, as it does on start: the worker answers with a refusal the page
    // may have missed while it reloaded. Each refusal is shown once.
    sw.addEventListener('controllerchange', ask)
    sw.addEventListener('message', (ev) => {
      const data = (ev as MessageEvent).data as WorkerMessage | null
      if (data?.type !== 'opentodo-app') return
      if (data.state === 'ready') set('release')
      else if (data.state === 'refused' && data.check) showRefusal({ check: data.check, ownKey: data.ownKey === true })
    })
    ask()
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
  refusal.set(null)
  shownAt = null
}
