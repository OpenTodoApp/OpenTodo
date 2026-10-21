// node --test scripts/deploy/synology.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import { check, checkDocs, checkTemplate, DOCS, TEMPLATE } from './synology.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const text = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const sub = (a, b) => {
  assert.ok(text.includes(a), `the compose file should contain ${a}`)
  return checkTemplate(text.replace(a, b), ctx)
}

test('synology: the committed project file and guide pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('synology: strict YAML and shape', () => {
  has(checkTemplate(text.replace('services:', 'services: &s'), ctx), /supported YAML subset/)
  has(checkTemplate('version: "3"\n' + text, ctx), /only services/)
  has(sub('    container_name: opentodo\n', ''), /"container_name" is required/)
  has(sub('    restart: unless-stopped', '    restart: unless-stopped\n    privileged: true'), /unexpected key "privileged"/)
  has(sub('restart: unless-stopped', 'restart: always'), /restart must be unless-stopped/)
  has(sub('test: ["CMD", "/opentodo", "healthcheck"]', 'test: ["CMD-SHELL", "curl -f localhost:8080/healthz"]'), /healthcheck: test must be/)
  has(sub('      retries: 3', '      retries: 3\n      disable: true'), /healthcheck: unexpected key "disable"/)
})

test('synology: image policy and updates', () => {
  has(sub('opentodo:stable', 'opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(sub('opentodo:stable', 'opentodo:0.9.0'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(sub('pull_policy: always', 'pull_policy: missing'), /pull_policy must be always/)
})

test('synology: user, port and data folder', () => {
  has(sub('user: "1026:100"', 'user: "65532:65532"'), /user must be "1026:100"/)
  has(sub('user: "1026:100"', 'user: 1026'), /quoted "uid:gid"/)
  has(sub('"8080:8080"', '"3000:3000"'), /port must be 8080/)
  has(sub('"8080:8080"', '"8090:8080"'), /default host port is the container port/)
  has(sub('"8080:8080"', '"0.0.0.0:8080:8080"'), /without a host IP/)
  has(sub('./data:/data', '/volume1/docker/opentodo/data:/data'), /source must be \.\/data/)
  has(sub('./data:/data', 'opentodo-data:/data'), /source must be \.\/data/)
  has(sub('./data:/data', './data:/config'), /mounted on \/data/)
  has(sub('./data:/data', './data:/data:rw'), /no mount options/)
})

test('synology: variables', () => {
  has(sub('OPENTODO_SETUP_TOKEN: ""', 'OPENTODO_SETUP_TOKEN: "a-shared-secret-for-everyone"'), /never ship a default secret/)
  has(sub('OPENTODO_BASE_URL: ""', 'OPENTODO_BASE_URL: "https://todo.example.com"'), /OPENTODO_BASE_URL must be empty/)
  has(sub('OPENTODO_ALLOW_SIGNUP: "false"', 'OPENTODO_ALLOW_SIGNUP: "true"'), /defaults to "true", the catalogue says "false"/)
  has(sub('OPENTODO_ALLOW_SIGNUP: "false"', 'OPENTODO_ALLOW_SIGNUP: false'), /quote the value/)
  has(sub('      OPENTODO_TRUSTED_PROXIES: ""\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(sub('      OPENTODO_TRUSTED_PROXIES: ""\n', '      OPENTODO_TRUSTED_PROXIES: ""\n      OPENTODO_NOPE: ""\n'), /not read by internal\/config/)
  has(sub('      OPENTODO_TRUSTED_PROXIES: ""\n', '      OPENTODO_TRUSTED_PROXIES: ""\n      OPENTODO_MCP: "true"\n'), /not in the variable catalogue/)
  has(sub('      OPENTODO_TRUSTED_PROXIES: ""\n', '      OPENTODO_TRUSTED_PROXIES: ""\n      TZ: "Europe/Berlin"\n'), /TZ is not read by OpenTodo/)
})

test('synology: the guide shows the same file', () => {
  const docs = readText(DOCS)
  assert.deepEqual(checkDocs(docs, text), [])
  has(checkDocs(docs.replace('pull_policy: always', 'pull_policy: missing'), text), /must show deploy\/synology\/docker-compose\.yml/)
  has(checkDocs(null, text), /synology\.md is missing/)
})
