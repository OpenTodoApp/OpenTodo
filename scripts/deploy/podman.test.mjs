// node --test scripts/deploy/podman.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configVariables, loadFacts, readText } from './common.mjs'
import { check, checkContainer, CONTAINER, parseUnit, VOLUME } from './podman.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const unit = readText(CONTAINER)
const volume = readText(VOLUME)
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const run = (text, vol = volume) => checkContainer(text, vol, ctx)
const edit = (from, to) => {
  assert.ok(unit.includes(from), `the unit contains ${from}`)
  return run(unit.replace(from, to))
}

test('podman: the committed units pass', () => {
  assert.deepEqual(check(ctx), [])
})

test('podman: strict unit syntax', () => {
  assert.throws(() => parseUnit('Image=x\n', { Container: new Set(['Image']) }), /outside a section/)
  assert.throws(() => parseUnit('[Container]\nImage=x \\\n', { Container: new Set(['Image']) }), /continuations/)
  assert.throws(() => parseUnit('[Container]\n[Container]\n', { Container: new Set() }), /appears twice/)
  assert.throws(() => parseUnit('[Container]\nImage x\n', { Container: new Set(['Image']) }), /expected \[Section\] or Key=Value/)
  assert.throws(() => parseUnit('[Container]\nImage=x', { Container: new Set(['Image']) }), /end with a newline/)
  has(edit('[Service]', '[Services]'), /unknown section \[Services\]/)
  has(edit('ReadOnly=true', 'ReadOnly=true\nVolumeName=x'), /VolumeName= is not a \[Container\] key of Podman 4\.6/)
  has(edit('ContainerName=opentodo', 'ContainerName=opentodo\nContainerName=todo'), /ContainerName= appears twice/)
})

test('podman: image policy and auto-update', () => {
  has(edit('Image=ghcr.io/pixari/opentodo:stable', 'Image=ghcr.io/pixari/opentodo:latest'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(edit('Image=ghcr.io/pixari/opentodo:stable', 'Image=ghcr.io/pixari/opentodo:0.9.0'), /image must be ghcr\.io\/pixari\/opentodo:stable/)
  has(edit('AutoUpdate=registry', 'AutoUpdate=local'), /AutoUpdate must be registry/)
  has(edit('AutoUpdate=registry\n', ''), /AutoUpdate must be registry/)
})

test('podman: health check, port and data', () => {
  has(edit('HealthCmd=["/opentodo", "healthcheck"]', 'HealthCmd=/opentodo healthcheck'), /HealthCmd must be the JSON array/)
  has(edit('HealthRetries=3\n', ''), /HealthRetries is required/)
  has(edit('PublishPort=8080:8080', 'PublishPort=8080:3000'), /port must be 8080/)
  has(edit('PublishPort=8080:8080', 'PublishPort=8080'), /PublishPort must be \[ip:\]host:container/)
  has(edit('PublishPort=8080:8080', 'PublishPort=8080:8080\nPublishPort=8443:8443'), /exactly one port/)
  has(edit('Volume=opentodo.volume:/data', 'Volume=opentodo.volume:/config'), /mounted on \/data/)
  has(edit('Volume=opentodo.volume:/data', 'Volume=/srv/opentodo:/data'), /must be opentodo\.volume/)
  has(edit('Volume=opentodo.volume:/data', 'Volume=opentodo.volume:/data:U'), /no volume options/)
  has(run(unit, null), /opentodo\.volume is missing/)
  has(run(unit, '[Volume]\nDevice=/dev/sdb1\n'), /plain named volume/)
})

test('podman: variables', () => {
  has(edit('Environment=OPENTODO_TRUSTED_PROXIES=\n', ''), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(edit('Environment=OPENTODO_ALLOW_SIGNUP=false', 'Environment=OPENTODO_ALLOW_SIGNUP=true'), /defaults to "true", the catalogue says "false"/)
  has(edit('Environment=OPENTODO_ALLOW_SIGNUP=false', 'Environment=OPENTODO_ALLOW_SIGNUP=false\nEnvironment=OPENTODO_NOPE=1'), /not read by internal\/config/)
  has(edit('Environment=OPENTODO_ALLOW_SIGNUP=false', 'Environment=OPENTODO_ALLOW_SIGNUP=false\nEnvironment=OPENTODO_MCP=on'), /not in the variable catalogue/)
  has(edit('Environment=OPENTODO_ALLOW_SIGNUP=false', 'Environment="OPENTODO_ALLOW_SIGNUP=false"'), /one unquoted NAME=value/)
  has(edit('Environment=OPENTODO_SETUP_TOKEN=', 'Environment=OPENTODO_SETUP_TOKEN=a-shared-secret-for-everyone'), /never ship a setup token/)
  has(edit('Environment=OPENTODO_ALLOW_SIGNUP=false', 'Environment=OPENTODO_ALLOW_SIGNUP=false\nEnvironment=OPENTODO_ALLOW_SIGNUP=false'), /set twice/)
})

test('podman: hardening and systemd', () => {
  has(edit('ReadOnly=true', 'ReadOnly=false'), /ReadOnly must be true/)
  has(edit('DropCapability=all', 'DropCapability=NET_RAW'), /DropCapability=all/)
  has(edit('NoNewPrivileges=true', 'NoNewPrivileges=true\nUser=0'), /never run as root/)
  has(edit('NoNewPrivileges=true', 'NoNewPrivileges=true\nNotify=healthy'), /Notify=healthy needs Podman 5/)
  has(edit('Restart=always', 'Restart=on-failure'), /Restart must be always/)
  has(edit('WantedBy=default.target', 'WantedBy=multi-user.target'), /WantedBy must be default\.target/)
})
