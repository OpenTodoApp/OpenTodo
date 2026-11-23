// Devices for the contract tests: each is its own IndexedDB database, device id
// and signed-in session against the real server (src/test/contractServer.ts).
// The client code runs unchanged; only `fetch` is routed: relative URLs go to
// the server and each device's session cookie travels with its requests.
import { expect, inject } from 'vitest'
import { useDatabase as openDatabase } from '../lib/db' // not a React hook
import { resetDeviceId } from '../lib/ops'
import { syncNow, syncSnapshot } from '../lib/sync'

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

/**
 * Signs up through POST /api/v1/auth/register as `session`. The server allows 10
 * sign-ups a minute from one address for the whole run: past that, this waits for the window.
 */
export async function register(session: Session, body: { email: string; name: string; password: string }): Promise<{ user: { id: string } }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call<{ user: { id: string } }>(session, 'POST', '/api/v1/auth/register', body)
    } catch (err) {
      if (attempt >= 14 || !String(err).includes('HTTP 429')) throw err
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

/** A new account on the server (sign-up is open on the contract server). */
export async function account(name = 'Contract'): Promise<{ email: string; password: string; id: string }> {
  const email = `contract-${Date.now()}-${++accounts}@example.com`
  const password = 'contract test password'
  const res = await register({ cookie: '' }, { email, name, password })
  return { email, password, id: res.user.id }
}

/**
 * Accepts every open membership invitation of the device's account: an add by
 * email between accounts that share nothing is an invitation (member-add-consent).
 */
export async function acceptInvitations(d: Device): Promise<void> {
  const { invitations } = await call<{ invitations: { id: string }[] }>(d.session, 'GET', '/api/v1/me/member-invitations')
  for (const inv of invitations) await call(d.session, 'POST', `/api/v1/me/member-invitations/${inv.id}/accept`, {})
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

/** Signs a device in to `acct` for each name, in order; the last one is the active device. */
export async function devicesOf(acct: { email: string; password: string }, ...names: string[]): Promise<Device[]> {
  const out: Device[] = []
  for (const name of names) out.push(await device(acct, name))
  return out
}

/**
 * Adds `member` to `project` with `role`, as `owner`, then signs a device of the
 * member in (it becomes the active device) and accepts the invitation from it.
 */
export async function addMember(owner: Device, project: string, member: { email: string; password: string }, role: string, deviceName = 'member'): Promise<Device> {
  await call(owner.session, 'POST', `/api/v1/projects/${project}/members`, { email: member.email, role })
  const d = await device(member, deviceName)
  await acceptInvitations(d)
  return d
}

/** A new account and a full-access API token for it (for the clients that use tokens). */
export async function tokenAccount(name: string): Promise<string> {
  const session = { cookie: '' }
  await register(session, { email: `${name}-${Date.now()}@example.com`, name, password: 'client contract password' })
  const { secret } = await call<{ secret: string }>(session, 'POST', '/api/v1/tokens', { name })
  return secret
}

/** Syncs the active device and checks that nothing is left to send and no error is shown. */
export async function synced(): Promise<void> {
  await syncNow()
  expect(syncSnapshot()).toMatchObject({ pending: 0, error: null })
}

// ---- rows the tests create through mutate() ----

export function newProject(name: string, extra: Record<string, unknown> = {}) {
  return { name, color: '#3b82f6', position: 1, archived: false, parent_id: null, created_at: Date.now(), deleted_at: null, ...extra }
}

export function newTask(title: string, projectId: string | null) {
  return { title, description: '', project_id: projectId, parent_id: null, priority: 4, due: null, labels: [], position: 1, created_at: Date.now(), completed_at: null, deleted_at: null }
}

export function newSection(name: string, projectId: string) {
  return { name, project_id: projectId, position: 1, created_at: Date.now(), deleted_at: null }
}

/** Network on or off for every device (the client sees fetch fail, as in a browser). */
export function setOffline(value: boolean): void {
  offline = value
}
