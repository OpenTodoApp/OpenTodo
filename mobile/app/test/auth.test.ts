// App sign-in in the app (OpenSpec account-access "App sign-in through the system
// browser" and "App sessions alongside other sessions", design D5): PKCE, the code
// exchange, the session's refresh, and what signing out leaves on the phone.
import { createHash } from 'node:crypto'
import { begin, restore, sendSignOuts, signOut, type AccountDeps } from '../src/auth/account'
import { base64url, challengeOf, randomToken } from '../src/auth/pkce'
import { REDIRECT, signIn, signInURL, SIGN_IN_MESSAGES } from '../src/auth/signIn'
import { createSession, exchangeCode, ExchangeError, refreshTokens, type Tokens } from '../src/auth/tokens'

const SERVER = 'https://todo.example.com'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const pair = (n: number) => ({ access_token: `access-${n}`, token_type: 'Bearer', expires_in: 3600, refresh_token: `refresh-${n}`, scope: 'app' })
const refused = (status: number, code: string) => json(status, { error: { code, message: code } })

/** A server with app sign-in: one grant, rotating refresh tokens, reuse revokes it. */
function fakeServer() {
  let n = 1
  let revoked = false
  let expired = false
  const calls: { path: string; auth: string | null; body: Record<string, string> | null }[] = []
  const state = { offline: false, signOutStatus: 204, codes: new Map<string, { verifier: string; state: string }>() }
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (state.offline) throw new TypeError('Network request failed')
    const path = url.slice(SERVER.length)
    const auth = new Headers(init?.headers).get('Authorization')
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : null
    calls.push({ path, auth, body })
    if (path === '/api/v1/app/token') {
      if (body?.grant_type === 'authorization_code') {
        const code = state.codes.get(body.code!)
        state.codes.delete(body.code!)
        if (!code || code.verifier !== body.code_verifier || code.state !== body.state) return refused(400, 'invalid_grant')
        return json(200, pair(n))
      }
      if (revoked || body?.refresh_token !== `refresh-${n}`) {
        revoked = true
        return refused(400, 'invalid_grant')
      }
      expired = false
      return json(200, pair(++n))
    }
    if (revoked || expired || auth !== `Bearer access-${n}`) return refused(401, 'unauthorized')
    if (path === '/api/v1/app/sign-out') {
      if (state.signOutStatus === 204) revoked = true
      return new Response(null, { status: state.signOutStatus })
    }
    if (path === '/api/v1/me') return json(200, { user: { id: 'u1', name: 'Ada', email: 'ada@example.com' } })
    return json(200, { ok: true })
  }) as unknown as typeof fetch
  return { fetchFn, calls, state, expire: () => { expired = true }, revoke: () => { revoked = true }, paths: () => calls.map((c) => c.path) }
}

const tokens = (n = 1, expiresAt = 3_600_000): Tokens => ({ access: `access-${n}`, refresh: `refresh-${n}`, expiresAt })

function fakePhone(server: ReturnType<typeof fakeServer>) {
  const kept = new Map<string, string>()
  const log: string[] = []
  const deps: AccountDeps = {
    secrets: { get: async (k) => kept.get(k) ?? null, set: async (k, v) => { kept.set(k, v) }, remove: async (k) => { kept.delete(k) } },
    database: { open: (s, id) => { log.push(`open ${s} ${id}`) }, forget: async () => { log.push('forget') } },
    clearPrefs: () => { log.push('clear prefs') },
    onEnded: () => { log.push('ended') },
    fetchFn: server.fetchFn,
    now: () => 0,
  }
  return { deps, kept, log }
}

describe('PKCE', () => {
  it('encodes base64url without padding', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(base64url(new Uint8Array([1, 2, 3, 4]))).toBe(Buffer.from([1, 2, 3, 4]).toString('base64url'))
  })

  it('makes a verifier of 43 URL-safe characters, new each time', () => {
    const a = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(a)
  })

  it('derives the S256 challenge (RFC 7636 appendix B)', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    const v = randomToken()
    expect(await challengeOf(v)).toBe(createHash('sha256').update(v).digest('base64url'))
  })
})

