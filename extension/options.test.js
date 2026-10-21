// Run with: node --test extension/options.test.js  (or `make extension`)
// The options page's decisions (OpenSpec change extension-v2, design D2;
// share-capture "Extension privacy with a token"): which addresses may receive a
// token, what each scope allows, and where each setting is stored.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MODE_CAPTURE, MODE_QUICK, canParse, effectiveMode, readSettings, scopeDecision, tokenAllowed } from './settings.js'

test('a token travels only over https, or plain http on this machine', () => {
  assert.equal(tokenAllowed('https://todo.example.com'), true)
  assert.equal(tokenAllowed('http://localhost:8080'), true)
  assert.equal(tokenAllowed('http://127.0.0.1:8080'), true)
  assert.equal(tokenAllowed('http://todo.lan'), false)
  assert.equal(tokenAllowed('http://192.168.1.10:8080'), false)
  assert.equal(tokenAllowed('http://localhost.evil.example'), false)
  assert.equal(tokenAllowed(''), false)
})

test('what each scope allows', () => {
  assert.deepEqual(scopeDecision('full'), { save: true, parse: true, reason: '' })
  assert.deepEqual(scopeDecision('admin'), { save: true, parse: true, reason: '' })
  assert.deepEqual(scopeDecision('read'), { save: false, parse: true, reason: 'tokenRead' })
  assert.deepEqual(scopeDecision('agent'), { save: false, parse: false, reason: 'tokenAgent' })
  assert.deepEqual(scopeDecision(undefined), { save: false, parse: false, reason: 'tokenRejected' })
})

test('Capture screen mode is the default', () => {
  assert.equal(effectiveMode({ server: 'https://todo.example.com' }), MODE_CAPTURE)
  assert.equal(effectiveMode(), MODE_CAPTURE)
})

test('Quick save needs a server, an allowed address and a token that saves', () => {
  const ok = { server: 'https://todo.example.com', mode: MODE_QUICK, token: 't', scope: 'full' }
  assert.equal(effectiveMode(ok), MODE_QUICK)
  assert.equal(effectiveMode({ ...ok, scope: 'read' }), MODE_CAPTURE, 'Read token')
  assert.equal(effectiveMode({ ...ok, scope: 'agent' }), MODE_CAPTURE)
  assert.equal(effectiveMode({ ...ok, token: '' }), MODE_CAPTURE)
  assert.equal(effectiveMode({ ...ok, server: 'http://todo.lan' }), MODE_CAPTURE, 'Plain http refused')
  assert.equal(effectiveMode({ ...ok, mode: MODE_CAPTURE }), MODE_CAPTURE)
})

test('a read token still parses', () => {
  assert.equal(canParse({ server: 'https://todo.example.com', token: 't', scope: 'read' }), true)
  assert.equal(canParse({ server: 'https://todo.example.com', token: 't', scope: 'agent' }), false)
  assert.equal(canParse({ server: 'http://todo.lan', token: 't', scope: 'full' }), false)
})

test('Token stays on the device: the token is read from local storage only', async () => {
  const asked = { sync: [], local: [] }
  const area = (name, data) => ({ get: async (keys) => { asked[name].push(...keys); return data } })
  const s = await readSettings({ storage: { sync: area('sync', { server: 'https://todo.example.com', mode: 'quick', token: 'from-sync' }), local: area('local', { token: 'ot_local', scope: 'full', account: 'Alex' }) } })
  assert.deepEqual(s, { server: 'https://todo.example.com', mode: 'quick', token: 'ot_local', scope: 'full', account: 'Alex' })
  assert.ok(!asked.sync.includes('token'))
  assert.ok(asked.local.includes('token'))
})

test('the options page writes the token to local storage and never to sync', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./options.js', import.meta.url), 'utf8')
  for (const m of src.matchAll(/storage\.sync\.(?:set|remove)\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /token|scope|account/, m[0])
  assert.match(src, /storage\.local\.set\(/)
})
