// Instance branding (OpenSpec change instance-branding): the owner's name and
// logo for this server, read from `auth/status` on every profile read and
// mirrored on this device so the first paint and offline use show them too.
// Without branding the app shows its own mark and the name OpenTodo.
import { createStore } from './store'
import { readJSON, writeString } from './deviceStorage'

export interface Branding {
  /** The instance name shown in place of "OpenTodo"; empty for the default. */
  name: string
  /** Above 0, a logo is served at /branding/logo-<size>.png?v=<version>. */
  logoVersion: number
}

const KEY = 'opentodo.branding'
const NONE: Branding = { name: '', logoVersion: 0 }

const store = createStore<Branding>('branding', read())

function read(): Branding {
  return readJSON<Branding>(KEY, NONE, (raw) => {
    if (raw === null || typeof raw !== 'object') return null
    const v = raw as Partial<Branding>
    return { name: typeof v.name === 'string' ? v.name : '', logoVersion: typeof v.logoVersion === 'number' ? v.logoVersion : 0 }
  })
}

/** Records the server's branding (absent on older servers: none). */
export function setBranding(b: Partial<Branding> | undefined): void {
  const next: Branding = { name: b?.name ?? '', logoVersion: b?.logoVersion ?? 0 }
  const current = store.get()
  if (next.name === current.name && next.logoVersion === current.logoVersion) return
  // Storage unavailable: memory only.
  writeString(KEY, next.name || next.logoVersion ? JSON.stringify(next) : null)
  store.set(next)
}

export const getBranding = store.get

/** The branding, re-rendering when it changes. */
export const useBranding = store.use

/** The instance name: the owner's, or OpenTodo. */
export function instanceName(b: Branding = store.get()): string {
  return b.name || 'OpenTodo'
}

/** The address of the logo at one rendered size, or undefined without a logo. */
export function logoUrl(size: 32 | 180 | 192 | 512, b: Branding = store.get()): string | undefined {
  return b.logoVersion > 0 ? `/branding/logo-${size}.png?v=${b.logoVersion}` : undefined
}
