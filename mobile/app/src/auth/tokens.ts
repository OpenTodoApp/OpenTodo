// The app's tokens (design D5): the exchange at POST /api/v1/app/token, and a session
// that sends every request with the access token and replaces the pair when it is
// about to expire or the server answers 401.
//
// The refresh token rotates on every use and a used one revokes the grant, so only
// one refresh runs at a time and the new pair is stored before anything uses it. If
// the app is killed between the server's answer and the write, the next refresh
// presents a used token and the person signs in again: rare, and the safe side.

export interface Tokens {
  access: string
  refresh: string
  /** When the access token stops working (Unix milliseconds). */
  expiresAt: number
}

export type ExchangeProblem = 'invalid_grant' | 'demo_restricted' | 'rate_limited' | 'offline' | 'failed'

/** The token route refused, or did not answer. */
export class ExchangeError extends Error {
  constructor(readonly problem: ExchangeProblem) {
    super(`app token exchange: ${problem}`)
    this.name = 'ExchangeError'
  }
}

type Grant =
  | { grant_type: 'authorization_code'; code: string; code_verifier: string; state: string }
  | { grant_type: 'refresh_token'; refresh_token: string }

const KNOWN: readonly string[] = ['invalid_grant', 'demo_restricted', 'rate_limited']

async function exchange(server: string, grant: Grant, fetchFn: typeof fetch, now: () => number): Promise<Tokens> {
  let res: Response
  try {
    res = await fetchFn(`${server}/api/v1/app/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(grant),
    })
  } catch {
    throw new ExchangeError('offline')
  }
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: { code?: unknown } } | null
  if (!res.ok) {
    const code = body?.error?.code
    throw new ExchangeError(typeof code === 'string' && KNOWN.includes(code) ? (code as ExchangeProblem) : 'failed')
  }
  if (typeof body?.access_token !== 'string' || typeof body.refresh_token !== 'string' || typeof body.expires_in !== 'number') throw new ExchangeError('failed')
  return { access: body.access_token, refresh: body.refresh_token, expiresAt: now() + body.expires_in * 1000 }
}

export function exchangeCode(server: string, code: string, verifier: string, state: string, fetchFn: typeof fetch = fetch, now: () => number = Date.now): Promise<Tokens> {
  return exchange(server, { grant_type: 'authorization_code', code, code_verifier: verifier, state }, fetchFn, now)
}

export function refreshTokens(server: string, refresh: string, fetchFn: typeof fetch = fetch, now: () => number = Date.now): Promise<Tokens> {
  return exchange(server, { grant_type: 'refresh_token', refresh_token: refresh }, fetchFn, now)
}

/** Refresh this long before the access token expires, so a request does not race the clock. */
const EARLY_MS = 60_000

export interface SessionOptions {
  server: string
  tokens: Tokens
  /** Stores a new pair; the session uses it only after this resolves. */
  save(tokens: Tokens): Promise<void>
  /** The grant is gone (revoked, signed out everywhere, a reused token): back to the server screen. */
  onEnded(): void
  fetchFn?: typeof fetch
  now?: () => number
}

export interface Session {
  readonly server: string
  /** fetch for a path of the server (`/api/v1/…`), with the access token; a 401 is retried once after a refresh. */
  fetch(path: string, init?: RequestInit): Promise<Response>
  tokens(): Tokens
}

export function createSession(o: SessionOptions): Session {
  const fetchFn = o.fetchFn ?? fetch
  const now = o.now ?? Date.now
  let tokens = o.tokens
  let refreshing: Promise<Tokens | null> | null = null
  let ended = false

  /** The current pair after a refresh, or null when the grant is gone. One at a time. */
  const refresh = (): Promise<Tokens | null> => {
    refreshing ??= (async () => {
      try {
        const next = await refreshTokens(o.server, tokens.refresh, fetchFn, now)
        await o.save(next)
        tokens = next
        return next
      } catch (err) {
        if (err instanceof ExchangeError && err.problem === 'invalid_grant') {
          if (!ended) {
            ended = true
            o.onEnded()
          }
          return null
        }
        throw err
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  const send = (path: string, init: RequestInit | undefined, access: string) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${access}`)
    return fetchFn(o.server + path, { ...init, headers })
  }

  return {
    server: o.server,
    tokens: () => tokens,
    async fetch(path, init) {
      let current: Tokens | null = tokens
      if (refreshing || now() >= tokens.expiresAt - EARLY_MS) current = await refresh()
      if (!current) return new Response(null, { status: 401 })
      const res = await send(path, init, current.access)
      if (res.status !== 401) return res
      // Another request may have refreshed meanwhile: then only send again.
      const next = tokens.access !== current.access ? tokens : await refresh()
      return next ? send(path, init, next.access) : res
    },
  }
}
