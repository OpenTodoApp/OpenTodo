// The host the shared library runs in (OpenSpec change native-app-foundation, design
// D3). Modules the native app shares (mobile/app/shared-modules.json) ask the host
// for visibility, the network, the sync lock, the other tabs, device preferences
// and the time zone through `platform`, never through browser globals; the repo
// check (scripts/shared-boundary.mjs) refuses a global in a listed module. The web
// implementation is today's browser code and is installed by default; the app
// installs its own at start-up, and a test may install a fake (reset before each test).
import { readString, removeItem, writeString } from './deviceStorage'
import { resettable } from './moduleState'

export interface Channel {
  post(message: unknown): void
  /** Receives the other side's messages; returns the unsubscribe function. */
  on(fn: (message: unknown) => void): () => void
  close(): void
}

export interface Platform {
  /** Whether the app is in front, and its changes (the page's visibility on the web). */
  visibility: { visible(): boolean; onChange(fn: (visible: boolean) => void): () => void }
  /** False only when the host knows it is offline; onOnline when the connection comes back. */
  network: { online(): boolean; onOnline(fn: () => void): () => void }
  /**
   * A lock shared with the other instances of the app on this device (Web Locks
   * across tabs), or null when there is no other instance to share with or no
   * channel to reach it: then this one leads at once.
   */
  readonly leader: { request<T>(name: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> } | null
  /** A channel to the other instances (BroadcastChannel), or null without one. */
  broadcast(name: string): Channel | null
  /** Small device preferences that outlive a restart (localStorage on the web). */
  prefs: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
  /** The device's IANA zone, and when to read it again (a travelling device). */
  timeZone: { current(): string; onChange(fn: () => void): () => void }
}

/** Calls fn with the page's visibility whenever it changes (absolute-datetimes D5 for dates.ts). */
export function onPageVisibility(fn: (visible: boolean) => void, doc: Document = document): () => void {
  const on = () => fn(doc.visibilityState === 'visible')
  doc.addEventListener('visibilitychange', on)
  return () => doc.removeEventListener('visibilitychange', on)
}

const web: Platform = {
  visibility: {
    visible: () => document.visibilityState === 'visible',
    onChange: (fn) => typeof window === 'undefined' ? () => undefined : onPageVisibility(fn),
  },
  network: {
    online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    onOnline(fn) {
      if (typeof window === 'undefined') return () => undefined
      window.addEventListener('online', fn)
      return () => window.removeEventListener('online', fn)
    },
  },
  get leader() {
    if (typeof navigator === 'undefined' || typeof BroadcastChannel === 'undefined') return null
    const locks = navigator.locks
    return typeof locks?.request === 'function'
      ? { request: <T>(name: string, fn: () => Promise<T>, signal?: AbortSignal) => locks.request(name, { signal }, fn) as Promise<T> }
      : null
  },
  broadcast(name) {
    if (typeof BroadcastChannel === 'undefined') return null
    const c = new BroadcastChannel(name)
    return {
      post: (m) => c.postMessage(m),
      on(fn) {
        c.onmessage = (e: MessageEvent) => fn(e.data)
        return () => { c.onmessage = null }
      },
      close: () => c.close(),
    }
  },
  prefs: { get: (k) => readString(k), set: (k, v) => { writeString(k, v) }, remove: (k) => removeItem(k) },
  timeZone: {
    current() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      } catch {
        return 'UTC'
      }
    },
    onChange: (fn) => onPageVisibility((visible) => visible && fn()),
  },
}

/** The host in use: the web's unless the app or a test installed another. */
export let platform: Platform = web

/** Installs the host's implementation (the app at start-up, a test for a fake). */
export function installPlatform(next: Platform): void {
  platform = next
}

resettable('platform', () => installPlatform(web))
