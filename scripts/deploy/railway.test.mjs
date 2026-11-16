// node --test scripts/deploy/railway.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import { check, checkOverview, checkTemplate, OVERVIEW, TEMPLATE } from './railway.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const text = readText(TEMPLATE)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const sub = (a, b) => {
  assert.ok(text.includes(a), `template.json should contain ${a}`)
  return checkTemplate(text.replace(a, b), ctx)
}

test('railway: the committed template, overview and guide pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('railway: image, volume, health check and networking', () => {
  has(sub('opentodo:stable', 'opentodo:latest'), /image must be ghcr\.io\/opentodoapp\/opentodo:stable/)
  has(sub('"mountPath": "/data"', '"mountPath": "/app/data"'), /mounted on \/data/)
  has(sub('"healthcheckPath": "/healthz"', '"healthcheckPath": "/"'), /healthcheckPath must be \/healthz/)
  has(sub('"replicas": 1', '"replicas": 2'), /replicas must be 1/)
  has(sub('"targetPort": 8080', '"targetPort": 3000'), /targetPort must equal PORT/)
  has(sub('"value": "8080"', '"value": "3000"'), /port must be 8080/)
  has(sub('"source": { "image"', '"source": { "repo": "x", "image"'), /source must be \{ image \}/)
})

test('railway: variables', () => {
  has(sub('"${{secret(32)}}"', '"changeme-changeme"'), /OPENTODO_SETUP_TOKEN: must be \$\{\{secret\(32\)\}\}/)
  has(sub('"https://${{RAILWAY_PUBLIC_DOMAIN}}"', '"${{RAILWAY_PUBLIC_DOMAIN}}"'), /OPENTODO_BASE_URL: must be https/)
  has(sub('"RAILWAY_RUN_UID", "value": "0"', '"RAILWAY_RUN_UID", "value": "65532"'), /RAILWAY_RUN_UID: must be 0/)
  has(sub('"OPENTODO_ALLOW_SIGNUP", "value": "false"', '"OPENTODO_ALLOW_SIGNUP", "value": "true"'), /OPENTODO_ALLOW_SIGNUP defaults to "true"/)
  has(sub('{ "name": "OPENTODO_TRUSTED_PROXIES"', '{ "name": "OPENTODO_NOPE", "value": "", "description": "Not a real variable at all." },\n      { "name": "OPENTODO_TRUSTED_PROXIES"'), /OPENTODO_NOPE is not read by internal\/config/)
  has(sub('"description": "Leave empty on Railway: its edge proxy is the only hop."', '"description": ""'), /OPENTODO_TRUSTED_PROXIES: a description is required/)
})

test('railway: the overview follows the best-practices headings', () => {
  const overview = readText(OVERVIEW)
  assert.deepEqual(checkOverview(overview), [])
  has(checkOverview(overview.replace('## Common Use Cases\n', '')), /"## Common Use Cases" is missing/)
})
