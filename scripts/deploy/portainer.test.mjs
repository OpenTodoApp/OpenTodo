// node --test scripts/deploy/portainer.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import { check, checkRow, checkTemplate, ROW, TEMPLATE } from './portainer.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const text = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
/** Applies fn to a parsed copy of the single template and checks the result. */
const edit = (fn) => {
  const doc = JSON.parse(text)
  fn(doc.templates[0], doc)
  return checkTemplate(JSON.stringify(doc, null, 2) + '\n', ctx)
}
const env = (t, name) => t.env.find((e) => e.name === name)

test('portainer: the committed template and row pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('portainer: list format', () => {
  has(checkTemplate('{"version": "3", "templates": [}\n', ctx), /not JSON/)
  has(edit((t, doc) => { doc.version = '2' }), /"version": "3"/)
  has(edit((t, doc) => { doc.templates.push({ ...t, title: 'Other' }) }), /exactly one template/)
  has(edit((t) => { t.id = 1 }), /leave id out/)
  has(edit((t) => { t.type = 3 }), /type must be 1/)
})

test('portainer: image policy, port and data path', () => {
  has(edit((t) => { t.image = 'ghcr.io/pixari/opentodo:latest' }), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(edit((t) => { t.image = 'ghcr.io/pixari/opentodo:0.9.0' }), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(edit((t) => { t.ports = ['3000:3000/tcp'] }), /port must be 8080/)
  has(edit((t) => { t.ports = ['8080:8080'] }), /host:container\/tcp/)
  has(edit((t) => { t.ports = ['127.0.0.1:8080:8080/tcp'] }), /without a host IP/)
  has(edit((t) => { t.volumes = [{ container: '/config' }] }), /mounted on \/data/)
  has(edit((t) => { t.volumes = [{ container: '/data', bind: '/srv/opentodo' }] }), /no bind mount/)
})

test('portainer: variables', () => {
  has(edit((t) => { t.env.push({ name: 'OPENTODO_NOPE', label: 'x', description: 'x' }) }), /not read by internal\/config/)
  has(edit((t) => { t.env.push({ name: 'OPENTODO_MCP', label: 'x', description: 'x' }) }), /not in the variable catalogue/)
  has(edit((t) => { t.env = t.env.filter((e) => e.name !== 'OPENTODO_TRUSTED_PROXIES') }), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(edit((t) => { for (const o of env(t, 'OPENTODO_ALLOW_SIGNUP').select) o.default = o.value === 'true' }), /defaults to "true", the catalogue says "false"/)
  has(edit((t) => { for (const o of env(t, 'OPENTODO_ALLOW_SIGNUP').select) delete o.default }), /mark exactly one select option/)
  has(edit((t) => { env(t, 'OPENTODO_SETUP_TOKEN').default = 'a-shared-secret-for-everyone' }), /never ship a default secret/)
  has(edit((t) => { delete env(t, 'OPENTODO_BASE_URL').label }), /needs a label/)
  has(edit((t) => { env(t, 'OPENTODO_BASE_URL').default = 1 }), /default must be a string/)
  has(edit((t) => { env(t, 'OPENTODO_BASE_URL').preset = true }), /no preset/)
})

test('portainer: description, categories, logo, note', () => {
  has(edit((t) => { t.description = facts.summary }), /followed by "Source: https:\/\/github\.com\/pixari\/opentodo"/)
  has(edit((t) => { t.categories = ['Todo'] }), /categories/)
  has(edit((t) => { t.logo = 'https://example.com/logo.png' }), /logo must be/)
  has(edit((t) => { t.restart_policy = 'always' }), /unless-stopped/)
  has(edit((t) => { t.note = t.note.replace('first visitor', 'owner') }), /first visitor/)
  has(edit((t) => { t.note += '<img src="x">' }), /only <b>, <code>, <br> and <a>/)
})

test('portainer: the sources.csv row', () => {
  const row = readText(ROW)
  assert.deepEqual(checkRow(row, ctx), [])
  has(checkRow(row.replace('/main/', '/v0.9.0/'), ctx), /must be exactly/)
  has(checkRow(row.replace(', app', ', collection'), ctx), /must be exactly/)
  has(checkRow(null, ctx), /is missing/)
})