describe('the code exchange', () => {
  it('posts the code, the verifier and the state, and reads the pair', async () => {
    const s = fakeServer()
    s.state.codes.set('c1', { verifier: 'v', state: 'st' })
    expect(await exchangeCode(SERVER, 'c1', 'v', 'st', s.fetchFn, () => 1000)).toEqual({ access: 'access-1', refresh: 'refresh-1', expiresAt: 3_601_000 })
    expect(s.calls[0]).toMatchObject({ path: '/api/v1/app/token', body: { grant_type: 'authorization_code', code: 'c1', code_verifier: 'v', state: 'st' } })
  })

  it.each([
    ['invalid_grant', refused(400, 'invalid_grant')],
    ['demo_restricted', refused(403, 'demo_restricted')],
    ['rate_limited', refused(429, 'rate_limited')],
    ['failed', refused(400, 'invalid_request')],
    ['failed', new Response('<html></html>', { status: 502 })],
    ['failed', json(200, { access_token: 'a' })],
  ])('reports %s', async (problem, res) => {
    await expect(refreshTokens(SERVER, 'r', (async () => res) as unknown as typeof fetch)).rejects.toMatchObject({ problem })
  })

  it('reports offline when the server does not answer', async () => {
    const down = (async () => { throw new TypeError('Network request failed') }) as unknown as typeof fetch
    await expect(refreshTokens(SERVER, 'r', down)).rejects.toEqual(new ExchangeError('offline'))
  })
})

describe('sign-in through the sheet', () => {
  const sheet = (answer: (url: URL) => string | null) => async (url: string, redirect: string) => {
    expect(redirect).toBe(REDIRECT)
    const back = answer(new URL(url))
    return back === null ? { type: 'cancel' } : { type: 'success', url: back }
  }

  it('opens /app/sign-in with an S256 challenge, a state and the device name', () => {
    expect(signInURL(SERVER, 'ch', 'st', "Ada's iPhone")).toBe(`${SERVER}/app/sign-in?code_challenge=ch&code_challenge_method=S256&state=st&device=Ada's%20iPhone`)
  })

  it('exchanges the code with the verifier of the challenge it sent', async () => {
    const s = fakeServer()
    let challenge = ''
    const result = await signIn(SERVER, {
      device: 'iPhone', fetchFn: s.fetchFn, now: () => 0,
      openSheet: sheet((u) => {
        challenge = u.searchParams.get('code_challenge')!
        s.state.codes.set('c1', { verifier: '?', state: u.searchParams.get('state')! })
        return `${REDIRECT}?code=c1&state=${u.searchParams.get('state')}`
      }),
    }).catch((e: unknown) => e)
    // The fake server does not know the verifier; the challenge proves which one was sent.
    const sent = s.calls[0]!.body!
    expect(createHash('sha256').update(sent.code_verifier!).digest('base64url')).toBe(challenge)
    expect(result).toMatchObject({ ok: false, problem: 'failed' })
  })

  it('signs in when the server accepts the code', async () => {
    const s = fakeServer()
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as Record<string, string>
      s.state.codes.set('c1', { verifier: body.code_verifier!, state: body.state! })
      return s.fetchFn(url, init)
    }) as unknown as typeof fetch
    const result = await signIn(SERVER, { device: 'iPhone', fetchFn, now: () => 0, openSheet: sheet((u) => `${REDIRECT}?state=${u.searchParams.get('state')}&code=c1`) })
    expect(result).toEqual({ ok: true, tokens: tokens() })
  })

  it.each([
    ['the sheet was closed', () => null, 'cancelled'],
    ['Cancel on the confirmation', (u: URL) => `${REDIRECT}?error=access_denied&state=${u.searchParams.get('state')}`, 'cancelled'],
    ['another state', () => `${REDIRECT}?code=c1&state=other`, 'failed'],
    ['no code', (u: URL) => `${REDIRECT}?state=${u.searchParams.get('state')}`, 'failed'],
    ['another address', (u: URL) => `https://evil.example/?code=c1&state=${u.searchParams.get('state')}`, 'failed'],
  ])('does not exchange when %s', async (_name, answer, problem) => {
    const s = fakeServer()
    const result = await signIn(SERVER, { device: 'iPhone', fetchFn: s.fetchFn, openSheet: sheet(answer) })
    expect(result).toEqual({ ok: false, problem, message: SIGN_IN_MESSAGES[problem as keyof typeof SIGN_IN_MESSAGES] })
    expect(s.calls).toHaveLength(0)
  })

  it('says nothing when the person cancelled, and names the other problems', () => {
    expect(SIGN_IN_MESSAGES.cancelled).toBe('')
    for (const [k, m] of Object.entries(SIGN_IN_MESSAGES)) if (k !== 'cancelled') expect(m).not.toBe('')
  })
})

