// Profile pictures (OpenSpec change settings-refresh, design D10). The server
// serves a picture at a versioned address, cached for a year; the version comes
// from the shared projects' member lists (synced with every exchange) and, for
// the signed-in account, from its profile. Without a version the Avatar draws
// the initials. The own version is remembered on this device so the account menu
// shows the picture offline (the browser keeps the image in its cache).
import { useSyncExternalStore } from 'react'
import { useMemberships } from './localData'

const OWN_KEY = 'opentodo.avatar'

let own: { id: string; version: number } | null = readOwn()
const listeners = new Set<() => void>()

function readOwn(): { id: string; version: number } | null {
  try {
    const raw = localStorage.getItem(OWN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { id?: unknown; version?: unknown }
    return typeof v.id === 'string' && typeof v.version === 'number' ? { id: v.id, version: v.version } : null
  } catch {
    return null
  }
}

/** Records the signed-in account's picture version (from its profile). */
export function setOwnAvatar(id: string, version: number): void {
  own = { id, version }
  try { localStorage.setItem(OWN_KEY, JSON.stringify(own)) } catch { /* storage unavailable: memory only */ }
  listeners.forEach((fn) => fn())
}

/** Forgets the own version (sign-out). */
export function clearOwnAvatar(): void {
  own = null
  try { localStorage.removeItem(OWN_KEY) } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn())
}

/** The address of a picture at a version. */
export function avatarUrl(id: string, version: number): string {
  return `/api/v1/users/${encodeURIComponent(id)}/avatar?v=${version}`
}

/** The picture version of an account as this device knows it, 0 without one. */
export function avatarVersionOf(id: string, memberships: readonly { members: readonly { userId: string; avatarVersion?: number }[] }[], self = own): number {
  if (self && self.id === id) return self.version
  for (const m of memberships) {
    for (const p of m.members) if (p.userId === id && p.avatarVersion) return p.avatarVersion
  }
  return 0
}

/** The picture address for an account, or undefined when it has none. */
export function useAvatarSrc(id: string): string | undefined {
  const self = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => own, () => null)
  const memberships = useMemberships()
  const version = avatarVersionOf(id, memberships, self)
  return version > 0 ? avatarUrl(id, version) : undefined
}
