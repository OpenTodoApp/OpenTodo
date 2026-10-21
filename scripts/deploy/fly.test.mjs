// node --test scripts/deploy/fly.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkShared, configVariables, loadFacts, readText } from './common.mjs'
import { check, checkInstructions, checkTemplate, GUIDE, parseToml, parseValue, README, TEMPLATE } from './fly.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const toml = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const all = (text) => {
  const t = checkTemplate(text, ctx)
  if (!t.variables) return t.errors
  t.variables.set('OPENTODO_SETUP_TOKEN', { default: '', required: false })
  return [...t.errors, ...checkShared({ image: t.image, port: t.port, dataTarget: t.dataTarget, variables: t.variables, policy: 'stable' }, ctx)]
}
const withToml = (from, to) => {
  assert.ok(toml.includes(from), `fixture text not found: ${from}`)
  return all(toml.replace(from, to))
}

test('fly: the committed file passes', () => {
  assert.deepEqual(check(ctx), [])
  assert.deepEqual(all(toml), [])
})

test('fly: TOML subset parser', () => {
  const t = parseToml(toml)
  assert.equal(t.build.image, 'ghcr.io/pixari/opentodo:stable')
  assert.deepEqual(t.mounts, { source: 'opentodo_data', destination: '/data', initial_size: '1gb' })
  assert.equal(t.http_service.internal_port, 8080)
  assert.equal(t.http_service.force_https, true)
  assert.deepEqual(t.http_service.checks, [{ method: 'GET', path: '/healthz', interval: '30s', timeout: '5s', grace_period: '10s' }])
  assert.deepEqual(t.vm, [{ size: 'shared-cpu-1x', memory: '256mb' }])
  assert.equal(t.env.OPENTODO_BASE_URL, '')
  assert.deepEqual(parseValue('["a", \'b\', 1_000, true]'), ['a', 'b', 1000, true])
  assert.equal(parseValue('"a # not a comment \\u0041"'), 'a # not a comment A')
  assert.deepEqual(parseToml('a = "x" # comment\n'), { a: 'x' })
  assert.throws(() => parseToml('a = 1\na = 2\n'), /line 2: duplicate key a/)
  assert.throws(() => parseToml('[x]\n[x]\n'), /defined twice/)
  assert.throws(() => parseToml('a = 1.5\n'), /no floats/)
  assert.throws(() => parseToml('a = { b = 1 }\n'), /inline tables/)
  assert.throws(() => parseToml('a = """x"""\n'), /trailing text|unterminated/)
  assert.throws(() => parseToml('a = "x\n'), /unterminated/)
  assert.throws(() => parseToml('a.b = 1\n'), /expected \[table\]/)
  assert.throws(() => parseToml('\ta = 1\n'), /tabs/)
})

test('fly: image policy', () => {
  has(withToml('opentodo:stable', 'opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(withToml('opentodo:stable', 'opentodo:0.9.0'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(withToml('[build]\n  image = "ghcr.io/pixari/opentodo:stable"\n', ''), /\[build\] with image is required/)
  has(withToml('  image = "ghcr.io/pixari/opentodo:stable"\n', '  image = "ghcr.io/pixari/opentodo:stable"\n  dockerfile = "Dockerfile"\n'), /\[build\] "dockerfile" is not allowed/)
})

test('fly: port, volume and one machine', () => {
  has(withToml('internal_port = 8080', 'internal_port = 3000'), /port must be 8080/)
  has(withToml('destination = "/data"', 'destination = "/config"'), /mounted on \/data/)
  has(withToml('[mounts]', '[[mounts]]'), /one \[mounts\] table/)
  has(withToml('source = "opentodo_data"', 'source = "opentodo-data"'), /volume name of lowercase letters, digits and _/)
  has(all(toml.replace(/\[mounts\]\n(.*\n){3}/, '')), /\[mounts\] is required/)
  has(withToml('auto_stop_machines = "off"', 'auto_stop_machines = "stop"'), /auto_stop_machines must be "off"/)
  has(withToml('min_machines_running = 1', 'min_machines_running = 0'), /min_machines_running must be 1/)
  has(withToml('force_https = true', 'force_https = false'), /force_https must be true/)
  has(withToml('[[vm]]', '[deploy]\n  strategy = "bluegreen"\n\n[[vm]]'), /strategy must be rolling or immediate/)
  has(withToml('kill_timeout = "30s"', 'kill_timeout = 30'), /duration string/)
})

test('fly: health check', () => {
  has(withToml('path = "/healthz"', 'path = "/"'), /path must be \/healthz/)
  has(withToml('    interval = "30s"\n', ''), /interval must be a duration/)
  has(all(toml.replace(/  \[\[http_service\.checks\]\]\n(.*\n){5}/, '')), /one \[\[http_service\.checks\]\] entry/)
})

test('fly: variables, secrets and unknown keys', () => {
  has(withToml('  OPENTODO_TRUSTED_PROXIES = ""\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(withToml('OPENTODO_ALLOW_SIGNUP = "false"', 'OPENTODO_ALLOW_SIGNUP = "true"'), /defaults to "true", the catalogue says "false"/)
  has(withToml('  OPENTODO_TRUSTED_PROXIES = ""\n', '  OPENTODO_TRUSTED_PROXIES = ""\n  OPENTODO_NOPE = "x"\n'), /OPENTODO_NOPE is not read by internal\/config/)
  has(withToml('  OPENTODO_TRUSTED_PROXIES = ""\n', '  OPENTODO_TRUSTED_PROXIES = ""\n  OPENTODO_SETUP_TOKEN = "0123456789abcdef"\n'), /must not be in \[env\]/)
  has(withToml('OPENTODO_BASE_URL = ""', 'OPENTODO_BASE_URL = "https://opentodo.fly.dev"'), /must be empty in the committed file/)
  has(withToml('OPENTODO_ALLOW_SIGNUP = "false"', 'OPENTODO_ALLOW_SIGNUP = false'), /must be a string/)
  has(withToml('kill_signal = "SIGTERM"', 'app = "opentodo"\nkill_signal = "SIGTERM"'), /"app" is not allowed here: fly launch --name writes it/)
  has(withToml('kill_signal = "SIGTERM"', 'primary_region = "ams"\nkill_signal = "SIGTERM"'), /"primary_region" is not allowed/)
  has(withToml('[[vm]]', '[[services]]\n  internal_port = 8080\n\n[[vm]]'), /"services" is not allowed here: use \[http_service\] only/)
  has(withToml('    method = "GET"', '    methd = "GET"'), /"methd" is not allowed/)
})

test('fly: the instructions set the setup token as a secret', () => {
  const readme = readText(README)
  const guide = readText(GUIDE)
  assert.deepEqual(checkInstructions(readme, guide), [])
  has(checkInstructions(readme.replaceAll('fly secrets set OPENTODO_SETUP_TOKEN=', 'fly secrets set TOKEN='), guide), /README\.md must tell people to run fly secrets set OPENTODO_SETUP_TOKEN=/)
  has(checkInstructions(readme, guide.replaceAll('fly launch --copy-config --no-deploy', 'fly launch')), /fly\.md must use fly launch --copy-config --no-deploy/)
  has(checkInstructions(readme, null), /fly\.md is missing/)
})
