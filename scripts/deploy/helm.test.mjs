// node --test scripts/deploy/helm.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import {
  ARTIFACTHUB, CHART, DEPLOYMENT, SCHEMA, VALUES, WORKFLOW,
  check, checkArtifactHub, checkChart, checkDeployment, checkValues, checkWorkflow,
} from './helm.mjs'
import { checkShared } from './common.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const chart = readText(CHART)
const values = readText(VALUES)
const schema = readText(SCHEMA)
const deployment = readText(DEPLOYMENT)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const valuesFound = (text, s = schema) => checkValues(text, s, '0.9.0', ctx)
/** The shared rules on values.yaml as the chart renders it. */
const shared = (text) => {
  const v = valuesFound(text)
  const d = checkDeployment(deployment, ctx)
  return [...v.errors, ...checkShared({ ...v.found, port: d.port, dataTarget: d.dataTarget, policy: 'release' }, ctx)]
}

test('helm: the committed chart passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('helm: Chart.yaml follows the latest release', () => {
  assert.deepEqual(checkChart(chart, ctx).errors, [])
  has(checkChart(chart.replace('version: 0.9.0', 'version: 0.8.0'), ctx).errors, /version \(0\.8\.0\) must equal appVersion/)
  has(checkChart(chart.replace('appVersion: "0.9.0"', 'appVersion: "0.6.0"'), ctx).errors, /appVersion must be 0\.9\.0/)
  has(checkChart(chart.replace('appVersion: "0.9.0"', 'appVersion: 0.9.0'), ctx).errors, /quote appVersion/)
  has(checkChart(chart.replace('apiVersion: v2', 'apiVersion: v1'), ctx).errors, /apiVersion must be v2/)
  has(checkChart(chart.replace('image: ghcr.io/pixari/opentodo:0.9.0', 'image: ghcr.io/pixari/opentodo:stable'), ctx).errors, /artifacthub\.io\/images must list exactly/)
  has(checkChart(chart.replace('artifacthub.io/license: AGPL-3.0-only', 'artifacthub.io/license: MIT'), ctx).errors, /license/)
  has(checkChart(chart.replace('- name: support', '- name: issues'), ctx).errors, /"support" link/)
  has(checkChart(chart.replace('pwa-512.png', 'logo.png'), ctx).errors, /icon must be/)
  has(checkChart(chart.replace('type: application', 'type: library'), ctx).errors, /type must be application/)
  has(checkChart('apiVersion: v2\n  name: x\n', ctx).errors, /not in the supported YAML subset/)
})

test('helm: values.yaml image policy and variables', () => {
  assert.deepEqual(shared(values), [])
  has(shared(values.replace('tag: ""', 'tag: "stable"')), /image\.tag must be ""/)
  has(shared(values.replace('tag: ""', 'tag: "stable"')), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  has(shared(values.replace('repository: ghcr.io/pixari/opentodo', 'repository: docker.io/pixari/opentodo')), /image\.repository must be/)
  has(shared(values.replace('  OPENTODO_TRUSTED_PROXIES: ""\n', '')), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(shared(values.replace('  OPENTODO_ALLOW_SIGNUP: "false"', '  OPENTODO_ALLOW_SIGNUP: "true"')), /defaults to "true", the catalogue says "false"/)
  has(shared(values.replace('  OPENTODO_ALLOW_SIGNUP: "false"', '  OPENTODO_ALLOW_SIGNUP: "false"\n  OPENTODO_NOPE: ""')), /not read by internal\/config/)
  has(shared(values.replace('  OPENTODO_ALLOW_SIGNUP: "false"', '  OPENTODO_ALLOW_SIGNUP: "false"\n  OPENTODO_MCP: ""')), /not in the variable catalogue/)
  has(shared(values.replace('  OPENTODO_ALLOW_SIGNUP: "false"', '  OPENTODO_ALLOW_SIGNUP: false')), /env\.OPENTODO_ALLOW_SIGNUP must be a string/)
  has(shared(values.replace('  OPENTODO_ALLOW_SIGNUP: "false"', '  OPENTODO_ALLOW_SIGNUP: "false"\n  OPENTODO_SETUP_TOKEN: "x"')), /comes from setupToken/)
  has(shared(values.replace('  generate: true', '  generate: false')), /setupToken\.generate must default to true/)
  has(shared(values.replace('  port: 8080', '  port: 80')), /service\.port must be 8080/)
})

test('helm: values.yaml and the schema agree', () => {
  has(valuesFound(values + 'replicaCount: 2\n').errors, /replicaCount is not in values\.schema\.json/)
  has(valuesFound(values.replace(/^affinity: \{\}\n/m, '')).errors, /affinity from values\.schema\.json has no default/)
  has(valuesFound(values, schema.replace('"additionalProperties": false,\n  "properties"', '"properties"')).errors, /additionalProperties: false/)
  has(valuesFound(values, '{').errors, /not JSON/)
  has(valuesFound(values.replace('  enabled: true\n  # Use an existing', '  enabled: false\n  # Use an existing')).errors, /persistence\.enabled must default to true/)
  has(valuesFound(values.replace('  keep: true', '  keep: false')).errors, /persistence\.keep/)
})

test('helm: the Deployment keeps one writer and a locked-down pod', () => {
  assert.deepEqual(checkDeployment(deployment, ctx).errors, [])
  has(checkDeployment(deployment.replace('  replicas: 1', '  replicas: {{ .Values.replicaCount }}'), ctx).errors, /replicas must be fixed at 1/)
  has(checkDeployment(deployment.replace('type: Recreate', 'type: RollingUpdate'), ctx).errors, /strategy must be Recreate/)
  has(checkDeployment(deployment.replace('runAsNonRoot: true', 'runAsNonRoot: false'), ctx).errors, /runAsNonRoot/)
  has(checkDeployment(deployment.replace('fsGroup: 65532', 'fsGroup: 1000'), ctx).errors, /fsGroup: 65532/)
  has(checkDeployment(deployment.replace('readOnlyRootFilesystem: true', 'readOnlyRootFilesystem: false'), ctx).errors, /readOnlyRootFilesystem/)
  has(checkDeployment(deployment.replace(/path: \/healthz/, 'path: /'), ctx).errors, /startupProbe must GET \/healthz/)
  const d = checkDeployment(deployment.replace('containerPort: 8080', 'containerPort: 3000').replace('mountPath: /data', 'mountPath: /config'), ctx)
  const v = valuesFound(values)
  const errors = checkShared({ ...v.found, port: d.port, dataTarget: d.dataTarget, policy: 'release' }, ctx)
  has(errors, /port must be 8080/)
  has(errors, /mounted on \/data/)
})

test('helm: Artifact Hub metadata and the publish workflow', () => {
  assert.deepEqual(checkArtifactHub(readText(ARTIFACTHUB)), [])
  has(checkArtifactHub('repositoryID: abc\n'), /UUID/)
  has(checkArtifactHub('owner: x\n'), /unknown key owner/)
  assert.deepEqual(checkArtifactHub('repositoryID: 5c3c1d5e-0f6a-4b8e-9c2d-1a2b3c4d5e6f\n'), [])
  const wf = readText(WORKFLOW)
  assert.deepEqual(checkWorkflow(wf), [])
  has(checkWorkflow(wf.replace(" && !contains(github.ref_name, '-')", '')), /skip release candidates/)
  has(checkWorkflow(wf.replace('packages: write', 'packages: read')), /packages: write/)
  has(checkWorkflow(null), /is missing/)
})