describe('the session', () => {
  function session(s: ReturnType<typeof fakeServer>, start = tokens(), clock = { now: 0 }) {
    const saved: Tokens[] = []
    const ended: number[] = []
    const it = createSession({ server: SERVER, tokens: start, save: async (t) => { saved.push(t) }, onEnded: () => { ended.push(1) }, fetchFn: s.fetchFn, now: () => clock.now })
    return { it, saved, ended, clock }
  }

  it('sends the access token to the server', async () => {
    const s = fakeServer()
    const { it: sess } = session(s)
    expect((await sess.fetch('/api/v1/me', { headers: { Accept: 'application/json' } })).status).toBe(200)
    expect(s.calls).toEqual([{ path: '/api/v1/me', auth: 'Bearer access-1', body: null }])
  })

  it('refreshes before the access token expires, and stores the pair first', async () => {
    const s = fakeServer()
    const { it: sess, saved, clock } = session(s)
    clock.now = 3_600_000 - 30_000
    expect((await sess.fetch('/api/v1/tasks')).status).toBe(200)
    expect(s.paths()).toEqual(['/api/v1/app/token', '/api/v1/tasks'])
    expect(s.calls[1]!.auth).toBe('Bearer access-2')
    expect(saved).toEqual([{ access: 'access-2', refresh: 'refresh-2', expiresAt: clock.now + 3_600_000 }])
    expect(sess.tokens().refresh).toBe('refresh-2')
  })

  it('refreshes on a 401 and sends the request again, once', async () => {
    const s = fakeServer()
    const { it: sess, saved } = session(s, { access: 'stale', refresh: 'refresh-1', expiresAt: 3_600_000 })
    expect((await sess.fetch('/api/v1/tasks', { method: 'POST', body: '{}' })).status).toBe(200)
    expect(s.paths()).toEqual(['/api/v1/tasks', '/api/v1/app/token', '/api/v1/tasks'])
    expect(saved).toHaveLength(1)
  })

  it('refreshes once for requests made together', async () => {
    const s = fakeServer()
    const { it: sess, saved } = session(s, { access: 'stale', refresh: 'refresh-1', expiresAt: 3_600_000 })
    const all = await Promise.all([sess.fetch('/a'), sess.fetch('/b'), sess.fetch('/c')])
    expect(all.map((r) => r.status)).toEqual([200, 200, 200])
    expect(s.paths().filter((p) => p === '/api/v1/app/token')).toHaveLength(1)
    expect(saved).toHaveLength(1)
  })

  it('ends when the grant is gone, and answers 401 from then on', async () => {
    const s = fakeServer()
    const { it: sess, ended } = session(s)
    s.revoke()
    expect((await sess.fetch('/a')).status).toBe(401)
    expect((await sess.fetch('/b')).status).toBe(401)
    expect(ended).toHaveLength(1)
  })

  it('hands out a token that works now: the current one, a refreshed one when due or asked, none once ended', async () => {
    const s = fakeServer()
    const { it: sess, clock } = session(s)
    expect(await sess.access()).toBe('access-1')
    expect(await sess.access(true)).toBe('access-2')
    clock.now = 2 * 3_600_000
    expect(await sess.access()).toBe('access-3')
    s.revoke()
    expect(await sess.access(true)).toBeNull()
    expect(await sess.access()).toBeNull()
    expect(s.paths().filter((p) => p === '/api/v1/app/token')).toHaveLength(3)
  })

  it('keeps the tokens when the refresh gets no answer', async () => {
    const s = fakeServer()
    const { it: sess, ended, clock } = session(s)
    clock.now = 3_600_000
    s.state.offline = true
    await expect(sess.fetch('/a')).rejects.toMatchObject({ problem: 'offline' })
    s.state.offline = false
    expect((await sess.fetch('/a')).status).toBe(200)
    expect(ended).toHaveLength(0)
  })
})

