// The signed-in account on this phone (design D5): the server, the person and the
// tokens, kept in the Keychain or Keystore as one record so a rotated pair is replaced
// in one write. Signing in opens the account's database and signing out deletes it,
// with the tokens and the device's settings (native-app "Local data on the phone").
//
// Signing out ends the grant on the server too: at once when online, otherwise the
// tokens wait in a second record and the next start or reconnection sends them
// (account-access "App sessions alongside other sessions").
import { createSession, type Session, type Tokens } from './tokens'

/** The Keychain or Keystore (expo-secure-store on the phone). */
export interface Secrets {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface User { id: string; name: string; email: string }
export interface Account { server: string; user: User; tokens: Tokens }
/** An account with its running session. */
export interface SignedIn { account: Account; session: Session }

export interface AccountDeps {
  secrets: Secrets
  /** The account's local database: opened at sign-in, emptied and deleted at sign-out. */
  database: { open(server: string, userId: string): void; forget(): Promise<void> }
  /** Deletes the device's settings (the shared library's preferences). */
  clearPrefs(): void
  /** The grant ended on the server: the account is already gone from the phone. */
  onEnded(): void
  fetchFn?: typeof fetch
  now?: () => number
}

const ACCOUNT = 'opentodo.account'
const SIGN_OUTS = 'opentodo.signouts'

type Departure = { server: string; tokens: Tokens }

async function read<T>(secrets: Secrets, key: string): Promise<T | null> {
  try {
    const raw = await secrets.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Everything of the account that lives on the phone, deleted. */
async function wipe(deps: AccountDeps): Promise<void> {
  await deps.secrets.remove(ACCOUNT)
  await deps.database.forget()
  deps.clearPrefs()
}

function start(account: Account, deps: AccountDeps): SignedIn {
  const session = createSession({
    server: account.server,
    tokens: account.tokens,
    save: (tokens) => {
      account.tokens = tokens
      return deps.secrets.set(ACCOUNT, JSON.stringify(account))
    },
    onEnded: () => { void wipe(deps).then(deps.onEnded, deps.onEnded) },
    fetchFn: deps.fetchFn,
    now: deps.now,
  })
  deps.database.open(account.server, account.user.id)
  return { account, session }
}

/** The account signed in on this phone at an earlier start, if any. */
export async function restore(deps: AccountDeps): Promise<SignedIn | null> {
  const account = await read<Account>(deps.secrets, ACCOUNT)
  return account?.server && account.user?.id && account.tokens?.refresh ? start(account, deps) : null
}

/** After the code exchange: asks the server who signed in, then keeps the account. */
export async function begin(server: string, tokens: Tokens, deps: AccountDeps): Promise<SignedIn> {
  const account: Account = { server, user: { id: '', name: '', email: '' }, tokens }
  const probe = createSession({ server, tokens, save: async (t) => { account.tokens = t }, onEnded: () => undefined, fetchFn: deps.fetchFn, now: deps.now })
  const res = await probe.fetch('/api/v1/me', { headers: { Accept: 'application/json' } })
  const body = (res.ok ? await res.json().catch(() => null) : null) as { user?: Partial<User> } | null
  const user = body?.user
  if (typeof user?.id !== 'string' || !user.id) throw new Error(`app sign-in: /api/v1/me answered ${res.status}`)
  account.user = { id: user.id, name: typeof user.name === 'string' ? user.name : '', email: typeof user.email === 'string' ? user.email : '' }
  await deps.secrets.set(ACCOUNT, JSON.stringify(account))
  return start(account, deps)
}

/** Signs out: the phone forgets the account first, then the server is told (now or later). */
export async function signOut(signed: SignedIn, deps: AccountDeps): Promise<void> {
  const waiting = (await read<Departure[]>(deps.secrets, SIGN_OUTS)) ?? []
  waiting.push({ server: signed.account.server, tokens: signed.session.tokens() })
  await deps.secrets.set(SIGN_OUTS, JSON.stringify(waiting))
  await wipe(deps)
  await sendSignOuts(deps)
}

/** Tells each server about a sign-out it has not heard of; one that cannot be reached waits. */
export async function sendSignOuts(deps: AccountDeps): Promise<void> {
  const waiting = (await read<Departure[]>(deps.secrets, SIGN_OUTS)) ?? []
  if (!waiting.length) return
  const left: Departure[] = []
  for (const d of waiting) {
    const session = createSession({ server: d.server, tokens: d.tokens, save: async (t) => { d.tokens = t }, onEnded: () => undefined, fetchFn: deps.fetchFn, now: deps.now })
    try {
      const res = await session.fetch('/api/v1/app/sign-out', { method: 'POST' })
      // 204: ended. 401: the grant was gone already. Anything else is the server's trouble: try again.
      if (res.status >= 500 || res.status === 429) left.push(d)
    } catch {
      left.push(d)
    }
  }
  if (left.length) await deps.secrets.set(SIGN_OUTS, JSON.stringify(left))
  else await deps.secrets.remove(SIGN_OUTS)
}
