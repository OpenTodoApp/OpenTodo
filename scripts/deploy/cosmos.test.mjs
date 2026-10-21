// node --test scripts/deploy/cosmos.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, checkCompose, checkDescription, checkUpstream, COMPOSE, DESCRIPTION, UPSTREAM_DIR } from './cosmos.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const compose = readText(COMPOSE)
const description = readText(DESCRIPTION)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const edit = (text, fn) => { const j = JSON.parse(text); fn(j); return JSON.stringify(j, null, 2) + '\n' }
const svc = (j) => j.services['{ServiceName}']

test('cosmos: the committed servapp passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('cosmos: strict JSON', () => {
  has(checkCompose(compose.replace('"minVersion"', 'minVersion'), ctx), /not valid JSON/)
  has(checkDescription(description + ',', ctx), /not valid JSON/)
})

test('cosmos: image policy stable', () => {
  has(checkCompose(compose.replace('opentodo:stable', 'opentodo:0.9.0'), ctx), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(checkCompose(compose.replace('opentodo:stable', 'opentodo:latest'), ctx), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(checkDescription(description.replace('opentodo:stable', 'opentodo:latest'), ctx), /description\.json: image must be/)
})

test('cosmos: port, data and route', () => {
  has(checkCompose(compose.replace('http://{ServiceName}:8080', 'http://{ServiceName}:3000'), ctx), /port must be 8080/)
  has(checkCompose(compose.replace('"target": "/data"', '"target": "/config"'), ctx), /mounted on \/data/)
  has(checkCompose(edit(compose, (j) => { svc(j).volumes[0].type = 'bind'; svc(j).volumes[0].source = '/srv/opentodo' }), ctx), /one named volume/)
  has(checkCompose(edit(compose, (j) => { svc(j).routes[0].useHost = false }), ctx), /useHost/)
  has(checkCompose(edit(compose, (j) => { svc(j).ports = ['8080:8080'] }), ctx), /the service must have exactly/)
})

test('cosmos: variables, setup token and base URL', () => {
  has(checkCompose(compose.replace('OPENTODO_ALLOW_SIGNUP=false', 'OPENTODO_ALLOW_SIGNUP=true'), ctx), /defaults to "true", the catalogue says "false"/)
  has(checkCompose(edit(compose, (j) => { svc(j).environment.push('OPENTODO_NOPE=1') }), ctx), /OPENTODO_NOPE is not read by internal\/config/)
  has(checkCompose(edit(compose, (j) => { svc(j).environment = svc(j).environment.filter((e) => !e.startsWith('OPENTODO_TRUSTED_PROXIES')) }), ctx), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(checkCompose(compose.replace('"OPENTODO_SETUP_TOKEN={Passwords.0}"', '"OPENTODO_SETUP_TOKEN="'), ctx), /OPENTODO_SETUP_TOKEN must be \{Passwords\.0\}/)
  has(checkCompose(compose.replace('"OPENTODO_BASE_URL={RootProtocol}://', '"OPENTODO_BASE_URL=https://'), ctx), /OPENTODO_BASE_URL must be/)
  has(checkCompose(compose.replace('setup token: {Passwords.0}', 'setup token'), ctx), /post-install must show/)
  has(checkCompose(compose.replace('"minVersion": "0.22.23"', '"minVersion": "0.9.0"'), ctx), /minVersion must be/)
})

test('cosmos: labels and description', () => {
  has(checkCompose(compose.replace('"cosmos-auto-update": "true"', '"cosmos-auto-update": "false"'), ctx), /cosmos-auto-update/)
  has(checkCompose(compose.replace('servapps/OpenTodo/icon.png', 'servapps/Memos/icon.png'), ctx), /cosmos-icon/)
  has(checkDescription(edit(description, (j) => { j.supported_architectures = ['amd64'] }), ctx), /supported_architectures/)
  has(checkDescription(edit(description, (j) => { j.homepage = 'https://open-todo.app' }), ctx), /must have exactly/)
})

test('cosmos: the servapp folder copy, icon and screenshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cosmos-check-'))
  try {
    for (const p of [COMPOSE, DESCRIPTION, UPSTREAM_DIR]) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    assert.deepEqual(checkUpstream(dir), [])
    writeFileSync(join(dir, COMPOSE), compose.replace('unless-stopped', 'always'))
    has(checkUpstream(dir), /cosmos-compose\.json must be identical/)
    writeFileSync(join(dir, UPSTREAM_DIR, 'screenshots', 'shot.jpg'), 'x')
    has(checkUpstream(dir), /screenshots\/shot\.jpg must be a PNG/)
    rmSync(join(dir, UPSTREAM_DIR, 'screenshots'), { recursive: true })
    has(checkUpstream(dir), /screenshots is missing \(the store deploy crashes without it\)/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
