// The host the shared library runs in (OpenSpec change native-app-foundation, design
// D3). Modules the native app shares (mobile/app/shared-modules.json) ask the host
// for visibility, the network, the sync lock, the other tabs, device storage and
// IndexedDB, the languages, the time zone and the native shell through `platform`,
// never through browser globals; the repo check (scripts/shared-boundary.mjs)
// refuses a global in a listed module. The web implementation is today's browser
// code and is installed by default; the app installs its own at start-up, and a
// test may install a fake (reset before each test).
import { resettable } from './moduleState'
import type { OpenTodoShell } from './shell'

export interface Channel {
  post(message: unknown): void
  /** Receives the other side's messages; returns the unsubscribe function. */
  on(fn: (message: unknown) => void): () => void
  close(): void
}

/** Small text values under keys. Never throws: a read that fails is null, a write that fails returns false. */
export interface KeyValue {
  get(key: string): string | null
  /** Stores the value; null removes the key. Whether the storage took it. */
  set(key: string, value: string | null): boolean
  remove(key: string): void
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
  /**
   * Small device preferences that outlive a restart (localStorage on the web), and
   * a change another instance made (the `storage` event; the key, or null when all went).
   */
  prefs: KeyValue & { onChange(fn: (key: string | null) => void): () => void }
  /** Values for this instance only, gone when it closes (sessionStorage on the web). */
  session: KeyValue
  /** The device's preferred languages, most preferred first. */
  languages(): readonly string[]
  /** The interface language is now `code` (the page's language attribute on the web). */
  showLanguage(code: string): void
  /** The host's IndexedDB, if it has one (the service worker's share inbox lives there on the web). */
  indexedDB(): IDBFactory | undefined
  /** Asks the host to keep local data under storage pressure; whether it will. */
  persistStorage(): Promise<boolean>
  /** The bridge of a native shell around the web app (lib/shell.ts checks its shape), if any. */
  shell(): OpenTodoShell | undefined
  /** The device's IANA zone, and when to read it again (a travelling device). */
  timeZone: { current(): string; onChange(fn: () => void): () => void }
}

/** Calls fn with the page's visibility whenever it changes (absolute-datetimes D5 for dates.ts). */
export function onPageVisibility(fn: (visible: boolean) => void, doc: Document = document): () => void {
  const on = () => fn(doc.visibilityState === 'visible')
  doc.addEventListener('visibilitychange', on)
  return () => doc.removeEventListener('visibilitychange', on)
}

/** localStorage or sessionStorage, or null when missing (a worker, a test) or blocked. */
function webStorage(session: boolean): Storage | null {
  try {
    if (session) return typeof sessionStorage === 'undefined' ? null : sessionStorage
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function webKeyValue(session: boolean): KeyValue {
  const set = (key: string, value: string | null) => {
    try {
      const s = webStorage(session)
      if (!s) return false
      if (value === null) s.removeItem(key)
      else s.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
  return {
    get(key) {
      try { return webStorage(session)?.getItem(key) ?? null } catch { return null }
    },
    set,
    remove: (key) => { set(key, null) },
  }
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
  prefs: {
    ...webKeyValue(false),
    onChange(fn) {
      if (typeof window === 'undefined') return () => undefined
      const on = (e: StorageEvent) => fn(e.key)
      window.addEventListener('storage', on)
      return () => window.removeEventListener('storage', on)
    },
  },
  session: webKeyValue(true),
  languages() {
    if (typeof navigator === 'undefined') return ['en']
    return navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  },
  showLanguage(code) {
    if (typeof document !== 'undefined') document.documentElement.lang = code
  },
  indexedDB: () => typeof indexedDB === 'undefined' ? undefined : indexedDB,
  async persistStorage() {
    try {
      const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
      if (!storage?.persist) return false
      if (await storage.persisted?.()) return true
      return await storage.persist()
    } catch {
      return false
    }
  },
  shell: () => typeof window === 'undefined' ? undefined : window.opentodoShell,
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
