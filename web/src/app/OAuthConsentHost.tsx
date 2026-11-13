// Mounts the OAuth consent screen (mcp-oauth D5) when the app was opened with
// `?oauth_consent=<authorize request>`. The parameter is read when this module
// loads, before the router or sign-in touch the address, and removed from it;
// the screen itself is loaded only then, so the first load does not carry it.
import { lazy, Suspense, useSyncExternalStore } from 'react'
import { resettable } from '../lib/moduleState'

const OAuthConsent = lazy(() => import('./OAuthConsent').then((m) => ({ default: m.OAuthConsent })))

/** Takes `oauth_consent` out of the current address and returns it. */
export function takeConsentQuery(): string | null {
  if (typeof window === 'undefined') return null
  const here = new URL(window.location.href)
  const q = here.searchParams.get('oauth_consent')
  if (q !== null) {
    here.searchParams.delete('oauth_consent')
    window.history.replaceState(window.history.state, '', here.pathname + here.search + here.hash)
  }
  return q
}

// The pending request, kept outside React so the shell can hold its first-run dialogs
// back while it waits: a new account that signs in from the app sees the confirmation,
// not the welcome note on top of it.
let pending = takeConsentQuery()
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Test hook and the screen's "done": sets the pending request (null when answered). */
export function setConsentQuery(query: string | null): void {
  pending = query
  for (const fn of [...listeners]) fn()
}

resettable('oauthConsentHost', () => setConsentQuery(null))

/** Whether a consent screen is waiting for an answer. */
export function useConsentPending(): boolean {
  return useSyncExternalStore(subscribe, () => pending !== null)
}

/** Shows the consent screen for a pending authorize request, if the app was opened with one. */
export function OAuthConsentHost() {
  const query = useSyncExternalStore(subscribe, () => pending)
  if (!query) return null
  return <Suspense fallback={null}><OAuthConsent query={query} onDone={() => setConsentQuery(null)} /></Suspense>
}
