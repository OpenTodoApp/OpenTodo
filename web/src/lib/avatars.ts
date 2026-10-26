// Profile pictures (OpenSpec change settings-refresh, design D10). The server
// serves a picture at a versioned address, cached for a year; the version comes
// from the shared projects' member lists (synced with every exchange) and, for
// the signed-in account, from its profile. Without a version the Avatar draws
// the initials. The own version is remembered on this device so the account menu
// shows the picture offline (the browser keeps the image in its cache).
import { useMemberships } from './localData'
import { createStore } from './store'
import { readJSON, removeItem, writeJSON } from './deviceStorage'

const OWN_KEY = 'opentodo.avatar'

const own = createStore<{ id: string; version: number } | null>('ownAvatar', readOwn())

function readOwn(): { id: string; version: number } | null {
  return readJSON<{ id: string; version: number } | null>(OWN_KEY, null, (raw) => {
    const v = (raw ?? {}) as { id?: unknown; version?: unknown }
    return typeof v.id === 'string' && typeof v.version === 'number' ? { id: v.id, version: v.version } : null
  })
}

/** Records the signed-in account's picture version (from its profile). */
export function setOwnAvatar(id: string, version: number): void {
  const next = { id, version }
  writeJSON(OWN_KEY, next) // storage unavailable: memory only
  own.set(next)
}

/** Forgets the own version (sign-out). */
export function clearOwnAvatar(): void {
  removeItem(OWN_KEY)
  own.set(null)
}

/** The address of a picture at a version. */
export function avatarUrl(id: string, version: number): string {
  return `/api/v1/users/${encodeURIComponent(id)}/avatar?v=${version}`
}

/** The picture version of an account as this device knows it, 0 without one. */
export function avatarVersionOf(id: string, memberships: readonly { members: readonly { userId: string; avatarVersion?: number }[] }[], self = own.get()): number {
  if (self && self.id === id) return self.version
  for (const m of memberships) {
    for (const p of m.members) if (p.userId === id && p.avatarVersion) return p.avatarVersion
  }
  return 0
}

/** The picture address for an account, or undefined when it has none. */
export function useAvatarSrc(id: string): string | undefined {
  const self = own.use()
  const memberships = useMemberships()
  const version = avatarVersionOf(id, memberships, self)
  return version > 0 ? avatarUrl(id, version) : undefined
}
