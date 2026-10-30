// Run with: node --test extension/api.test.js  (or `make extension`)
// The extension's only network code (OpenSpec change extension-v2, design D4),
// against a stubbed fetch: the bearer header, the timeout, the error mapping and
// the Idempotency-Key on every create.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApi, errorKind, localNow, randomKey } from './api.js'

/** A fetch that records each call and answers from `reply(url, init)`. */
function stub(reply) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init, headers: { ...init.headers }, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    const r = await reply(url, init)
    return { ok: r.status < 400, status: r.status, json: async () => (r.body === undefined ? Promise.reject(new Error('no body')) : r.body) }
  }
  return { calls, fetchImpl }
}

const server = 'https://todo.example.com'

test('requests carry the bearer token, no cookies, and go only to the server', async () => {
  const { calls, fetchImpl } = stub(() => ({ status: 200, body: { user: { name: 'Alex' }, auth: { scope: 'full' } } }))
  const api = createApi({ server, token: 'ot_secret', fetchImpl, key: 'k1' })
  const me = await api.me()
  assert.equal(me.auth.scope, 'full')
  assert.equal(calls[0].url, 'https://todo.example.com/api/v1/me')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers.Authorization, 'Bearer ot_secret')
  assert.equal(calls[0].credentials, 'omit')
  assert.equal(calls[0].headers['Idempotency-Key'], undefined)
})

test('lists unwrap their envelope', async () => {
  const { fetchImpl } = stub((url) => ({ status: 200, body: url.endsWith('/projects') ? { projects: [{ id: 'p' }] } : {} }))
  const api = createApi({ server, token: 't', fetchImpl })
  assert.deepEqual(await api.projects(), [{ id: 'p' }])
  assert.deepEqual(await api.labels(), [])
})

test('parse posts the line, the address and the local day', async () => {
  const { calls, fetchImpl } = stub(() => ({ status: 200, body: { title: 'x', fields: {}, chips: [] } }))
  const api = createApi({ server, token: 't', fetchImpl })
  await api.parse('call tomorrow', '', '2026-10-22', '09:30')
  assert.equal(calls[0].url, `${server}/api/v1/quick-add/parse`)
  assert.deepEqual(calls[0].body, { line: 'call tomorrow', today: '2026-10-22', now: '09:30' })
  assert.equal(calls[0].headers['Idempotency-Key'], undefined, 'a parse writes nothing')
})

test('every create carries a key derived from the popup opening', async () => {
  const { calls, fetchImpl } = stub(() => ({ status: 201, body: { id: 'x' } }))
  const api = createApi({ server, token: 't', fetchImpl, key: 'ext-abc' })
  await api.createLabel('call', 1)
  await api.createTask({ title: 'Call' })
  await api.createReminder({ task_id: 'x' }, 1)
  await api.createReminder({ task_id: 'x' }, 2)
  await api.createTimeEntry({ taskId: 'x' })
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace(`${server}/api/v1`, ''), c.headers['Idempotency-Key']]), [
    ['POST', '/labels', 'ext-abc.l1'],
    ['POST', '/tasks', 'ext-abc'],
    ['POST', '/reminders', 'ext-abc.r1'],
    ['POST', '/reminders', 'ext-abc.r2'],
    ['POST', '/time-entries', 'ext-abc.t'],
  ])
  assert.ok(calls.every((c) => c.headers['Content-Type'] === 'application/json'))
})

test('a network failure is "unreachable"', async () => {
  const api = createApi({ server, token: 't', fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(api.createTask({ title: 'x' }), (err) => err instanceof ApiError && err.kind === 'unreachable')
})

test('the timeout aborts a request that does not answer', async () => {
  let aborted = false
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      aborted = true
      reject(new DOMException('aborted', 'AbortError'))
    })
  })
  const api = createApi({ server, token: 't', fetchImpl, timeoutMs: 20 })
  await assert.rejects(api.createTask({ title: 'x' }), (err) => err.kind === 'unreachable')
  assert.ok(aborted)
})

test('error answers map to kinds with the server message', async () => {
  const cases = [
    [401, 'unauthenticated', 'unauthorized'],
    [403, 'forbidden', 'forbidden'],
    [403, 'encryption_enabled', 'encrypted'],
    [429, 'rate_limited', 'rate_limited'],
    [400, 'invalid_input', 'invalid'],
    [422, 'invalid_input', 'invalid'],
    [500, 'internal', 'failed'],
  ]
  for (const [status, code, kind] of cases) {
    const { fetchImpl } = stub(() => ({ status, body: { error: { code, message: `m ${code}` } } }))
    const api = createApi({ server, token: 't', fetchImpl })
    await assert.rejects(api.createTask({ title: 'x' }), (err) => err.kind === kind && err.status === status && err.message === `m ${code}`, `${status} ${code}`)
  }
  const { fetchImpl } = stub(() => ({ status: 502 }))
  await assert.rejects(createApi({ server, token: 't', fetchImpl }).me(), (err) => err.kind === 'failed' && err.message === 'status 502')
  assert.equal(errorKind(404, 'not_found'), 'failed')
})

test('randomKey and localNow', () => {
  assert.match(randomKey(), /^ext-[0-9a-f]{32}$/)
  assert.notEqual(randomKey(), randomKey())
  assert.deepEqual(localNow(new Date(2026, 0, 5, 7, 3)), { today: '2026-01-05', now: '07:03' })
})

test('api.js is the only module that calls fetch', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = new URL('./', import.meta.url)
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'api.js')) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, f)
  }
})

test('a dated task asks for the default reminder unless the line has its own', async () => {
  const { calls, fetchImpl } = stub(() => ({ status: 201, body: { id: 'x' } }))
  const api = createApi({ server, token: 't', fetchImpl, key: 'ext-abc' })
  await api.createTask({ title: 'Call', due: { date: '2026-11-06' } })
  await api.createTask({ title: 'Call', due: { date: '2026-11-06' } }, { ownReminders: true })
  await api.createTask({ title: 'Call' })
  assert.deepEqual(calls.map((c) => c.url.replace(`${server}/api/v1`, '')), ['/tasks?default_reminder=true', '/tasks', '/tasks'])
})
