// Links to other apps (OpenSpec change app-links). A link such as
// zotero://select/items/ABC or mid:<message-id> is stored as written and opens
// only on a device whose person allowed its scheme (`user_prefs.app_link_schemes`),
// after a confirmation the first time a scheme opens on that device (D3, D4).
// The grammar and the deny list are internal/origin/applink.go's, pinned by the
// shared vectors internal/origin/testdata/app_links.vectors.json.
import { readJSON, writeJSON } from './deviceStorage'
import { has, shell } from './shell'
import { createStore } from './store'
import { allowsAppLink, appLinkScheme } from './appLinkGrammar'

export * from './appLinkGrammar'

// ---- the viewer's list, published by DateTimePrefsProvider ----

const schemes = createStore<readonly string[]>('appLinkSchemes', [])

/** Replaces the snapshot (DateTimePrefsProvider; tests). */
export function setAppLinkSchemes(next: readonly string[]): void {
  const cur = schemes.get()
  if (cur.length !== next.length || cur.some((s, i) => s !== next[i])) schemes.set(next)
}

export const appLinkSchemes = (): readonly string[] => schemes.get()
export const useAppLinkSchemes = (): readonly string[] => schemes.use()

/** Whether this viewer may open the link (their own list allows it). */
export const canOpenAppLink = (raw: string): boolean => allowsAppLink(schemes.get(), raw)

// ---- opening, with a confirmation per device and scheme (D4) ----

const TRUST_KEY = 'appLinksTrusted'
const trusted = (): string[] => readJSON<string[]>(TRUST_KEY, [], (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null))

/** Remembers on this device that links of `scheme` open without asking. */
export function trustScheme(scheme: string): void {
  const list = trusted()
  if (!list.includes(scheme)) writeJSON(TRUST_KEY, [...list, scheme])
}

/** The confirmation waiting to be answered, rendered by AppLinkConfirm. */
export const pendingAppLink = createStore<{ url: string; scheme: string } | null>('pendingAppLink', null)

/** Hands an allowed link to the system: through the shell's `app-links`, else as a link activation. */
export function launchAppLink(url: string): boolean {
  if (!canOpenAppLink(url)) return false
  const s = shell()
  if (s) {
    if (!has('app-links') || !s.openAppLink) return false
    s.openAppLink(url, JSON.stringify(appLinkSchemes()))
    return true
  }
  // A link activation: the browser asks before handing it to the app and leaves no tab.
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noreferrer'
  a.click()
  return true
}

/**
 * Opens an app link the viewer allowed: at once when this device trusts its
 * scheme, else after the confirmation. False when the viewer's list does not
 * allow it (the caller shows it as text) or the shell cannot open it.
 */
export function openAppLink(url: string): boolean {
  const scheme = appLinkScheme(url)
  if (!scheme || !canOpenAppLink(url)) return false
  if (shell() && !has('app-links')) return false
  if (trusted().includes(scheme)) return launchAppLink(url)
  pendingAppLink.set({ url, scheme })
  return true
}
