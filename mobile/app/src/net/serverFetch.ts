// The shared library asks the server by path (`fetch('/api/v1/sync')`), as a page of the
// server does. In the app those requests go to the signed-in account's server with its
// token (the session refreshes it, src/auth/tokens.ts); every other request is untouched.
import type { Session } from '../auth/tokens'

let session: Session | null = null

/** The account whose server answers the shared library's requests; null when signed out. */
export function setServerSession(next: Session | null): void {
  session = next
}

export function serverSession(): Session | null {
  return session
}

const signedOut = () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'not signed in' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })

/** Replaces the global fetch once, at start-up; returns the one it wraps. */
export function installServerFetch(target: { fetch: typeof fetch } = globalThis): typeof fetch {
  const original = target.fetch
  target.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input !== 'string' || !input.startsWith('/')) return original(input, init)
    return session ? session.fetch(input, init) : Promise.resolve(signedOut())
  }) as typeof fetch
  return original
}
