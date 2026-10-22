// Instance branding (OpenSpec change instance-branding): the owner's name and
// logo for this server, read from `auth/status` on every profile read and
// mirrored on this device so the first paint and offline use show them too.
// Without branding the app shows its own mark and the name OpenTodo.
import { useSyncExternalStore } from 'react'

export interface Branding {
  /** The instance name shown in place of "OpenTodo"; empty for the default. */
  name: string
  /** Above 0, a logo is served at /branding/logo-<size>.png?v=<version>. */
  logoVersion: number
}

const KEY = 'opentodo.branding'
const NONE: Branding = { name: '', logoVersion: 0 }

const listeners = new Set<() => void>()
let current: Branding = read()

function read(): Branding {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return NONE
    const v = JSON.parse(raw) as Partial<Branding>
    return { name: typeof v.name === 'string' ? v.name : '', logoVersion: typeof v.logoVersion === 'number' ? v.logoVersion : 0 }
  } catch {
    return NONE
  }
}

/** Records the server's branding (absent on older servers: none). */
export function setBranding(b: Partial<Branding> | undefined): void {
  const next: Branding = { name: b?.name ?? '', logoVersion: b?.logoVersion ?? 0 }
  if (next.name === current.name && next.logoVersion === current.logoVersion) return
  current = next
  try {
    if (next.name || next.logoVersion) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch { /* storage unavailable: memory only */ }
  for (const l of listeners) l()
}

export function getBranding(): Branding {
  return current
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The branding, re-rendering when it changes. */
export function useBranding(): Branding {
  return useSyncExternalStore(subscribe, getBranding, () => NONE)
}

/** The instance name: the owner's, or OpenTodo. */
export function instanceName(b: Branding = current): string {
  return b.name || 'OpenTodo'
}

/** The address of the logo at one rendered size, or undefined without a logo. */
export function logoUrl(size: 32 | 180 | 192 | 512, b: Branding = current): string | undefined {
  return b.logoVersion > 0 ? `/branding/logo-${size}.png?v=${b.logoVersion}` : undefined
}
