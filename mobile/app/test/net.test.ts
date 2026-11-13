// The app's network for the shared library (OpenSpec native-app "Sync in the app",
// design D6): requests by path go to the account's server with its token, and the live
// stream is an EventSource over XMLHttpRequest that exists only in the foreground.
import type { Session } from '../src/auth/tokens'
import { dropStreams, eventSourceClass } from '../src/net/eventSource'
import { installServerFetch, setServerSession } from '../src/net/serverFetch'

const SERVER = 'https://todo.example.com'

function fakeSession(access: (renew?: boolean) => Promise<string | null> = async () => 'access-1') {
  const asked: string[] = []
  const session: Session = {
    server: SERVER,
    fetch: async (path) => { asked.push(path); return new Response('{}') },
    access,
    tokens: () => ({ access: 'access-1', refresh: 'refresh-1', expiresAt: 0 }),
  }
  return { session, asked }
}

describe('requests by path', () => {
  afterEach(() => setServerSession(null))

  it('go to the signed-in account, and other requests are left alone', async () => {
    const outside: string[] = []
    const target = { fetch: (async (url: string) => { outside.push(url); return new Response('outside') }) as unknown as typeof fetch }
    installServerFetch(target)
    const s = fakeSession()
    setServerSession(s.session)
    await target.fetch('/api/v1/sync', { method: 'POST' })
    await target.fetch('https://elsewhere.example/x')
    expect(s.asked).toEqual(['/api/v1/sync'])
    expect(outside).toEqual(['https://elsewhere.example/x'])
  })

  it('answer 401 in the server\'s envelope when nobody is signed in', async () => {
    const target = { fetch: (async () => new Response('outside')) as unknown as typeof fetch }
    installServerFetch(target)
    const res = await target.fetch('/api/v1/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'not signed in' } })
  })
})

/** XMLHttpRequest as React Native reports a streamed answer: headers, then text as it grows. */
class FakeXHR {
  static last: FakeXHR
  readyState = 0
  status = 0
  responseText = ''
  url = ''
  headers: Record<string, string> = {}
  aborted = false
  onreadystatechange: (() => void) | null = null
  onprogress: (() => void) | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  constructor() { FakeXHR.last = this }
  open(_method: string, url: string) { this.url = url }
  setRequestHeader(k: string, v: string) { this.headers[k] = v }
  send() {}
  abort() { this.aborted = true }
  answer(status: number) { this.status = status; this.readyState = 2; this.onreadystatechange?.() }
  write(text: string) { this.responseText += text; this.readyState = 3; this.onprogress?.() }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function stream(o: { visible?: boolean; session?: Session | null } = {}) {
  let visible = o.visible ?? true
  const s = o.session === undefined ? fakeSession().session : o.session
  const Source = eventSourceClass({ session: () => s, visible: () => visible, XHR: FakeXHR as unknown as typeof XMLHttpRequest })
  const seen: string[] = []
  const es = new Source('/api/v1/sync/events?device=d1')
  es.onopen = () => seen.push('open')
  es.onerror = () => seen.push('error')
  es.addEventListener('ops', (ev) => seen.push(`ops ${ev.data}`))
  es.addEventListener('calendar', () => seen.push('calendar'))
  return { es, seen, hide: () => { visible = false } }
}

describe('the live stream', () => {
  it('opens on the account\'s server with its token', async () => {
    const { seen } = stream()
    await tick()
    const xhr = FakeXHR.last
    expect(xhr.url).toBe(`${SERVER}/api/v1/sync/events?device=d1`)
    expect(xhr.headers).toMatchObject({ Accept: 'text/event-stream', Authorization: 'Bearer access-1' })
    xhr.answer(200)
    expect(seen).toEqual(['open'])
  })

  it('dispatches named events as their lines arrive, whole or in pieces', async () => {
    const { seen } = stream()
    await tick()
    const xhr = FakeXHR.last
    xhr.answer(200)
    xhr.write(': hello\n\nevent: ops\ndata: {"cursor":7}\n\nevent: cal')
    expect(seen).toEqual(['open', 'ops {"cursor":7}'])
    xhr.write('endar\ndata: {}\r\n\r\nevent: ops\ndata: a\ndata: b\n\n')
    expect(seen.slice(2)).toEqual(['calendar', 'ops a\nb'])
  })

  it('reports a lost connection when the stream ends, once', async () => {
    const { seen } = stream()
    await tick()
    const xhr = FakeXHR.last
    xhr.answer(200)
    xhr.onload?.()
    xhr.onerror?.()
    expect(seen).toEqual(['open', 'error'])
    expect(xhr.aborted).toBe(true)
  })

  it('asks for a new token when the server refuses the old one', async () => {
    const renewals: boolean[] = []
    const { session } = fakeSession(async (renew) => { renewals.push(!!renew); return 'access-1' })
    const { seen } = stream({ session })
    await tick()
    FakeXHR.last.answer(401)
    expect(seen).toEqual(['error'])
    expect(renewals).toEqual([false, true])
  })

  it('does not open in the background, signed out, or without a token', async () => {
    for (const o of [{ visible: false }, { session: null }, { session: fakeSession(async () => null).session }]) {
      const before = FakeXHR.last
      const { seen } = stream(o)
      await tick()
      await tick()
      expect(seen).toEqual(['error'])
      expect(FakeXHR.last).toBe(before)
    }
  })

  it('is dropped when the app goes to the background, and stays quiet once closed', async () => {
    const a = stream()
    const b = stream()
    await tick()
    b.es.close()
    dropStreams()
    expect(a.seen).toEqual(['error'])
    expect(b.seen).toEqual([])
    dropStreams()
    expect(a.seen).toEqual(['error'])
  })

  it('reconnects rather than keep an endless answer in memory', async () => {
    const { seen } = stream()
    await tick()
    const xhr = FakeXHR.last
    xhr.answer(200)
    xhr.write(`: ${'x'.repeat(300 * 1024)}\n\n`)
    expect(seen).toEqual(['open', 'error'])
  })
})
