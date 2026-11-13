// Sign-in through the system's authentication sheet (design D5): the app opens the
// server's /app/sign-in with a PKCE challenge, the person signs in there with whatever
// the server offers (password, second factor, passkey, single sign-on) and confirms,
// and the sheet comes back to opentodo://signed-in with a single-use code, which the
// app exchanges with its verifier.
import { challengeOf, randomToken } from './pkce'
import { exchangeCode, ExchangeError, type Tokens } from './tokens'

export const REDIRECT = 'opentodo://signed-in'

/** What the sheet answered: the address it was sent to, or that it was closed. */
export type SheetResult = { type: 'success'; url: string } | { type: string }

export type SignIn =
  | { ok: true; tokens: Tokens }
  /** `cancelled`: the person closed the sheet or pressed Cancel there; nothing to say. */
  | { ok: false; problem: 'cancelled' | 'offline' | 'demo' | 'busy' | 'failed'; message: string }

export const SIGN_IN_MESSAGES = {
  cancelled: '',
  offline: 'The server did not answer. Check the connection and try again.',
  demo: 'The demo server does not accept the app. Use your own server.',
  busy: 'Too many attempts. Try again in a minute.',
  failed: 'Sign-in did not complete. Try again.',
} as const

const fail = (problem: keyof typeof SIGN_IN_MESSAGES): SignIn => ({ ok: false, problem, message: SIGN_IN_MESSAGES[problem] })

export interface SignInDeps {
  openSheet(url: string, redirect: string): Promise<SheetResult>
  /** The name the sessions list shows after "OpenTodo app ·". */
  device: string
  fetchFn?: typeof fetch
  now?: () => number
}

export function signInURL(server: string, challenge: string, state: string, device: string): string {
  const q = [['code_challenge', challenge], ['code_challenge_method', 'S256'], ['state', state], ['device', device]]
  return `${server}/app/sign-in?${q.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`
}

/** The parameters of the address the sheet came back to. */
function answer(url: string): Map<string, string> {
  const query = url.split('#')[0]!.split('?')[1] ?? ''
  const out = new Map<string, string>()
  for (const pair of query.split('&')) {
    const i = pair.indexOf('=')
    if (i > 0) out.set(decodeURIComponent(pair.slice(0, i)), decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')))
  }
  return out
}

export async function signIn(server: string, deps: SignInDeps): Promise<SignIn> {
  const verifier = randomToken()
  const state = randomToken()
  const sheet = await deps.openSheet(signInURL(server, await challengeOf(verifier), state, deps.device), REDIRECT)
  if (sheet.type !== 'success' || !('url' in sheet)) return fail('cancelled')
  if (!sheet.url.startsWith(REDIRECT)) return fail('failed')
  const q = answer(sheet.url)
  // An answer to another request (or an injected one) is not ours.
  if (q.get('state') !== state) return fail('failed')
  if (q.get('error') === 'access_denied') return fail('cancelled')
  const code = q.get('code')
  if (!code) return fail('failed')
  try {
    return { ok: true, tokens: await exchangeCode(server, code, verifier, state, deps.fetchFn, deps.now) }
  } catch (err) {
    if (!(err instanceof ExchangeError)) throw err
    if (err.problem === 'offline') return fail('offline')
    if (err.problem === 'demo_restricted') return fail('demo')
    if (err.problem === 'rate_limited') return fail('busy')
    return fail('failed')
  }
}
