// node --test scripts/deploy/caprover.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { checkShared, configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { capRegex, check, checkTemplate, TEMPLATE, UPSTREAM, UPSTREAM_APP, UPSTREAM_LOGO } from './caprover.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const yml = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const all = (text) => {
  const t = checkTemplate(text, ctx)
  return t.variables ? [...t.errors, ...checkShared({ image: t.image, port: t.port, dataTarget: t.dataTarget, variables: t.variables, policy: 'release' }, ctx)] : t.errors
}
const withYml = (from, to) => {
  assert.ok(yml.includes(from), `fixture text not found: ${from}`)
  return all(yml.replace(from, () => to))
}

test('caprover: the committed app passes', () => {
  assert.deepEqual(check(ctx), [])
  const t = checkTemplate(yml, ctx)
  assert.equal(t.image, 'ghcr.io/pixari/opentodo:0.9.0')
  assert.equal(t.port, '8080')
  assert.equal(t.dataTarget, '/data')
  assert.deepEqual([...t.variables.keys()], ['OPENTODO_BASE_URL', 'OPENTODO_SETUP_TOKEN', 'OPENTODO_ALLOW_SIGNUP', 'OPENTODO_TRUSTED_PROXIES'])
})

test('caprover: validRegex is evaluated like CapRover', () => {
  assert.ok(capRegex('/^(true|false)$/').test('true'))
  assert.ok(!capRegex('/^(true|false)$/').test(''))
  assert.ok(capRegex('/^(https?:\\/\\/\\S+)?$/').test(''))
  assert.throws(() => capRegex('^x$'), /\/\.\.\.\/flags/)
})

