// node --test scripts/deploy/umbrel.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, COMPOSE, MANIFEST, parseManifest, routes, UPSTREAM } from './umbrel.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const manifest = readText(MANIFEST)
const compose = readText(COMPOSE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

/** Runs check() on a copy of what it reads, with `edits` ({ path: text | null }) applied. */
function variant(edits, c = ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'umbrel-check-'))
  try {
    for (const p of ['deploy/umbrel', 'internal/httpapi', 'web/public']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    for (const [p, text] of Object.entries(edits)) {
      if (text === null) rmSync(join(dir, p))
      else writeFileSync(join(dir, p), text)
    }
    return check(c, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** The same edit to the template and its upstream copy. */
const both = (file, text) => ({ [`deploy/umbrel/${file}`]: text, [`${UPSTREAM}/${file}`]: text })

test('umbrel: the committed package passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('umbrel: the manifest parser reads folded text, lists of maps and quotes, and nothing else', () => {
  const m = parseManifest(manifest)
  assert.equal(m.manifestVersion, '1')
  assert.deepEqual(m.storage, { dataRoot: 'data' })
  assert.deepEqual(m.gallery, [])
  assert.equal(m.environment.find((e) => e.name === 'OPENTODO_ALLOW_SIGNUP').default, 'false')
  assert.deepEqual(m.environment[0].services, ['web'])
  assert.match(m.description, /your team, from your phone and your computer\.\n\nThere is no default password/)
  assert.deepEqual(parseManifest('a: >-\n  one\n  two\n\n\n  three\nb: "x"\n'), { a: 'one two\n\nthree', b: 'x' })
  assert.throws(() => parseManifest('a: 1\na: 2\n'), /duplicate key/)
  assert.throws(() => parseManifest('a: |\n  x\n'), /unsupported YAML/)
  assert.throws(() => parseManifest('a: &x 1\n'), /unsupported YAML/)
  assert.throws(() => parseManifest('a:\n\tb: 1\n'), /tabs/)
})

test('umbrel: image pinned by release tag and digest, equal to the manifest version', () => {
  // The committed digest, whatever scripts/deploy/pin.mjs last wrote.
  const digest = /@sha256:([0-9a-f]{64})/.exec(compose)[1]
  has(variant(both('docker-compose.yml', compose.replace(`0.9.0@sha256:${digest}`, 'stable'))), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0@sha256/)
  has(variant(both('docker-compose.yml', compose.replace(`@sha256:${digest}`, ''))), /image must be .*@sha256:<index digest>/)
  has(variant(both('umbrel-app.yml', manifest.replace('version: "0.9.0"', 'version: "0.6.0"'))), /manifest version 0\.6\.0 must equal the image tag 0\.9\.0/)
  // A new release makes the pinned package stale until the version, tag and digest are bumped.
  const next = { ...ctx, changelog: '## [0.10.0] - 2026-11-01\n' + ctx.changelog }
  has(variant({}, next), /image must be ghcr\.io\/pixari\/opentodo:0\.10\.0@sha256/)
})

test('umbrel: manifest rules', () => {
  const m = (from, to) => variant(both('umbrel-app.yml', manifest.replace(from, to)))
  has(m('category: files', 'category: productivity'), /category must be one of/)
  has(m('id: opentodo', 'id: open-todo'), /id must be opentodo/)
  has(m('manifestVersion: 1', 'manifestVersion: 2'), /manifestVersion must be 1/)
  has(m('  dataRoot: data', '  dataRoot: opentodo'), /storage must be exactly/)
  has(m('port: 8418', 'port: 8080'), /port must be 8418/)
  has(m('gallery: []', 'gallery:\n  - 1.jpg'), /gallery must be \[\]/)
  has(m('defaultPassword: ""', 'defaultPassword: "changeme"'), /defaultPassword must be ""/)
  has(m('releaseNotes: ""', 'releaseNotes: "New"'), /releaseNotes must be "" until the app is listed/)
  has(m('submission: https://github.com/getumbrel/umbrel-apps/pull/0000', 'submission: https://example.com'), /submission must be the pull request URL/)
  has(m('path: ""', 'path: ""\nicon: https://example.com/x.svg'), /icon is not used/)
  has(m('name: OpenTodo\nversion', 'version: "0.9.0"\nname: OpenTodo\nversion'), /duplicate key|Umbrel's order/)
  has(m('There is no default password', 'There is no password'), /no default password/)
})

test('umbrel: settings offered through the manifest are catalogued OPENTODO_* variables', () => {
  const m = (from, to) => variant(both('umbrel-app.yml', manifest.replace(from, to)))
  has(m('  - name: OPENTODO_TRUSTED_PROXIES', '  - name: OPENTODO_NOPE'), /OPENTODO_NOPE is not read by internal\/config/)
  has(m('  - name: OPENTODO_TRUSTED_PROXIES', '  - name: OPENTODO_MCP'), /not in the variable catalogue/)
  has(m('    default: "false"\n', '    default: "true"\n'), /OPENTODO_ALLOW_SIGNUP defaults to "true", the catalogue says "false"/)
  const noProxies = manifest.replace(/  - name: OPENTODO_TRUSTED_PROXIES\n(    .*\n|      .*\n)+/, '')
  has(variant(both('umbrel-app.yml', noProxies)), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(m('      - web\n    default: ""\n    note: Leave', '      - server\n    default: ""\n    note: Leave'), /services must be \[web\]/)
  has(m(/note: Reverse proxies[^\n]*/, `note: ${'x'.repeat(301)}`), /note must be 1-300 characters/)
})

test('umbrel: compose rules', () => {
  const c = (from, to) => variant(both('docker-compose.yml', compose.replace(from, to)))
  has(c('user: "1000:1000"', 'user: "65532:65532"'), /user must be "1000:1000"/)
  has(c('restart: on-failure', 'restart: unless-stopped'), /restart must be on-failure/)
  has(c('${APP_DATA_DIR}/data:/data', '${APP_DATA_DIR}/data:/config'), /mounted on \/data/)
  has(c('${APP_DATA_DIR}/data:/data', 'opentodo-data:/data'), /the only volume must be/)
  has(c('APP_PORT: 8080', 'APP_PORT: 3000'), /APP_PORT must be 8080/)
  has(c('APP_HOST: opentodo_web_1', 'APP_HOST: opentodo_server_1'), /APP_HOST must be opentodo_web_1/)
  has(c('    stop_grace_period: 1m\n', '    stop_grace_period: 1m\n    ports:\n      - "8418:8080"\n'), /ports is not allowed/)
  has(c('    stop_grace_period: 1m\n', '    stop_grace_period: 1m\n    environment:\n      OPENTODO_LOG_LEVEL: verbose\n'), /OPENTODO_LOG_LEVEL defaults to "verbose"/)
  has(c('      APP_PORT: 8080\n', '      APP_PORT: 8080\n      PROXY_AUTH_ADD: "false"\n'), /PROXY_AUTH_ADD must not be set/)
})

test('umbrel: the auth whitelist names real routes and keeps sign-up behind Umbrel login', () => {
  const c = (from, to) => variant(both('docker-compose.yml', compose.replace(from, to)))
  has(c('/dav,/dav/*,', ''), /must include \/dav \(CalDAV\)/)
  has(c('/api/*,', '/*,/api/*,'), /\/\* is not a route clients need/)
  has(c('PROXY_AUTH_BLACKLIST: "/api/v1/auth/register"', 'PROXY_AUTH_BLACKLIST: "/api/v1/auth/login"'), /PROXY_AUTH_BLACKLIST must be \/api\/v1\/auth\/register/)
  // The whitelist follows the server: a route that disappears from internal/httpapi fails the check.
  const caldav = readText('internal/httpapi/caldav.go')
  has(variant({ 'internal/httpapi/caldav.go': caldav.replace(/\n\tmux\.handle\("\/dav", [^\n]*/, '') }), /OpenTodo serves nothing at \/dav \(/)
  assert.ok(routes().has('/api/v1/auth/register'))
})

test('umbrel: the upstream folder is the package, file for file', () => {
  has(variant({ [`${UPSTREAM}/umbrel-app.yml`]: manifest.replace('tagline: ', 'tagline: New ') }), /umbrel-app\.yml must be identical/)
  has(variant({ [`${UPSTREAM}/docker-compose.yml`]: compose + '\n' }), /docker-compose\.yml must be identical/)
  has(variant({ [`${UPSTREAM}/data/.gitkeep`]: null }), /must hold exactly data\/\.gitkeep/)
  has(variant({ [`${UPSTREAM}/icon.svg`]: '<svg/>' }), /no icon or gallery files/)
  has(variant({ 'deploy/umbrel/upstream/PR.md': null }), /PR\.md \(the pull request text\) is missing/)
})
