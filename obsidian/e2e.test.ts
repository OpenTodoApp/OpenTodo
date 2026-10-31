// @vitest-environment happy-dom
// End-to-end against a real server (obsidian-plugin task 5.3, `make obsidian-e2e`):
// ../bin/opentodo on a throwaway data directory, a full token, one line sent from a
// fake vault through the loaded plugin, the task read back over REST with its
// obsidian origin; then the same for an encrypted account.
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeyRecord, isEnvelope } from '../web/src/lib/crypto'
import { openValue } from '../web/src/lib/e2eeEnvelope'
import { connected, memoryEditor } from './test/harness'
import { setRequestHandler } from './test/obsidian'

const PORT = Number(process.env.OPENTODO_E2E_PORT ?? 18093)
const BASE = `http://127.0.0.1:${PORT}`
// Run from obsidian/ (make obsidian-e2e).
const BIN = process.env.OPENTODO_BIN ?? resolve(process.cwd(), '../bin/opentodo')

let server: ChildProcess
let dir: string

/**
 * One HTTP request with Node's own client: happy-dom's fetch applies a browser's
 * CORS rules, which Obsidian's requestUrl does not.
 */
function http(url: string, method: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string; cookie?: string }> {
  return new Promise((ok, fail) => {
    const req = httpRequest(url, { method, headers }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (text += c))
      res.on('end', () => ok({ status: res.statusCode ?? 0, text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] }))
    })
    req.on('error', fail)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/** requestUrl over the real network, as Obsidian's does it. */
const realRequest = async (req: { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer }) => {
  const res = await http(req.url, req.method ?? 'GET', req.headers ?? {}, req.body as string | undefined)
  return { status: res.status, text: res.text, json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) } as never
}

async function api(method: string, path: string, body: unknown, auth: { cookie?: string; token?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.cookie) headers.Cookie = auth.cookie
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  const res = await http(BASE + path, method, headers, body === undefined ? undefined : JSON.stringify(body))
  let parsed = null
  try {
    parsed = JSON.parse(res.text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, cookie: res.cookie }
}

async function account(email: string) {
  const reg = await api('POST', '/api/v1/auth/register', { email, name: 'Ada', password: 'correct horse battery staple' }, {})
  expect(reg.status).toBe(201)
  const cookie = reg.cookie!
  const tok = await api('POST', '/api/v1/tokens', { name: 'Obsidian on the laptop', scope: 'full' }, { cookie })
  expect(tok.status).toBe(201)
  return { cookie, token: tok.body.secret as string }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'opentodo-obsidian-e2e-'))
  server = spawn(BIN, [], { env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${PORT}`, OPENTODO_DATA_DIR: dir, OPENTODO_LOG_LEVEL: 'warn', OPENTODO_ALLOW_SIGNUP: 'true' }, stdio: 'inherit' })
  for (let i = 0; i < 100; i++) {
    try {
      if ((await http(`${BASE}/healthz`, 'GET', {})).status === 200) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${BIN} did not start on ${BASE}`)
}, 30_000)

afterAll(() => {
  server?.kill()
  rmSync(dir, { recursive: true, force: true })
})

describe('against a real server', () => {
  it('sends a line and the task carries its obsidian origin', async () => {
    const { token } = await account('ada@example.com')
    const h = await connected({})
    setRequestHandler(realRequest)
    h.plugin.disconnect()
    await h.plugin.connectWith(BASE, token)
    h.plugin.settings.sendWithoutAsking = true
    const ed = memoryEditor('Call the plumber tomorrow 9am p2')
    const [id] = await h.plugin.sender.sendLines(ed, 'Daily/2026-10-29.md', 0, 0)
    const res = await h.plugin.pushNow()
    expect(res?.kind).toBe('pushed')
    const task = await api('GET', `/api/v1/tasks/${id}`, undefined, { token })
    expect(task.status).toBe(200)
    expect(task.body).toMatchObject({ title: 'Call the plumber', priority: 2, origin: { kind: 'obsidian', id: 'Daily/2026-10-29.md', title: '2026-10-29' } })
    expect(task.body.origin.url).toBe('obsidian://open?vault=Work%20notes&file=Daily%2F2026-10-29.md')
    expect(ed.getLine(0)).toBe(`Call the plumber tomorrow 9am p2 [opentodo:: ${BASE}/?task=${id}]`)
  })

  it('on an encrypted account the server keeps only ciphertext', async () => {
    const { cookie, token } = await account('bea@example.com')
    const { record, key } = await createKeyRecord('correct horse battery', { iterations: 600_000 })
    const put = await api('PUT', '/api/v1/encryption/keys', record, { cookie })
    expect(put.status).toBe(201)
    const h = await connected({})
    setRequestHandler(realRequest)
    h.plugin.disconnect()
    await h.plugin.connectWith(BASE, token)
    expect(h.plugin.account()?.encrypted).toBe(true)
    h.plugin.settings.sendWithoutAsking = true
    await h.plugin.keys.unlock(await h.plugin.client()!.keyRecord(), 'correct horse battery', false)
    const [id] = await h.plugin.sender.sendLines(memoryEditor('- [ ] Renew passport 📅 2026-11-05 ⏫'), 'Admin/Papers.md', 0, 0)
    expect((await h.plugin.pushNow())?.kind).toBe('pushed')
    const task = await api('GET', `/api/v1/tasks/${id}`, undefined, { token })
    expect(task.status).toBe(200)
    expect(isEnvelope(task.body.title) && isEnvelope(task.body.origin)).toBe(true)
    expect(task.body.priority).toBe(2)
    expect(await openValue(key, 'task', id, 'title', task.body.title)).toBe('Renew passport')
    expect(await openValue(key, 'task', id, 'origin', task.body.origin)).toMatchObject({ kind: 'obsidian', id: 'Admin/Papers.md' })
  }, 60_000)
})
