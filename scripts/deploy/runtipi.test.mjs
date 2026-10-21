// node --test scripts/deploy/runtipi.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, DIR, jpegSize, UPSTREAM } from './runtipi.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const config = readText(`${DIR}/config.json`)
const compose = readText(`${DIR}/docker-compose.yml`)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

/** Runs check() on a copy of deploy/runtipi with `edits` ({ path: text | Buffer | null }) applied. */
function variant(edits, c = ctx, now = Date.now()) {
  const dir = mkdtempSync(join(tmpdir(), 'runtipi-check-'))
  try {
    cpSync(join(ROOT, DIR), join(dir, DIR), { recursive: true, filter: (src) => !src.includes('node_modules') })
    for (const [p, text] of Object.entries(edits)) {
      if (text === null) rmSync(join(dir, p))
      else writeFileSync(join(dir, p), text)
    }
    return check(c, dir, now)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** The same edit to the app and its copy in the store. */
const both = (file, text) => ({ [`${DIR}/${file}`]: text, [`${UPSTREAM}/apps/opentodo/${file}`]: text })
const cfg = (mutate) => {
  const c = JSON.parse(config)
  mutate(c)
  return both('config.json', `${JSON.stringify(c, null, 2)}\n`)
}
const comp = (from, to) => variant(both('docker-compose.yml', compose.replace(from, to)))

test('runtipi: the committed app and store pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('runtipi: the release tag, equal to the config version', () => {
  has(comp('opentodo:0.9.0', 'opentodo:stable'), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  has(comp('opentodo:0.9.0', 'opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  has(variant(cfg((c) => { c.version = '0.6.0' })), /version must be 0\.9\.0|tag must contain the config\.json version/)
  const next = { ...ctx, changelog: '## [0.10.0] - 2026-11-01\n' + ctx.changelog }
  has(variant({}, next), /image must be ghcr\.io\/pixari\/opentodo:0\.10\.0/)
})

test('runtipi: config.json rules', () => {
  has(variant(cfg((c) => { c.categories = ['productivity'] })), /categories must be from/)
  has(variant(cfg((c) => { c.port = 8080 })), /port must be 8400/)
  has(variant(cfg((c) => { c.id = 'open-todo' })), /id must be opentodo/)
  has(variant(cfg((c) => { delete c.short_desc })), /config\.json needs short_desc/)
  has(variant(cfg((c) => { c.exposable = false })), /exposable must be true/)
  has(variant(cfg((c) => { c.tipi_version = 0 })), /tipi_version must be a positive integer/)
  has(variant(cfg((c) => { c.min_tipi_version = '4.5.0' })), /min_tipi_version must be 4\.7\.0/)
  has(variant(cfg((c) => { c.supported_architectures = ['amd64'] })), /supported_architectures/)
  // Runtipi's store test refuses timestamps in the future.
  has(variant({}, ctx, 1792195200000 - 1), /created_at must be a past timestamp/)
  has(variant(cfg((c) => { c.updated_at = c.created_at - 1 })), /updated_at must not be before created_at/)
  has(variant(cfg((c) => { c.form_fields[0].required = true })), /must not be required/)
  has(variant(both('config.json', JSON.stringify(JSON.parse(config)) + '\n')), /must be formatted as JSON\.stringify/)
  has(variant(both('config.json', '{')), /config\.json is not JSON/)
})

test('runtipi: compose rules', () => {
  has(comp('${APP_DATA_DIR}/data:/data\n    depends_on', '${APP_DATA_DIR}/data:/config\n    depends_on'), /mounted on \/data/)
  has(comp('internal_port: 8080', 'internal_port: 3000'), /port must be 8080/)
  has(comp('is_main: true', 'is_main: false'), /is_main must be true/)
  has(comp('schema_version: 2', 'schema_version: 1'), /schema_version must be 2/)
  has(comp('  opentodo:\n', '  open-todo:\n'), /services must be opentodo/)
  has(comp('    restart: unless-stopped\n', '    restart: unless-stopped\n    user: "0:0"\n'), /user is not allowed/)
  has(comp('    restart: unless-stopped\n', '    restart: unless-stopped\n    ports:\n      - "8400:8080"\n'), /ports is not allowed/)
  has(comp('"/opentodo", "healthcheck"', '"/opentodo", "version"'), /health check must be/)
  has(comp('OPENTODO_ALLOW_SIGNUP:-false', 'OPENTODO_ALLOW_SIGNUP:-true'), /OPENTODO_ALLOW_SIGNUP defaults to "true"|default false differs/)
  has(comp('      OPENTODO_BASE_URL: ${OPENTODO_BASE_URL:-}\n', '      OPENTODO_BASE_URL: ${OPENTODO_BASE_URL:-}\n      OPENTODO_NOPE: ${OPENTODO_NOPE:-}\n'), /OPENTODO_NOPE has no form field|not read by internal\/config/)
  has(comp('      OPENTODO_TRUSTED_PROXIES: ${OPENTODO_TRUSTED_PROXIES:-}\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered|form field OPENTODO_TRUSTED_PROXIES is not used/)
  has(comp('OPENTODO_SETUP_TOKEN: ${OPENTODO_SETUP_TOKEN:-}', 'OPENTODO_SETUP_TOKEN: ${OPENTODO_SETUP_TOKEN:?}'), /OPENTODO_SETUP_TOKEN must be \$\{OPENTODO_SETUP_TOKEN:-<default>\}/)
})

test('runtipi: the init service hands the data folder to the image user before it starts', () => {
  has(comp('condition: service_completed_successfully', 'condition: service_started'), /must wait for opentodo-init/)
  has(comp('"chown", "-R", "65532:65532", "/data"', '"chown", "-R", "1000:1000", "/data"'), /command must be \["chown", "-R", "65532:65532", "\/data"\]/)
  has(comp('restart: "no"', 'restart: unless-stopped\n'), /restart must be "no"/)
  has(comp('busybox:1.37.0', 'busybox:latest'), /image must be busybox:<x\.y\.z>/)
})

test('runtipi: metadata and logo', () => {
  assert.deepEqual(jpegSize(readFileSync(join(ROOT, DIR, 'metadata/logo.jpg'))), { width: 512, height: 512 })
  const png = readFileSync(join(ROOT, 'web/public/pwa-512.png'))
  has(variant(both('metadata/logo.jpg', png)), /logo\.jpg must be a JPEG/)
  has(variant(both('metadata/description.md', 'OpenTodo\n')), /must start with "# OpenTodo"/)
})

test('runtipi: the store repository copy and Renovate', () => {
  has(variant({ [`${UPSTREAM}/apps/opentodo/docker-compose.yml`]: compose.replace('interval: 30s', 'interval: 60s') }), /docker-compose\.yml must be identical/)
  has(variant({ [`${UPSTREAM}/apps/opentodo/metadata/logo.jpg`]: null }), /apps\/opentodo\/metadata\/logo\.jpg is missing/)
  has(variant({ [`${UPSTREAM}/bun.lock`]: null }), /bun\.lock is missing/)
  has(variant({ [`${UPSTREAM}/apps/whoami.txt`]: 'x' }), /apps\/whoami\.txt is not part of the store/)
  const renovate = readText(`${UPSTREAM}/renovate.json`)
  has(variant({ [`${UPSTREAM}/renovate.json`]: renovate.replace('docker-compose\\\\.yml', 'docker-compose\\\\.json') }), /must match apps\/<app>\/docker-compose\.yml/)
  has(variant({ [`${UPSTREAM}/renovate.json`]: renovate.replace(' {{depName}}', '') }), /postUpgradeTasks must run scripts\/update-config\.ts/)
})
