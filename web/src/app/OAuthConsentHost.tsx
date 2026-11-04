// Mounts the OAuth consent screen (mcp-oauth D5) when the app was opened with
// `?oauth_consent=<authorize request>`. The parameter is read when this module
// loads, before the router or sign-in touch the address, and removed from it;
// the screen itself is loaded only then, so the first load does not carry it.
import { lazy, Suspense, useState } from 'react'

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

const pending = takeConsentQuery()

/** Shows the consent screen for a pending authorize request, if the app was opened with one. */
export function OAuthConsentHost() {
  const [query, setQuery] = useState(pending)
  if (!query) return null
  return <Suspense fallback={null}><OAuthConsent query={query} onDone={() => setQuery(null)} /></Suspense>
}
