// The server check (OpenSpec native-app "Server compatibility").
import { checkServer, MESSAGES, serverURL } from '../src/server'

const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('serverURL', () => {
  it.each([
    ['todo.example.com', 'https://todo.example.com'],
    ['  https://todo.example.com/  ', 'https://todo.example.com'],
    ['http://192.168.1.4:8080', 'http://192.168.1.4:8080'],
    ['example.com/todo/', 'https://example.com/todo'],
  ])('%j → %s', (typed, want) => expect(serverURL(typed)).toBe(want))

  it.each(['', '   ', 'ftp://example.com', 'https://'])('refuses %j', (typed) => expect(serverURL(typed)).toBeNull())
})

describe('checkServer', () => {
  it('accepts a server with app sign-in', async () => {
    let asked = ''
    const f = (async (url: string) => { asked = url; return new Response(JSON.stringify({ status: 'ok', version: '1.4.0', app_sign_in: true })) }) as unknown as typeof fetch
    expect(await checkServer('todo.example.com', f)).toEqual({ ok: true, url: 'https://todo.example.com', version: '1.4.0' })
    expect(asked).toBe('https://todo.example.com/api/v1/health')
  })

  it('asks an older server to be updated, naming the minimum version', async () => {
    const r = await checkServer('todo.example.com', answer(200, { status: 'ok', version: '1.3.0' }))
    expect(r).toEqual({ ok: false, problem: 'needs-update', message: MESSAGES['needs-update'] })
    expect(MESSAGES['needs-update']).toBe('This server needs OpenTodo 1.4 or later for the app.')
  })

  it.each([
    ['an error status', answer(404, { status: 'ok', version: '1.4.0', app_sign_in: true })],
    ['another JSON answer', answer(200, { hello: 'world' })],
    ['a page instead of JSON', (async () => new Response('<html></html>')) as unknown as typeof fetch],
    ['no answer', (async () => { throw new TypeError('Network request failed') }) as unknown as typeof fetch],
  ])('says no OpenTodo server answers for %s', async (_name, f) => {
    expect(await checkServer('todo.example.com', f)).toEqual({ ok: false, problem: 'not-opentodo', message: MESSAGES['not-opentodo'] })
  })

  it('asks for an address when there is none', async () => {
    expect(await checkServer('  ')).toMatchObject({ ok: false, problem: 'address' })
  })
})
