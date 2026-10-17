// node --test scripts/deploy/*.test.mjs  (OpenSpec change unraid-template)
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { run } from '../deploy-check.mjs'
import { checkFacts, checkPublishesTag, checkShared, configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { checkTemplate as checkUnraid, checkUpstream, PROFILE, TEMPLATE } from './unraid.mjs'

const facts = loadFacts()
const configVars = configVariables()
const changelog = readText('CHANGELOG.md')
const ctx = { facts, configVars, changelog }
const unraid = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)

test('the release job publishes the tag the templates name', () => {
  const ci = readText('.github/workflows/ci.yml')
  assert.deepEqual(checkPublishesTag(ci, facts), [])
  has(checkPublishesTag(ci.replace(/ *type=raw,value=stable,.*\n/, ''), facts), /no longer publishes the "stable" tag/)
  has(checkPublishesTag(null, facts), /ci\.yml is missing/)
})

test('every catalogue variable is read by the server', () => {
  assert.deepEqual(checkFacts(facts, configVars), [])
  has(checkFacts({ variables: [{ name: 'OPENTODO_NOPE', default: '', description: 'x' }] }, configVars), /does not read/)
})

test('the committed templates pass', async () => {
  for (const r of await run()) assert.deepEqual(r.errors, [], r.name)
})

test('shared rules: tag, port, data, variables', () => {
  const ok = () => ({
    image: `${facts.image}:stable`,
    port: facts.port,
    dataTarget: facts.dataDir,
    variables: new Map(facts.variables.filter((v) => v.essential).map((v) => [v.name, { default: v.default, required: false }])),
  })
  assert.deepEqual(checkShared(ok(), ctx), [])
  // Every template names the stable tag (OpenSpec stable-image-tag): not latest (main), not a release line.
  has(checkShared({ ...ok(), image: `${facts.image}:latest` }, ctx), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(checkShared({ ...ok(), image: `${facts.image}:0.6` }, ctx), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(checkShared({ ...ok(), port: 3000 }, ctx), /port must be 8080/)
  has(checkShared({ ...ok(), dataTarget: '/config' }, ctx), /mounted on \/data/)
  const unknown = ok(); unknown.variables.set('OPENTODO_NOPE', { default: '', required: false })
  has(checkShared(unknown, ctx), /not read by internal\/config/)
  const notCatalogued = ok(); notCatalogued.variables.set('OPENTODO_MCP', { default: '', required: false })
  has(checkShared(notCatalogued, ctx), /not in the variable catalogue/)
  const wrongDefault = ok(); wrongDefault.variables.set('OPENTODO_ALLOW_SIGNUP', { default: 'true', required: false })
  has(checkShared(wrongDefault, ctx), /defaults to "true", the catalogue says "false"/)
  const required = ok(); required.variables.set('OPENTODO_LOG_LEVEL', { default: 'info', required: true })
  has(checkShared(required, ctx), /must not be required/)
  const missing = ok(); missing.variables.delete('OPENTODO_TRUSTED_PROXIES')
  has(checkShared(missing, ctx), /OPENTODO_TRUSTED_PROXIES must be offered/)
})

test('unraid: path, port, required, shell, description', () => {
  assert.deepEqual(checkUnraid(unraid, ctx), [])
  has(checkUnraid(unraid.replace('Target="/data"', 'Target="/config"'), ctx), /mounted on \/data/)
  has(checkUnraid(unraid.replace('Target="8080" Default="8080"', 'Target="3000" Default="8080"'), ctx), /port must be 8080/)
  has(checkUnraid(unraid.replace(/(Target="OPENTODO_LOG_LEVEL"[^>]*)Required="false"/, '$1Required="true"'), ctx), /must not be required/)
  has(checkUnraid(unraid.replace('  <Privileged>', '  <Shell>sh</Shell>\n  <Privileged>'), ctx), /image has no shell/)
  has(checkUnraid(unraid.replace(/(Target="OPENTODO_SESSION_DAYS" Default="90" Mode="" Description=")[^"]*/, '$1Something else'), ctx), /must be the catalogue's/)
  has(checkUnraid(unraid.replace('opentodo:stable', 'opentodo:0.6'), ctx), /image must be .*:stable/)
  has(checkUnraid(unraid.replace('<Privileged>false', '<Privileged>true'), ctx), /Privileged/)
  has(checkUnraid(unraid.replace('pixari/opentodo-unraid/main/templates', 'pixari/opentodo/main/deploy/unraid'), ctx), /TemplateURL/)
})

test('unraid: the template repository copy', () => {
  const profile = readText(PROFILE)
  assert.deepEqual(checkUpstream(unraid, unraid, profile), [])
  has(checkUpstream(unraid, unraid.replace('0.', '9.'), profile), /must be identical/)
  has(checkUpstream(unraid, unraid, null), /ca_profile.xml is missing/)
  has(checkUpstream(unraid, unraid, profile.replace(/<Profile>[^<]*<\/Profile>/, '')), /needs a <Profile>/)
})

test('a platform folder without a checker fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-check-'))
  try {
    for (const p of ['deploy', 'internal/config', 'internal/httpapi', 'scripts/deploy', 'scripts/coolify-template-check.mjs', 'web/public', 'CHANGELOG.md']) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    mkdirSync(join(dir, 'deploy/example-platform'))
    writeFileSync(join(dir, 'deploy/example-platform/app.yaml'), 'x: 1\n')
    const results = await run(dir)
    const r = results.find((x) => x.name === 'deploy/example-platform')
    has(r.errors, /no checker: add scripts\/deploy\/example-platform\.mjs/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
