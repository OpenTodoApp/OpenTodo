// Devices for the contract tests: each is its own IndexedDB database, device id
// and signed-in session against the real server (src/test/contractServer.ts).
// The client code runs unchanged; only `fetch` is routed: relative URLs go to
// the server and each device's session cookie travels with its requests.
import { inject } from 'vitest'
import { useDatabase as openDatabase } from '../lib/db' // not a React hook
import { resetDeviceId } from '../lib/ops'

const base = inject('serverUrl')
const realFetch = globalThis.fetch.bind(globalThis)

interface Session {
  cookie: string
}

let active: Session | null = null
let offline = false

/** The client's fetch: the active device's session, or a network failure while offline. */
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (offline) throw new TypeError('Failed to fetch (contract test: offline)')
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, base)
  const headers = new Headers(init?.headers)
  if (active?.cookie) headers.set('cookie', active.cookie)
  return realFetch(url, { ...init, headers })
}) as typeof fetch

/** Calls the server directly (setup steps the client does not perform), as `session`. */
export async function call<T = unknown>(session: Session | null, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (session?.cookie) headers.cookie = session.cookie
  const res = await realFetch(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text}`)
  if (session) {
    const set = res.headers.getSetCookie()
    if (set.length) session.cookie = set.map((c) => c.split(';')[0]).join('; ')
  }
  return (text ? JSON.parse(text) : null) as T
}

let accounts = 0

/** A new account on the server (sign-up is open on the contract server). */
export async function account(name = 'Contract'): Promise<{ email: string; password: string; id: string }> {
  const email = `contract-${Date.now()}-${++accounts}@example.com`
  const password = 'contract test password'
  const session = { cookie: '' }
  const res = await call<{ user: { id: string } }>(session, 'POST', '/api/v1/auth/register', { email, name, password })
  return { email, password, id: res.user.id }
}

export interface Device {
  name: string
  session: Session
}

let devices = 0

/** Signs a new device in to `acct` and makes it the active device. */
export async function device(acct: { email: string; password: string }, name = 'device'): Promise<Device> {
  const session = { cookie: '' }
  await call(session, 'POST', '/api/v1/auth/login', { email: acct.email, password: acct.password })
  const d = { name: `${name}-${++devices}`, session }
  switchTo(d)
  return d
}

/** Switches the client's database, device id and session to `d`. */
export function switchTo(d: Device): void {
  openDatabase(`contract-${d.name}`)
  resetDeviceId()
  active = d.session
}

/** Network on or off for every device (the client sees fetch fail, as in a browser). */
export function setOffline(value: boolean): void {
  offline = value
}
