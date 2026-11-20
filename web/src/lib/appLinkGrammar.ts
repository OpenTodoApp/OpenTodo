// The grammar of links to other apps (OpenSpec change app-links, design D2),
// with no dependency so lib/markdown.ts and lib/taskOrigin.ts (shared with the
// native app) can use it: internal/origin/applink.go's rules, pinned by the
// shared vectors internal/origin/testdata/app_links.vectors.json.
import type { UserPrefs } from './types'

export const MAX_APP_LINK_SCHEMES = 20
const MAX_URL = 2048

/** Schemes that never open as app links and are refused in the list (D2). */
export const DENIED_SCHEMES: readonly string[] = ['javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'filesystem', 'view-source', 'intent', 'opentodo']
/** Schemes with their own rules, never app links. */
const OWN_RULES: readonly string[] = ['http', 'https', 'mailto']

const APP_LINK = /^([A-Za-z][A-Za-z0-9+.-]{0,31}):(.+)$/
const ENTRY = /^([a-z][a-z0-9+.-]{0,31})(?::([a-z0-9][a-z0-9-]{0,31}))?$/

/** The lower-cased scheme of an app link, or null when `raw` is not one. */
export function appLinkScheme(raw: string): string | null {
  if (!raw || new TextEncoder().encode(raw).length > MAX_URL) return null
  // No whitespace or control character anywhere.
  if (/[\u0000- \u007f]/.test(raw)) return null
  const m = APP_LINK.exec(raw)
  if (!m) return null
  const scheme = m[1].toLowerCase()
  return DENIED_SCHEMES.includes(scheme) || OWN_RULES.includes(scheme) ? null : scheme
}

export const isAppLink = (raw: string): boolean => appLinkScheme(raw) !== null

/** Whether an entry may be on the list: a lower-case scheme, optionally `scheme:action`, not denied. */
export function validSchemeEntry(entry: string): boolean {
  const m = ENTRY.exec(entry)
  return !!m && !DENIED_SCHEMES.includes(m[1]) && !OWN_RULES.includes(m[1])
}

/** Whether the list lets `raw` open: its scheme, or `scheme:action` matching the part before `?`, `/` or `#`. */
export function allowsAppLink(list: readonly string[], raw: string): boolean {
  const scheme = appLinkScheme(raw)
  if (!scheme) return false
  const action = raw.slice(scheme.length + 1).replace(/^\/\//, '').split(/[?/#]/, 1)[0].toLowerCase()
  return list.some((e) => {
    if (!validSchemeEntry(e)) return false
    const [s, a] = e.split(':')
    return s === scheme && (a === undefined || a === action)
  })
}

/** The stored list as this device reads it: valid entries only, at most 20; none when unreadable or locked. */
export function readAppLinkSchemes(row: (Partial<UserPrefs> & { _e2ee?: { raw?: Record<string, unknown> } }) | null | undefined, locked = false): string[] {
  const v = row?.app_link_schemes
  if (locked || typeof v !== 'string' || !v || row?._e2ee?.raw?.app_link_schemes) return []
  try {
    const list = JSON.parse(v) as unknown
    return Array.isArray(list) ? [...new Set(list.filter((e): e is string => typeof e === 'string' && validSchemeEntry(e)))].slice(0, MAX_APP_LINK_SCHEMES) : []
  } catch {
    return []
  }
}

/** The value to store for a list. */
export const appLinkSchemesValue = (list: readonly string[]): string => (list.length ? JSON.stringify(list) : '')

/** Why an entry cannot be added, or null when it can (Settings). */
export function schemeEntryProblem(entry: string, list: readonly string[]): 'denied' | 'invalid' | 'duplicate' | 'full' | null {
  const e = entry.trim().toLowerCase().replace(/:\/*$/, '')
  const base = e.split(':')[0]
  if (DENIED_SCHEMES.includes(base) || OWN_RULES.includes(base)) return 'denied'
  if (!validSchemeEntry(e)) return 'invalid'
  if (list.includes(e)) return 'duplicate'
  if (list.length >= MAX_APP_LINK_SCHEMES) return 'full'
  return null
}

/** The normalised form of a typed entry ("Zotero://" → "zotero"). */
export const normaliseSchemeEntry = (entry: string): string => entry.trim().toLowerCase().replace(/:\/*$/, '')
