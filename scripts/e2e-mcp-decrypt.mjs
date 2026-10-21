// End-to-end check of the decrypting MCP bridge (OpenSpec change mcp-projects,
// task 5.5) against a running server with a FRESH data directory: an end-to-end
// encrypted account (its key record made here with WebCrypto, as the web app makes
// it), `ot encryption unlock` with the passphrase, an assistant session through
// `ot mcp --decrypt` that lists, creates and renames, the server holding only
// ciphertext, and a browser device that unlocks with the passphrase and shows the
// plaintext after sync. Needs bin/ot (make cli). See scripts/README.md.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const ot = process.env.OT_BIN ?? './bin/ot'
const step = (s) => console.log('·', s)
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg) }
const PASSPHRASE = 'a long enough e2e passphrase'
const subtle = globalThis.crypto.subtle
const b64url = (b) => Buffer.from(b).toString('base64url')

// The key record exactly as web/src/lib/crypto.ts createKeyRecord builds it.
async function keyRecord() {
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 600_000
  const pbase = await subtle.importKey('raw', new TextEncoder().encode(PASSPHRASE.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  const pkek = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, pbase, { name: 'AES-KW', length: 256 }, false, ['wrapKey'])
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const rbase = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  const rkek = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('opentodo/e2ee/recovery-kek/v1') }, rbase, { name: 'AES-KW', length: 256 }, false, ['wrapKey'])
  return {
    version: 1, kdf: 1, salt: b64url(salt), iterations,
    wrappedByPassphrase: b64url(await subtle.wrapKey('raw', dek, pkek, 'AES-KW')),
    wrappedByRecovery: b64url(await subtle.wrapKey('raw', dek, rkek, 'AES-KW')),
  }
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  const api = ctx.request
  const call = async (method, path, data) => {
    const res = await api.fetch(`${base}/api/v1/${path}`, { method, data })
    assert(res.ok(), `${method} ${path} ${res.status()} ${await res.text()}`)
    return res.status() === 204 ? null : res.json()
  }

  step('an encrypted account with MCP, assistant writes and an agent token')
  await call('POST', 'auth/register', { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' })
  await call('PUT', 'encryption/keys', await keyRecord())
  await call('PUT', 'settings/mcp', { enabled: true, writes_enabled: true })
  await call('PUT', 'me/agent-access', { allow_writes: true })
  const token = (await call('POST', 'tokens', { name: 'Desk assistant', scope: 'agent' })).secret

  const dir = mkdtempSync(join(tmpdir(), 'ot-e2e-'))
  const env = { ...process.env, OPENTODO_URL: base, OPENTODO_TOKEN: token, OPENTODO_CONFIG: join(dir, 'config.json') }
  const passFile = join(dir, 'pass')
  writeFileSync(passFile, PASSPHRASE + '\n', { mode: 0o600 })

  step('ot encryption unlock')
  let r = spawnSync(ot, ['encryption', 'unlock', '--passphrase-file', passFile], { env, encoding: 'utf8' })
  assert(r.status === 0, `unlock: ${r.status} ${r.stderr}`)

  step('ot mcp --decrypt: create a project and a task, rename the project')
  const projectId = crypto.randomUUID()
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_project', arguments: { id: projectId, name: 'Garden' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_tasks', arguments: { items: [{ title: 'Book the plumber' }] } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'update_project', arguments: { id: projectId, name: 'Vegetable garden', icon: 'sprout' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n'
  r = spawnSync(ot, ['mcp', '--decrypt'], { env, input: lines, encoding: 'utf8' })
  assert(r.status === 0, `bridge: ${r.status} ${r.stderr}`)
  assert(r.stderr.includes('your AI provider receives them'), 'plaintext notice missing: ' + r.stderr)
  const out = r.stdout.trim().split('\n').map((l) => JSON.parse(l))
  assert(out.length === 4 && out.every((o) => o.result && !o.result.isError), 'bridge results: ' + r.stdout)
  assert(JSON.stringify(out[3]).includes('Book the plumber'), 'list_tasks not decrypted: ' + JSON.stringify(out[3]))

  step('the server holds only ciphertext')
  const tasks = (await call('GET', 'tasks')).tasks
  const projects = (await call('GET', 'projects')).projects
  assert(tasks.length === 1 && tasks[0].title.startsWith('enc:v1:'), 'task title on the server: ' + tasks[0]?.title)
  const garden = projects.find((p) => p.id === projectId)
  assert(garden && garden.name.startsWith('enc:v1:') && garden.icon === 'sprout', 'project on the server: ' + JSON.stringify(garden))

  step('a browser device unlocks and shows the plaintext')
  await page.goto(base)
  await page.getByRole('heading', { name: 'Unlock your tasks' }).waitFor()
  await page.locator('input[name="secret"]').fill(PASSPHRASE)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByText('Book the plumber').first().waitFor({ timeout: 30000 })
  await page.getByText('Vegetable garden').first().waitFor({ timeout: 30000 })
  assert(errors.length === 0, errors.join('\n'))
  console.log('e2e-mcp-decrypt: ok')
} finally {
  await browser.close()
}
