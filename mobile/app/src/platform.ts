// The shared library's platform port in the app (OpenSpec change native-app-foundation
// D3), over the host that src/host.ts reads from React Native (AppState, NetInfo,
// MMKV, expo-localization). One process, so no leader lock and no broadcast
// channel: the app leads at once.
import type { Platform } from '@shared/platform'

/** What the app's platform reads from React Native; tests pass fakes. */
export interface Host {
  appState(): string
  onAppState(fn: (state: string) => void): () => void
  /** Calls fn with false when the device knows it is offline, true when it is connected. */
  onConnected(fn: (connected: boolean) => void): () => void
  storage: { getString(k: string): string | undefined; set(k: string, v: string): void; remove(k: string): void }
  timeZone(): string | null
}

export function createPlatform(host: Host): Platform {
  // Unknown until NetInfo answers: online, as on the web ("false only when the host knows").
  let connected = true
  const online = new Set<() => void>()
  host.onConnected((now) => {
    const was = connected
    connected = now
    if (now && !was) for (const fn of [...online]) fn()
  })
  const visible = () => host.appState() === 'active'
  return {
    visibility: {
      visible,
      onChange: (fn) => host.onAppState((s) => fn(s === 'active')),
    },
    network: {
      online: () => connected,
      onOnline(fn) {
        online.add(fn)
        return () => { online.delete(fn) }
      },
    },
    leader: null,
    broadcast: () => null,
    prefs: {
      get: (k) => host.storage.getString(k) ?? null,
      set: (k, v) => host.storage.set(k, v),
      remove: (k) => host.storage.remove(k),
    },
    timeZone: {
      current: () => host.timeZone() || 'UTC',
      // A travelling phone: read the zone again whenever the app comes to the front.
      onChange: (fn) => host.onAppState((s) => { if (s === 'active') fn() }),
    },
  }
}
