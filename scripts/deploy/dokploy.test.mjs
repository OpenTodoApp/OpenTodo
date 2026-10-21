// node --test scripts/deploy/dokploy.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, checkAll, parseToml, PATHS } from './dokploy.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const files = () => ({
  compose: readText(PATHS.compose),
  template: readText(PATHS.template),
  meta: readText(PATHS.meta),
  index: readText(PATHS.index),
})
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const withCompose = (from, to) => checkAll({ ...files(), compose: files().compose.replace(from, to) }, ctx)
const withToml = (from, to) => checkAll({ ...files(), template: files().template.replace(from, to) }, ctx)

test('dokploy: the committed template passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('dokploy: TOML subset parser', () => {
  const t = parseToml(readText(PATHS.template))
  assert.equal(t.variables.setup_token, '${password:32}')
  assert.deepEqual(t.config.mounts, [])
  assert.deepEqual(t.config.domains, [{ serviceName: 'opentodo', port: 8080, host: '${main_domain}' }])
  assert.equal(t.config.env.OPENTODO_SETUP_TOKEN, '${setup_token}')
  assert.throws(() => parseToml('a = 1\na = 2\n'), /duplicate key a/)
  assert.throws(() => parseToml("a = 'single'\n"), /only "strings"/)
  assert.throws(() => parseToml('[x]\n[x]\n'), /defined twice/)
})

test('dokploy: image policy and the pull on deploy', () => {
  has(withCompose('opentodo:stable', 'opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(withCompose('opentodo:stable', 'opentodo:0.9.0'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(withCompose('    pull_policy: always\n', ''), /pull_policy must be always/)
})

test('dokploy: port, data path and Dokploy compose rules', () => {
  has(withCompose('      - 8080\n', '      - 3000\n'), /port must be 8080/)
  has(withCompose('opentodo-data:/data', 'opentodo-data:/config'), /mounted on \/data/)
  has(withCompose('opentodo-data:/data', './data:/data'), /named volume/)
  has(withCompose('    expose:\n', '    ports:\n      - 8080:8080\n    expose:\n'), /"ports" is not allowed/)
  has(withCompose('    restart: unless-stopped\n', '    restart: unless-stopped\n    container_name: opentodo\n'), /"container_name" is not allowed/)
  has(withCompose('volumes:\n  opentodo-data:\n', 'volumes:\n  opentodo-data:\nnetworks:\n  dokploy-network:\n'), /top-level "networks"/)
  has(withCompose('services:\n  opentodo:', 'services:\n  todo:'), /exactly one service, named "opentodo"/)
  has(withCompose('"/opentodo", "healthcheck"', '"sh", "-c", "true"'), /healthcheck test/)
})

test('dokploy: variables', () => {
  has(withCompose('      - OPENTODO_TRUSTED_PROXIES=${OPENTODO_TRUSTED_PROXIES:-}\n', '      - OPENTODO_TRUSTED_PROXIES=${OPENTODO_TRUSTED_PROXIES:-}\n      - OPENTODO_NOPE=${OPENTODO_NOPE:-}\n'), /OPENTODO_NOPE is not read by internal\/config/)
  has(withCompose('${OPENTODO_ALLOW_SIGNUP:-false}', '${OPENTODO_ALLOW_SIGNUP:-true}'), /defaults to "true", the catalogue says "false"|template\.toml sets "false"/)
  has(withCompose('      - OPENTODO_TRUSTED_PROXIES=${OPENTODO_TRUSTED_PROXIES:-}\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered|template\.toml sets OPENTODO_TRUSTED_PROXIES/)
  has(withCompose('=${OPENTODO_BASE_URL:-}', '=https://todo.example.com'), /NAME=\$\{NAME:-default\}/)
})

test('dokploy: template.toml domain, token and base URL', () => {
  has(withToml('OPENTODO_BASE_URL = ""', 'OPENTODO_BASE_URL = "https://${main_domain}"'), /must start empty: the generated domain is plain http/)
  has(withToml('OPENTODO_BASE_URL = ""', 'OPENTODO_BASE_URL = "http://${main_domain}"'), /must start empty/)
  has(withToml('${password:32}', '${password:8}'), /N >= 16/)
  has(withToml('OPENTODO_SETUP_TOKEN = "${setup_token}"', 'OPENTODO_SETUP_TOKEN = "changeme-changeme"'), /generated per install/)
  has(withToml('port = 8080', 'port = 3000'), /domain's port must be 8080/)
  has(withToml('serviceName = "opentodo"', 'serviceName = "OpenTodo"'), /serviceName must be "opentodo"/)
  has(withToml('OPENTODO_TRUSTED_PROXIES = ""\n', ''), /does not set/)
})

test('dokploy: meta.json and the base-URL list', () => {
  const meta = files().meta
  has(checkAll({ ...files(), meta: meta.replace('"version": "stable"', '"version": "0.9.0"') }, ctx), /version must be "stable"/)
  has(checkAll({ ...files(), meta: meta.replace('"id": "opentodo"', '"id": "open-todo"') }, ctx), /id must be "opentodo"/)
  has(checkAll({ ...files(), index: '[]\n' }, ctx), /as Dokploy's generate-meta\.js writes it/)
})

test('dokploy: upstream copies and logo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dokploy-check-'))
  try {
    for (const p of ['deploy', 'internal/config', 'scripts', 'web/public', 'CHANGELOG.md', '.github/workflows/ci.yml']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    const up = join(dir, 'deploy/dokploy/upstream/blueprints/opentodo/template.toml')
    writeFileSync(up, readText(PATHS.template) + '# drift\n')
    has(check(ctx, dir), /upstream\/blueprints\/opentodo\/template\.toml must be identical/)
    writeFileSync(join(dir, 'deploy/dokploy/upstream/meta.json'), '[]\n')
    has(check(ctx, dir), /upstream\/meta\.json must not exist/)
    writeFileSync(join(dir, PATHS.logo), '<svg/>\n')
    has(check(ctx, dir), /opentodo\.svg must be identical to deploy\/coolify\/opentodo\.svg/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