test('caprover: image policy and the version field', () => {
  has(withYml("defaultValue: '0.9.0'", "defaultValue: '0.6.0'"), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  has(withYml('opentodo:$$cap_opentodo_version', 'opentodo:stable'), /image must be ghcr\.io\/pixari\/opentodo:\$\$cap_opentodo_version/)
  has(withYml('/^[0-9]+\\.[0-9]+(\\.[0-9]+)?$/', '/.{1,}/'), /must refuse "latest"/)
  has(withYml("defaultValue: '0.9.0'", 'defaultValue: 0.6'), /defaultValue must be a string/)
})

test('caprover: port, volume and service keys', () => {
  has(withYml("containerHttpPort: '8080'", "containerHttpPort: '3000'"), /port must be 8080/)
  has(withYml("containerHttpPort: '8080'", 'containerHttpPort: 8080'), /quoted string/)
  has(withYml('$$cap_appname-data:/data', '$$cap_appname-data:/config'), /mounted on \/data/)
  has(withYml('- $$cap_appname-data:/data', '- /srv/opentodo:/data'), /named volume/)
  has(withYml('        volumes:\n', '        ports:\n            - 8080:8080\n        volumes:\n'), /no "ports"/)
  has(withYml('        volumes:\n', '        restart: always\n        volumes:\n'), /"restart" is not used/)
  has(withYml('services:\n    $$cap_appname:', 'services:\n    opentodo:'), /one service, named \$\$cap_appname/)
  has(withYml('captainVersion: 4', 'captainVersion: 2'), /captainVersion must be 4/)
})

test('caprover: OPENTODO_ variables and form fields', () => {
  has(withYml('            OPENTODO_TRUSTED_PROXIES: $$cap_opentodo_trusted_proxies\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(withYml('            OPENTODO_TRUSTED_PROXIES: $$cap_opentodo_trusted_proxies\n', '            OPENTODO_TRUSTED_PROXIES: $$cap_opentodo_trusted_proxies\n            OPENTODO_NOPE: $$cap_opentodo_nope\n'), /\$\$cap_opentodo_nope is used but not declared/)
  has(withYml("label: Open sign-up\n          defaultValue: 'false'", "label: Open sign-up\n          defaultValue: 'true'"), /defaults to "true", the catalogue says "false"/)
  has(withYml("label: Open sign-up\n          defaultValue: 'false'", "label: Open sign-up\n          defaultValue: 'yes'"), /does not match its validRegex/)
  has(withYml('OPENTODO_ALLOW_SIGNUP: $$cap_opentodo_allow_signup', 'OPENTODO_ALLOW_SIGNUP: "false"'), /must be \$\$cap_opentodo_allow_signup, a form field/)
  has(withYml('true lets anyone who can reach the server', 'True lets anyone who can reach the server'), /description must be the catalogue's/)
  has(withYml("label: Open sign-up\n          defaultValue: 'false'", "label: Open sign-up"), /must not be required/)
  // CapRover replaces ids one after another with split/join: a prefix would corrupt the longer id.
  has(withYml('        - id: $$cap_opentodo_trusted_proxies\n', '        - id: $$cap_opentodo\n          label: X\n          description: $$cap_opentodo\n        - id: $$cap_opentodo_trusted_proxies\n'), /must not be prefixes of each other/)
  has(withYml('        - id: $$cap_opentodo_trusted_proxies\n', '        - id: $$cap_opentodo_unused\n          label: X\n          description: X\n        - id: $$cap_opentodo_trusted_proxies\n'), /\$\$cap_opentodo_unused is declared but never used/)
})

test('caprover: setup token, base URL and instructions', () => {
  has(withYml('defaultValue: $$cap_gen_random_hex(32)', 'defaultValue: $$cap_gen_random_hex(8)'), /N >= 16|does not match its validRegex/)
  has(withYml('defaultValue: $$cap_gen_random_hex(32)', 'defaultValue: changeme-changeme-changeme'), /generated per install/)
  has(withYml('/^(\\S{16,})?$/', '/.*/'), /refuse tokens shorter than 16/)
  has(withYml("label: Base URL\n", "label: Base URL\n          defaultValue: https://$$cap_appname.$$cap_root_domain\n"), /must start empty/)
  has(withYml('enter: $$cap_opentodo_setup_token', 'enter it'), /show the generated setup token/)
  has(withYml('set OPENTODO_BASE_URL to https://$$cap_appname.$$cap_root_domain', 'set the base URL'), /instructions\.end must say to set OPENTODO_BASE_URL/)
  has(withYml('isOfficial: false', 'isOfficial: true'), /isOfficial must be false/)
  has(withYml('    displayName: OpenTodo\n', '    displayName: Open Todo\n'), /displayName must be OpenTodo/)
})

test('caprover: strict parsing', () => {
  has(all(yml.replace('captainVersion: 4\n', 'captainVersion: 4\n\tx: 1\n')), /tabs are not allowed/)
  has(all(yml.replace('    displayName: OpenTodo\n', '    displayName: OpenTodo\n    displayName: OpenTodo\n')), /duplicate key displayName/)
  has(all(yml.replace('captainVersion: 4\n', 'captainVersion: 4\nx: &a 1\n')), /anchors/)
})

test('caprover: upstream copies and logo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caprover-check-'))
  try {
    for (const p of ['deploy', 'internal/config', 'scripts', 'web/public/pwa-512.png', 'CHANGELOG.md']) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    }
    assert.deepEqual(check(ctx, dir), [])
    writeFileSync(join(dir, UPSTREAM_APP), yml + '# drift\n')
    has(check(ctx, dir), /public\/v4\/apps\/opentodo\.yml must be identical/)
    writeFileSync(join(dir, UPSTREAM_LOGO), 'not a png')
    has(check(ctx, dir), /logos\/opentodo\.png must be identical to web\/public\/pwa-512\.png/)
    writeFileSync(join(dir, UPSTREAM, 'public/v4/apps/other.yml'), 'x: 1\n')
    has(check(ctx, dir), /other\.yml is not part of the pull request/)
    rmSync(join(dir, UPSTREAM, 'PR.md'))
    has(check(ctx, dir), /PR\.md is missing/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
