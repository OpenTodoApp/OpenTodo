// node --test scripts/deploy/homeassistant.test.mjs  (OpenSpec change homeassistant-addon)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { ADDON, check, checkVersion, UPSTREAM } from './homeassistant.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

/** Runs check() on a copy of deploy/homeassistant with `edits` ({ path: text | null }) applied. */
function variant(edits, c = ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'homeassistant-check-'))
  try {
    cpSync(join(ROOT, 'deploy/homeassistant'), join(dir, 'deploy/homeassistant'), { recursive: true })
    for (const [p, text] of Object.entries(edits)) {
      if (text === null) rmSync(join(dir, p))
      else writeFileSync(join(dir, p), text)
    }
    return check(c, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const edit = (file, from, to) => {
  const text = readText(`${ADDON}/${file}`)
  assert.ok(text.includes(from), `${file} does not contain ${from}`)
  return variant({ [`${ADDON}/${file}`]: text.replace(from, to) })
}
const config = (from, to) => edit('config.yaml', from, to)

test('homeassistant: the committed add-on repository passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('homeassistant: the version follows the release', () => {
  const v = /^version: "(.+)"$/m.exec(readText(`${ADDON}/config.yaml`))[1]
  assert.deepEqual(checkVersion(v, ctx.changelog), [])
  assert.deepEqual(checkVersion(`${v}.1`, ctx.changelog), [])
  has(checkVersion('0.6.0', ctx.changelog), /version must be/)
  has(checkVersion(`${v}-1`, ctx.changelog), /version must be/)
  const next = { ...ctx, changelog: '## [9.9.0] - 2099-01-01\n' + ctx.changelog }
  const errors = variant({}, next)
  has(errors, /version must be 9\.9\.0/)
  has(errors, /image must be ghcr\.io\/pixari\/opentodo:9\.9\.0/)
  has(config(`version: "${v}"`, `version: "${v}.1"`), /needs a "## .*\.1" entry/)
  has(config(`version: "${v}"`, `version: ${v}`.replace(/\.\d+$/, '')), /version must be a quoted string|version must be/)
})

test('homeassistant: config.yaml rules', () => {
  has(config('image: ghcr.io/pixari/opentodo-homeassistant', 'image: ghcr.io/pixari/opentodo'), /image must be ghcr\.io\/pixari\/opentodo-homeassistant/)
  has(config('  - aarch64\n', ''), /arch must be aarch64 and amd64/)
  has(config('init: false', 'init: true'), /init must be false/)
  has(config('backup: cold', 'backup: hot'), /backup must be cold/)
  has(config('8080/tcp: 8080', '3000/tcp: 8080'), /container port must be 8080/)
  has(config('webui: http://[HOST]:[PORT:8080]/', 'webui: http://[HOST]:8080/'), /webui must be/)
  has(config('init: false', 'init: false\ningress: true'), /ingress is not used .*root of its own address/)
  has(config('slug: opentodo', 'slug: open-todo'), /slug must be opentodo/)
})

test('homeassistant: options mirror the catalogue', () => {
  has(config('  allow_signup: false\n  log_level', '  allow_signup: true\n  log_level'), /OPENTODO_ALLOW_SIGNUP defaults to "true"/)
  has(config('  log_level: info\n', '  log_level: debug\n'), /OPENTODO_LOG_LEVEL defaults to "debug"/)
  has(config('  trusted_proxies: str?\n', ''), /schema must have exactly|OPENTODO_TRUSTED_PROXIES must be offered/)
  has(config('  setup_token: password?', '  setup_token: str?'), /schema\.setup_token must be password\?/)
  has(config('  log_level: info\n', '  log_level: info\n  base_url: ""\n'), /base_url is optional, leave it out of options/)
  has(config('  log_level: info\n', ''), /options needs a default for log_level/)
  has(edit('translations/en.yaml', 'name: Trusted proxies\n', ''), /trusted_proxies needs a name/)
  has(edit('translations/en.yaml', 'Set it only when every request comes through them.', 'Set it.'), /description of trusted_proxies must be the catalogue's/)
})

test('homeassistant: the image and the start script', () => {
  has(edit('Dockerfile', 'COPY --from=opentodo /opentodo /usr/bin/opentodo', 'COPY --from=opentodo /opentodo /opentodo'), /must COPY --from=opentodo/)
  has(edit('Dockerfile', 'FROM ghcr.io/home-assistant/base:', 'FROM alpine:'), /FROM ghcr\.io\/home-assistant\/base/)
  has(edit('Dockerfile', 'OPENTODO_DATA_DIR=/data', 'OPENTODO_DATA_DIR=/data/opentodo'), /mounted on \/data/)
  has(edit('Dockerfile', '"healthcheck"]', '"version"]'), /HEALTHCHECK must run/)
  has(edit('Dockerfile', 'FROM ghcr.io/pixari/opentodo:${OPENTODO_VERSION} AS opentodo', 'FROM ghcr.io/pixari/opentodo:stable AS opentodo'), /needs FROM ghcr\.io\/pixari\/opentodo:\$\{OPENTODO_VERSION\}/)
  has(edit('run.sh', 'export OPENTODO_TRUSTED_PROXIES=', 'export TRUSTED_PROXIES='), /does not export OPENTODO_TRUSTED_PROXIES/)
  has(edit('run.sh', 'option base_url', 'option url'), /does not read the option base_url/)
})

test('homeassistant: the repository files', () => {
  has(variant({ [`${UPSTREAM}/opentodo/apparmor.txt`]: null }), /apparmor\.txt is missing/)
  has(variant({ [`${UPSTREAM}/notes.txt`]: 'x' }), /notes\.txt is not part of the add-on repository/)
  has(variant({ [`${UPSTREAM}/opentodo/icon.png`]: 'not a png' }), /icon\.png must be a 128x128 PNG/)
  has(edit('../repository.yaml', 'url: https://github.com/pixari/opentodo-homeassistant-addons', 'url: https://example.com'), /repository\.yaml: url must be/)
})