describe('the account on the phone', () => {
  it('asks who signed in, keeps the account and opens its database', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const signed = await begin(SERVER, tokens(), p.deps)
    expect(signed.account.user).toEqual({ id: 'u1', name: 'Ada', email: 'ada@example.com' })
    expect(p.log).toEqual([`open ${SERVER} u1`])
    expect(JSON.parse(p.kept.get('opentodo.account')!)).toEqual({ server: SERVER, user: signed.account.user, tokens: tokens() })
  })

  it('keeps nothing when the server does not say who signed in', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    s.revoke()
    await expect(begin(SERVER, tokens(), p.deps)).rejects.toThrow('/api/v1/me answered 401')
    expect(p.kept.size).toBe(0)
    expect(p.log).toEqual([])
  })

  it('restores the account at the next start, with rotated tokens', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const first = await begin(SERVER, tokens(1, 0), p.deps)
    await first.session.fetch('/a')
    const again = await restore(p.deps)
    expect(again?.session.tokens().refresh).toBe('refresh-2')
    expect(again?.account.user.id).toBe('u1')
    expect(await restore(fakePhone(s).deps)).toBeNull()
  })

  it('signs out: the phone forgets the account and the server ends the grant', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const signed = await begin(SERVER, tokens(), p.deps)
    await signOut(signed, p.deps)
    expect(p.kept.size).toBe(0)
    expect(p.log).toEqual([`open ${SERVER} u1`, 'forget', 'clear prefs'])
    expect(s.paths().at(-1)).toBe('/api/v1/app/sign-out')
    expect((await signed.session.fetch('/a')).status).toBe(401)
  })

  it('signs out offline, and tells the server at the next connection', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const signed = await begin(SERVER, tokens(), p.deps)
    s.state.offline = true
    await signOut(signed, p.deps)
    expect([...p.kept.keys()]).toEqual(['opentodo.signouts'])
    expect(await restore(p.deps)).toBeNull()
    s.state.offline = false
    s.expire()
    await sendSignOuts(p.deps)
    expect(s.paths().slice(-3)).toEqual(['/api/v1/app/sign-out', '/api/v1/app/token', '/api/v1/app/sign-out'])
    expect(p.kept.size).toBe(0)
  })

  it('keeps a sign-out waiting while the server fails, and drops it once the grant is gone', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const signed = await begin(SERVER, tokens(), p.deps)
    s.state.signOutStatus = 503
    await signOut(signed, p.deps)
    expect(p.kept.has('opentodo.signouts')).toBe(true)
    s.revoke()
    await sendSignOuts(p.deps)
    expect(p.kept.size).toBe(0)
  })

  it('forgets the account when the grant ends on the server', async () => {
    const s = fakeServer()
    const p = fakePhone(s)
    const signed = await begin(SERVER, tokens(), p.deps)
    s.revoke()
    expect((await signed.session.fetch('/a')).status).toBe(401)
    await new Promise((r) => setImmediate(r))
    expect(p.log).toEqual([`open ${SERVER} u1`, 'forget', 'clear prefs', 'ended'])
    expect(p.kept.size).toBe(0)
  })
})
