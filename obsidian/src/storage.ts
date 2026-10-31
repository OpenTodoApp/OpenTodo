// Per-device storage (obsidian-plugin D3): Obsidian's localStorage for this vault
// on this device, which no file-sync service carries to another device. The
// token, the install id, the outbox, the cached lists and a remembered key live
// here, never in data.json inside the vault.
import type { App } from 'obsidian'

export interface DeviceStorage {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const PREFIX = 'opentodo:'

/** Keys, in one place so Disconnect can clear them all. */
export const K = {
  server: 'server',
  token: 'token',
  account: 'account',
  installId: 'installId',
  outbox: 'outbox',
  projects: 'projects',
  labels: 'labels',
  listsAt: 'listsAt',
  key: 'key',
  clock: 'clock',
  sent: 'sent',
} as const

/** Everything Disconnect removes; the install id stays, so the device keeps its name. */
export const ACCOUNT_KEYS = [K.server, K.token, K.account, K.outbox, K.projects, K.labels, K.listsAt, K.key, K.clock, K.sent]

export function appStorage(app: App): DeviceStorage {
  return {
    get: <T>(key: string) => (app.loadLocalStorage(PREFIX + key) as T | null) ?? null,
    set: (key, value) => app.saveLocalStorage(PREFIX + key, value),
    remove: (key) => app.saveLocalStorage(PREFIX + key, null),
  }
}

export function memoryStorage(): DeviceStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: <T>(key: string) => (data.has(key) ? (structuredClone(data.get(key)) as T) : null),
    set: (key, value) => {
      if (value === null || value === undefined) data.delete(key)
      else data.set(key, structuredClone(value))
    },
    remove: (key) => data.delete(key),
  }
}

/** This device's id, made once: the op device is `obsidian:<install id>`. */
export function installId(store: DeviceStorage): string {
  let id = store.get<string>(K.installId)
  if (!id) {
    id = crypto.randomUUID()
    store.set(K.installId, id)
  }
  return id
}
