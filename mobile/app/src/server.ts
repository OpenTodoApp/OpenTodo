// The server check before sign-in (OpenSpec native-app "Server compatibility",
// design D11): the address must answer GET /api/v1/health as an OpenTodo server,
// and the server must have the app sign-in routes ("app_sign_in": true). An older
// server is refused with the minimum version; the app never falls back to the web app.

/** The first release whose health answer carries app_sign_in (1.3.0 does not). */
export const MIN_SERVER = '1.4'
export const UPDATE_GUIDE = 'https://github.com/OpenTodoApp/OpenTodo/blob/main/docs/self-hosting/README.md#5-upgrading'

export type ServerCheck =
  | { ok: true; url: string; version: string }
  | { ok: false; problem: 'address' | 'insecure' | 'not-opentodo' | 'needs-update'; message: string }

export const MESSAGES = {
  address: 'Enter the address of your OpenTodo server.',
  insecure: 'Plain http works only on your own network. Use https for this server.',
  'not-opentodo': 'No OpenTodo server answers at this address.',
  'needs-update': `This server needs OpenTodo ${MIN_SERVER} or later for the app.`,
} as const

const fail = (problem: keyof typeof MESSAGES): ServerCheck => ({ ok: false, problem, message: MESSAGES[problem] })

/**
 * This device, private IPv4 ranges, IPv6 loopback, unique-local and link-local, and
 * `.local` names: where plain http is accepted, as in the shells (native-shells D3).
 * Anywhere else the tokens would cross the internet unencrypted.
 */
export function isLocalHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  const v4 = host.split('.')
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
    const [a, b] = [Number(v4[0]), Number(v4[1])]
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (host.includes(':')) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)
  return false
}

/** The server's base URL from what was typed: https unless http is written, no trailing slash. */
export function serverURL(typed: string): string | null {
  const s = typed.trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname) return null
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

export async function checkServer(typed: string, fetchFn: typeof fetch = fetch, timeoutMs = 10_000): Promise<ServerCheck> {
  const url = serverURL(typed)
  if (!url) return fail('address')
  if (url.startsWith('http:') && !isLocalHost(new URL(url).hostname)) return fail('insecure')
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const res = await fetchFn(`${url}/api/v1/health`, { headers: { Accept: 'application/json' }, signal: abort.signal })
    if (!res.ok) return fail('not-opentodo')
    const body: unknown = await res.json()
    if (!body || typeof body !== 'object' || (body as { status?: unknown }).status !== 'ok') return fail('not-opentodo')
    const { version, app_sign_in: appSignIn } = body as { version?: unknown; app_sign_in?: unknown }
    if (typeof version !== 'string') return fail('not-opentodo')
    if (appSignIn !== true) return fail('needs-update')
    return { ok: true, url, version }
  } catch {
    return fail('not-opentodo')
  } finally {
    clearTimeout(timer)
  }
}
