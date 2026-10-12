// node --test scripts/coolify-template-check.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLogo, checkTemplate, latestRelease, loadInputs, parseHeader, parseYaml, splitComment } from './coolify-template-check.mjs'

const base = loadInputs()

/** Runs the check on a modified template (the upstream copy follows, so only the edited rule fails). */
function check(edit) {
  const template = edit(base.template)
  return checkTemplate({ ...base, template, upstreamTemplate: template })
}

const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

test('the committed template passes', () => {
  assert.deepEqual(checkTemplate(base), [])
})

test('floating or stale image tags fail', () => {
  has(check((t) => t.replace(/opentodo:[\d.]+/, 'opentodo:latest')), /no latest or floating tags/)
  has(check((t) => t.replace(/opentodo:[\d.]+/, 'opentodo:0.1')), /does not match the latest release/)
  const rel = latestRelease(base.changelog)
  assert.deepEqual(check((t) => t.replace(/opentodo:[\d.]+/, `opentodo:${rel.major}.${rel.minor}.${rel.patch}`)), [])
})

test('a missing or different health check fails', () => {
  has(check((t) => t.replace(/ {4}healthcheck:[\s\S]*$/, '')), /a healthcheck is required/)
  has(check((t) => t.replace('["CMD", "/opentodo", "healthcheck"]', '["CMD", "curl", "-f", "http://127.0.0.1:8080"]')), /healthcheck\.test/)
})

test('build, ports and missing /data volume fail', () => {
  has(check((t) => t.replace('    image:', '    build: .\n    image:')), /must not set "build"/)
  has(check((t) => t.replace('    volumes:', '    ports:\n      - "8080:8080"\n    volumes:')), /must not set "ports"/)
  has(check((t) => t.replace('opentodo-data:/data', 'opentodo-data:/var/lib/opentodo')), /opentodo-data:\/data/)
})

test('variables: unknown, required, without default, and the magic domain variable', () => {
  has(check((t) => t.replace('      - OPENTODO_PUSH=', '      - OPENTODO_NOT_A_SETTING=${OPENTODO_NOT_A_SETTING:-}\n      - OPENTODO_PUSH=')), /OPENTODO_NOT_A_SETTING is not read by internal\/config/)
  has(check((t) => t.replace('${OPENTODO_PUSH:-on}', '${OPENTODO_PUSH:?}')), /must not be required/)
  has(check((t) => t.replace('${OPENTODO_PUSH:-on}', 'on')), /OPENTODO_PUSH must be written as/)
  has(check((t) => t.replace('SERVICE_URL_OPENTODO_8080', 'SERVICE_FQDN_OPENTODO_8080')), /SERVICE_URL_OPENTODO_8080/)
  has(check((t) => t.replace(/ {6}- OPENTODO_TRUSTED_PROXIES=.*\n/, '')), /must reference OPENTODO_TRUSTED_PROXIES/)
})

test('header fields and order', () => {
  has(check((t) => t.replace(/^# port: 8080\n/m, '')), /header fields must be exactly/)
  has(check((t) => t.replace(/^(# slogan:.*)\n(# documentation:.*)$/m, '$2\n$1').replace(/^(# documentation:.*)\n(# slogan:.*)$/m, '$2\n$1')), /in that order/)
})

test('upstream copy must be identical', () => {
  has(checkTemplate({ ...base, upstreamTemplate: base.template + '\n' }), /must be identical/)
})

test('logo rules', () => {
  assert.deepEqual(checkLogo(base.logo), [])
  has(checkLogo(base.logo.replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 32"')), /square viewBox/)
  has(checkLogo(base.logo.replace('<rect', '<image href="https://example.com/x.png"/><rect')), /external references/)
})

test('parser: comments, flow arrays, strictness', () => {
  assert.deepEqual(splitComment('  - A=${B:-x} # note'), ['  - A=${B:-x}', 'note'])
  assert.deepEqual(splitComment('  - "A=#not" # yes'), ['  - "A=#not"', 'yes'])
  assert.deepEqual(parseYaml('a:\n  b: [ "x", "y" ]\n  c:\n    - one\n'), { a: { b: ['x', 'y'], c: ['one'] } })
  assert.throws(() => parseYaml('a: &anchor x\n'), /unsupported/)
  assert.throws(() => parseYaml('a:\n  - b: c\n'), /maps inside sequences/)
  assert.deepEqual(parseHeader('# port: 8080\n# logo: svgs/x.svg\n').map(([k]) => k), ['port', 'logo'])
})
