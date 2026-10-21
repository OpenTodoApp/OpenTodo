// node --test scripts/deploy/render.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import { BLUEPRINT, BUTTON_URL, check, checkBlueprint, checkLinks, DOCS, README } from './render.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const text = readText(BLUEPRINT)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const sub = (a, b) => {
  assert.ok(text.includes(a), `render.yaml should contain ${a}`)
  return checkBlueprint(text.replace(a, b), ctx)
}

test('render: the committed Blueprint and links pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('render: strict YAML and Blueprint fields', () => {
  has(checkBlueprint(text.replace('services:', 'services: &s'), ctx), /supported YAML subset/)
  has(sub('services:\n', 'databases: []\nservices:\n'), /only services/)
  has(sub('services:\n', 'servics: []\nservices:\n'), /not a Blueprint root field/)
  has(sub('    healthCheckPath', '    healthcheckPath: /healthz\n    healthCheckPath'), /"healthcheckPath" is not a Render Blueprint field/)
  has(sub('    healthCheckPath', '    numInstances: 2\n    healthCheckPath'), /does not use "numInstances" \(a service with a disk/)
  has(sub('    healthCheckPath', '    repo: https://github.com/pixari/opentodo\n    healthCheckPath'), /does not use "repo"/)
  has(sub('type: web\n    name', 'type: pserv\n    name'), /type must be web/)
  has(sub('runtime: image', 'runtime: docker'), /runtime must be image/)
  has(sub('healthCheckPath: /healthz', 'healthCheckPath: /'), /healthCheckPath must be \/healthz/)
  has(sub('      url: ghcr.io/pixari/opentodo:stable', '      url: ghcr.io/pixari/opentodo:stable\n      creds: x'), /image must be \{ url/)
})

test('render: image policy, port and data path', () => {
  has(sub('opentodo:stable', 'opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(sub('opentodo:stable', 'opentodo:0.9.0'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(sub('value: "8080"', 'value: "10000"'), /port must be 8080/)
  has(sub('value: "8080"', 'value: 8080'), /PORT: value must be a quoted string/)
  has(sub('      - key: PORT\n        value: "8080"\n', ''), /PORT must be set/)
  has(sub('mountPath: /data', 'mountPath: /var/data'), /mounted on \/data/)
  has(sub('      sizeGB: 1', '      sizeGB: 0'), /sizeGB must be a whole number/)
})

test('render: plan and disk', () => {
  has(sub('plan: 0.5c-512mb', 'plan: free'), /cannot be free/)
  has(sub('plan: 0.5c-512mb', 'plan: tiny'), /plan must be one of/)
  has(sub('    disk:\n      name: opentodo-data\n      mountPath: /data\n      sizeGB: 1\n', ''), /a disk is required/)
  has(sub('      sizeGB: 1', '      sizeGB: 1\n      size: 2'), /"size" is not a disk field/)
})

test('render: variables', () => {
  has(sub('generateValue: true', 'value: "a-shared-secret-for-everyone"'), /OPENTODO_SETUP_TOKEN: must be generateValue: true/)
  has(sub('envVarKey: RENDER_EXTERNAL_URL', 'envVarKey: RENDER_EXTERNAL_HOSTNAME'), /must reference the service itself/)
  has(sub('          name: opentodo\n', '          name: other\n'), /must reference the service itself/)
  has(sub('key: OPENTODO_TRUSTED_PROXIES\n        value: ""', 'key: OPENTODO_TRUSTED_PROXIES\n        sync: false'), /instead of sync: false/)
  has(sub('key: OPENTODO_ALLOW_SIGNUP\n        value: "false"', 'key: OPENTODO_ALLOW_SIGNUP\n        value: "true"'), /defaults to "true", the catalogue says "false"/)
  has(sub('      - key: OPENTODO_TRUSTED_PROXIES\n        value: ""\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(sub('      - key: OPENTODO_TRUSTED_PROXIES', '      - key: OPENTODO_NOPE\n        value: ""\n      - key: OPENTODO_TRUSTED_PROXIES'), /not read by internal\/config/)
  has(sub('      - key: OPENTODO_TRUSTED_PROXIES', '      - key: OPENTODO_MCP\n        value: "true"\n      - key: OPENTODO_TRUSTED_PROXIES'), /not in the variable catalogue/)
  has(sub('      - key: OPENTODO_TRUSTED_PROXIES', '      - key: OPENTODO_LOG_LEVEL\n        generateValue: true\n      - key: OPENTODO_TRUSTED_PROXIES'), /only OPENTODO_SETUP_TOKEN is generated/)
  has(sub('      - key: OPENTODO_TRUSTED_PROXIES', '      - fromGroup: shared\n      - key: OPENTODO_TRUSTED_PROXIES'), /needs a key \(no fromGroup\)/)
  has(sub('key: OPENTODO_ALLOW_SIGNUP\n', 'key: OPENTODO_TRUSTED_PROXIES\n'), /listed twice/)
})

test('render: the button URL is in the README and the guide', () => {
  assert.deepEqual(checkLinks(readText(README), readText(DOCS)), [])
  has(checkLinks(readText(README).replaceAll(BUTTON_URL, 'https://render.com/deploy'), readText(DOCS)), /must link the Deploy to Render button/)
  has(checkLinks(readText(README), null), /render\.md is missing/)
})
