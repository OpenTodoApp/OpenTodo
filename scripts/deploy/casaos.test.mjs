// node --test scripts/deploy/casaos.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, checkTemplate, checkUpstream, parseYaml, TEMPLATE, UPSTREAM_DIR } from './casaos.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const compose = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

test('casaos: the committed template and store folder pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('casaos: the YAML subset parser is strict', () => {
  assert.deepEqual(parseYaml('a:\n  - b: "1"\n    c: 2\n  - [x, "y"]\n'), { a: [{ b: '1', c: 2 }, ['x', 'y']] })
  assert.equal(parseYaml('a: |\n  one\n  two\nb: x\n').a, 'one\ntwo\n')
  assert.throws(() => parseYaml('a: 1\na: 2\n'), /duplicate key/)
  assert.throws(() => parseYaml('a: &anchor x\n'), /not in the supported YAML subset/)
  assert.throws(() => parseYaml('a: b: c\n'), /may not contain/)
  assert.throws(() => parseYaml('a:\n\tb: 1\n'), /tabs/)
  assert.throws(() => parseYaml('a: 1\n   b: 2\n'), /unexpected indentation|could not parse/)
})

test('casaos: image policy and x-casaos.version', () => {
  // The store refuses moving tags: the latest release, never stable or latest.
  has(checkTemplate(compose.replace('opentodo:0.9.0', 'opentodo:stable'), ctx), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  has(checkTemplate(compose.replace('opentodo:0.9.0', 'opentodo:latest'), ctx), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  // Installs only see an update when the version changes, so it must follow the image.
  has(checkTemplate(compose.replace('version: "0.9.0"', 'version: "0.6.0"'), ctx), /x-casaos\.version must equal the image tag/)
  has(checkTemplate(compose.replace('version: "0.9.0"', 'version: 0.6'), ctx), /x-casaos\.version must be a quoted string/)
  // A new release in the changelog makes the pinned template stale.
  const next = { ...ctx, changelog: '## [0.10.0] - 2026-11-01\n' + ctx.changelog }
  has(checkTemplate(compose, next), /image must be ghcr\.io\/pixari\/opentodo:0\.10\.0/)
})

test('casaos: port, data path and the init service', () => {
  has(checkTemplate(compose.replace('target: 8080', 'target: 3000'), ctx), /port must be 8080/)
  has(checkTemplate(compose.replace('port_map: "8418"', 'port_map: 8418'), ctx), /port_map must be a quoted string/)
  has(checkTemplate(compose.replace('port_map: "8418"', 'port_map: "8419"'), ctx), /port_map must equal the published port/)
  has(checkTemplate(compose.replaceAll('published: "8418"', 'published: "8080"').replace('port_map: "8418"', 'port_map: "8080"'), ctx), /publish another port than 8080/)
  has(checkTemplate(compose.replaceAll('        target: /data', '        target: /config'), ctx), /mounted on \/data/)
  has(checkTemplate(compose.replaceAll('/DATA/AppData/$AppID/data', '/DATA/AppData/opentodo'), ctx), /bind mount of \/DATA\/AppData\/\$AppID\/data/)
  has(checkTemplate(compose.replace('"chown", "-R", "65532:65532"', '"chown", "-R", "1000:1000"'), ctx), /opentodo-init: command must be/)
  has(checkTemplate(compose.replace('image: busybox:1.37.0', 'image: busybox:latest'), ctx), /busybox pinned/)
  has(checkTemplate(compose.replace('condition: service_completed_successfully', 'condition: service_started'), ctx), /depends_on must wait for opentodo-init/)
})

test('casaos: variables', () => {
  has(checkTemplate(compose.replace('OPENTODO_ALLOW_SIGNUP: "false"', 'OPENTODO_ALLOW_SIGNUP: "true"'), ctx), /defaults to "true", the catalogue says "false"/)
  has(checkTemplate(compose.replace('OPENTODO_ALLOW_SIGNUP: "false"', 'OPENTODO_ALLOW_SIGNUP: false'), ctx), /must be a quoted string/)
  has(checkTemplate(compose.replace('      OPENTODO_TRUSTED_PROXIES: ""\n', '      OPENTODO_TRUSTED_PROXIES: ""\n      OPENTODO_NOPE: ""\n'), ctx), /OPENTODO_NOPE is not read by internal\/config/)
  has(checkTemplate(compose.replace('      OPENTODO_TRUSTED_PROXIES: ""\n', ''), ctx), /OPENTODO_TRUSTED_PROXIES must be offered|describes OPENTODO_TRUSTED_PROXIES/)
  has(checkTemplate(compose.replace('en_US: Optional, at least 16 characters.', 'en_US: Optional.'), ctx), /description of OPENTODO_SETUP_TOKEN must be the catalogue's/)
})

test('casaos: store metadata', () => {
  has(checkTemplate(compose.replace('id: app.open-todo.opentodo', 'id: opentodo'), ctx), /x-casaos\.id/)
  has(checkTemplate(compose.replace('category: Productivity', 'category: Tasks'), ctx), /category must be one of/)
  has(checkTemplate(compose.replace('name: opentodo\n', 'name: OpenTodo\n'), ctx), /top-level name must be opentodo/)
  has(checkTemplate(compose.replace('  architectures:\n    - amd64\n    - arm64\n', '  architectures:\n    - amd64\n'), ctx), /architectures must be/)
  has(checkTemplate(compose.replace('Apps/OpenTodo/icon.svg', 'Apps/Memos/icon.svg'), ctx), /x-casaos\.icon must be/)
  has(checkTemplate(compose.replace(/  tips:\n    before_install:\n      en_US: .*\n/, ''), ctx), /tips\.before_install/)
  // The committed date, whatever the last release set it to.
  const date = /update_at: "(\d{4}-\d{2}-\d{2})"/.exec(compose)[1]
  has(checkTemplate(compose.replace(`update_at: "${date}"`, `update_at: ${date}`), ctx), /quote dates/)
})

test('casaos: the store folder copy and assets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'casaos-check-'))
  try {
    for (const p of [TEMPLATE, UPSTREAM_DIR, 'deploy/coolify/opentodo.svg']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    assert.deepEqual(checkUpstream(compose, dir), [])
    has(checkUpstream(compose.replace('8418', '8419'), dir), /must be identical/)
    writeFileSync(join(dir, UPSTREAM_DIR, 'icon.svg'), '<svg/>')
    has(checkUpstream(compose, dir), /icon\.svg must be identical to deploy\/coolify\/opentodo\.svg/)
    cpSync(join(ROOT, UPSTREAM_DIR, 'screenshot-1.png'), join(dir, UPSTREAM_DIR, 'icon.png'))
    has(checkUpstream(compose, dir), /icon\.png must be a 256x256 PNG/)
    rmSync(join(dir, UPSTREAM_DIR, 'thumbnail.png'))
    has(checkUpstream(compose, dir), /thumbnail\.png is missing/)
    writeFileSync(join(dir, UPSTREAM_DIR, 'notes.txt'), 'x')
    has(checkUpstream(compose, dir), /notes\.txt is not part of the store folder/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
