// Podman Quadlet units (deploy/podman/opentodo.container and opentodo.volume): systemd
// units that Podman's generator turns into opentodo.service. Installed by copying the files
// to /etc/containers/systemd/ or ~/.config/containers/systemd/; there is no store.
// Image policy 'stable': AutoUpdate=registry makes `podman auto-update` pull the tag again
// and restart the service when a release moved it.
// A strict parser for the systemd unit syntax the files use: [Section] headers, Key=Value
// lines, comment lines starting with # or ;. Line continuations, keys outside a section,
// repeated sections and unknown sections or keys are refused. The known keys are those of
// Podman 4.6, the oldest release with AutoUpdate= (docs/self-hosting/podman.md).

import { checkShared, readText, ROOT } from './common.mjs'

export const CONTAINER = 'deploy/podman/opentodo.container'
export const VOLUME = 'deploy/podman/opentodo.volume'
export const MIN_PODMAN = '4.6'

// Podman 4.6 [Container] keys (podman-systemd.unit(5) of that release).
const CONTAINER_KEYS = new Set([
  'AddCapability', 'AddDevice', 'Annotation', 'AutoUpdate', 'ContainerName', 'DropCapability', 'Environment',
  'EnvironmentFile', 'EnvironmentHost', 'Exec', 'ExposeHostPort', 'Group', 'HealthCmd', 'HealthInterval',
  'HealthOnFailure', 'HealthRetries', 'HealthStartPeriod', 'HealthStartupCmd', 'HealthStartupInterval',
  'HealthStartupRetries', 'HealthStartupSuccess', 'HealthStartupTimeout', 'HealthTimeout', 'HostName', 'IP', 'IP6',
  'Image', 'Label', 'LogDriver', 'Mount', 'Network', 'NoNewPrivileges', 'Notify', 'PodmanArgs', 'PublishPort',
  'Pull', 'ReadOnly', 'RunInit', 'SeccompProfile', 'Secret', 'SecurityLabelDisable', 'SecurityLabelFileType',
  'SecurityLabelLevel', 'SecurityLabelType', 'Timezone', 'Tmpfs', 'User', 'UserNS', 'VolatileTmp', 'Volume',
])
const SECTIONS = {
  container: {
    Unit: new Set(['Description', 'Documentation', 'Wants', 'After', 'Requires', 'Before']),
    Container: CONTAINER_KEYS,
    Service: new Set(['Restart', 'RestartSec', 'TimeoutStartSec', 'TimeoutStopSec']),
    Install: new Set(['WantedBy', 'RequiredBy', 'Alias']),
  },
  volume: {
    Unit: new Set(['Description']),
    Volume: new Set(['Copy', 'Device', 'Group', 'Label', 'Options', 'Type', 'User']),
  },
}

/** Parses a unit file into Map<section, Array<{ key, value, line }>>; throws with a line number. */
export function parseUnit(text, sections) {
  if (!text.endsWith('\n')) throw new Error('the file must end with a newline')
  const out = new Map()
  let current = null
  text.split('\n').forEach((line, i) => {
    const no = i + 1
    if (line.includes('\r')) throw new Error(`line ${no}: use \\n line endings`)
    if (line.trim() === '' || /^[#;]/.test(line)) return
    if (/\\$/.test(line)) throw new Error(`line ${no}: line continuations are not supported`)
    let m = /^\[([A-Za-z]+)\]$/.exec(line)
    if (m) {
      if (!sections[m[1]]) throw new Error(`line ${no}: unknown section [${m[1]}]`)
      if (out.has(m[1])) throw new Error(`line ${no}: [${m[1]}] appears twice`)
      current = m[1]
      out.set(current, [])
      return
    }
    m = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line)
    if (!m) throw new Error(`line ${no}: expected [Section] or Key=Value, got: ${line}`)
    if (!current) throw new Error(`line ${no}: ${m[1]}= is outside a section`)
    if (!sections[current].has(m[1])) throw new Error(`line ${no}: ${m[1]}= is not a [${current}] key of Podman ${MIN_PODMAN}`)
    if (m[2] !== m[2].trim()) throw new Error(`line ${no}: no spaces around the value of ${m[1]}`)
    out.get(current).push({ key: m[1], value: m[2], line: no })
  })
  return out
}

const REPEATABLE = new Set(['Environment', 'Label', 'DropCapability', 'AddCapability', 'Annotation', 'Wants', 'After', 'Requires', 'Before', 'Documentation'])

export function checkContainer(text, volumeText, ctx) {
  if (text === null) return [`${CONTAINER} is missing`]
  const errors = []
  let unit
  try {
    unit = parseUnit(text, SECTIONS.container)
  } catch (e) {
    return [`${CONTAINER}: ${e.message}`]
  }
  for (const s of ['Unit', 'Container', 'Service', 'Install']) if (!unit.has(s)) errors.push(`${CONTAINER}: [${s}] is required`)
  const c = unit.get('Container') ?? []
  const all = (k) => c.filter((e) => e.key === k)
  const one = (k, section = c) => {
    const found = section.filter((e) => e.key === k)
    if (found.length > 1 && !REPEATABLE.has(k)) errors.push(`${CONTAINER}: line ${found[1].line}: ${k}= appears twice`)
    return found[0]?.value
  }
  for (const e of c) if (!REPEATABLE.has(e.key) && !['PublishPort', 'Volume'].includes(e.key)) one(e.key)

  if (one('ContainerName') !== 'opentodo') errors.push(`${CONTAINER}: ContainerName must be opentodo`)
  if (one('AutoUpdate') !== 'registry') errors.push(`${CONTAINER}: AutoUpdate must be registry, so podman auto-update follows the stable tag`)
  if (one('Pull') !== undefined) errors.push(`${CONTAINER}: leave Pull out (the default pulls a missing image; auto-update handles new ones)`)
  if (one('ReadOnly') !== 'true') errors.push(`${CONTAINER}: ReadOnly must be true (OpenTodo writes only to /data)`)
  if (one('NoNewPrivileges') !== 'true') errors.push(`${CONTAINER}: NoNewPrivileges must be true`)
  if (!all('DropCapability').some((e) => e.value === 'all')) errors.push(`${CONTAINER}: DropCapability=all is required`)
  if (one('User') !== undefined && /^(0|root)(:|$)/.test(one('User'))) errors.push(`${CONTAINER}: never run as root`)
  if (one('Notify') !== undefined) errors.push(`${CONTAINER}: leave Notify out (Notify=healthy needs Podman 5)`)
  if (one('PodmanArgs') !== undefined) errors.push(`${CONTAINER}: use Quadlet keys instead of PodmanArgs`)

  // The image has no shell: a plain HealthCmd string becomes CMD-SHELL and always fails.
  const health = one('HealthCmd')
  let cmd = null
  try { cmd = JSON.parse(health ?? '') } catch {}
  if (JSON.stringify(cmd) !== JSON.stringify(ctx.facts.healthcheck)) {
    errors.push(`${CONTAINER}: HealthCmd must be the JSON array ${JSON.stringify(ctx.facts.healthcheck).replace(',', ', ')} (exec form: the image has no shell), got: ${health}`)
  }
  for (const k of ['HealthInterval', 'HealthTimeout', 'HealthStartPeriod', 'HealthRetries']) if (one(k) === undefined) errors.push(`${CONTAINER}: ${k} is required`)

  const ports = all('PublishPort')
  let port = null
  if (ports.length !== 1) errors.push(`${CONTAINER}: publish exactly one port`)
  else {
    const m = /^(?:(\d{1,3}(?:\.\d{1,3}){3}):)?(\d+):(\d+)(\/tcp)?$/.exec(ports[0].value)
    if (!m) errors.push(`${CONTAINER}: PublishPort must be [ip:]host:container, got ${ports[0].value}`)
    else {
      port = m[3]
      if (m[2] !== String(ctx.facts.port)) errors.push(`${CONTAINER}: publish the port as ${ctx.facts.port}:${ctx.facts.port} (people change the left side)`)
    }
  }
  const vols = all('Volume')
  let dataTarget = null
  if (vols.length !== 1) errors.push(`${CONTAINER}: mount exactly one volume`)
  else {
    const [source, target, ...opts] = vols[0].value.split(':')
    dataTarget = target
    if (source !== 'opentodo.volume') errors.push(`${CONTAINER}: the data volume must be opentodo.volume (the unit beside it), got ${source}`)
    if (opts.length) errors.push(`${CONTAINER}: no volume options on the named volume (:U is for bind mounts, see the guide)`)
    if (volumeText === null) errors.push(`${VOLUME} is missing`)
    else {
      try {
        const v = parseUnit(volumeText, SECTIONS.volume)
        if (!v.has('Volume')) errors.push(`${VOLUME}: [Volume] is required`)
        for (const e of v.get('Volume') ?? []) if (['Device', 'Type'].includes(e.key)) errors.push(`${VOLUME}: line ${e.line}: keep it a plain named volume (no ${e.key}=)`)
      } catch (e) {
        errors.push(`${VOLUME}: ${e.message}`)
      }
    }
  }

  const variables = new Map()
  for (const e of all('Environment')) {
    const m = /^([A-Z][A-Z0-9_]*)=([^"' ]*)$/.exec(e.value)
    if (!m) { errors.push(`${CONTAINER}: line ${e.line}: one unquoted NAME=value per Environment line, got ${e.value}`); continue }
    if (variables.has(m[1])) errors.push(`${CONTAINER}: line ${e.line}: ${m[1]} is set twice`)
    if (m[1] === 'OPENTODO_SETUP_TOKEN' && m[2] !== '') errors.push(`${CONTAINER}: line ${e.line}: never ship a setup token`)
    variables.set(m[1], { default: m[2], required: false })
  }

  const svc = unit.get('Service') ?? []
  if (one('Restart', svc) !== 'always') errors.push(`${CONTAINER}: [Service] Restart must be always`)
  if (one('TimeoutStartSec', svc) === undefined) errors.push(`${CONTAINER}: [Service] TimeoutStartSec is required (the first start pulls the image)`)
  if (one('WantedBy', unit.get('Install') ?? []) !== 'default.target') errors.push(`${CONTAINER}: [Install] WantedBy must be default.target (it starts rootful and rootless units at boot)`)
  const unitSec = unit.get('Unit') ?? []
  if (!one('Description', unitSec)) errors.push(`${CONTAINER}: [Unit] Description is required`)
  if (!unitSec.some((e) => e.key === 'Documentation' && e.value === 'https://open-todo.app/docs/self-hosting/podman/')) errors.push(`${CONTAINER}: [Unit] Documentation must be https://open-todo.app/docs/self-hosting/podman/`)

  errors.push(...checkShared({ image: one('Image'), port, dataTarget, variables, policy: 'stable' }, ctx))
  return [...new Set(errors)]
}

export function check(ctx, root = ROOT) {
  return checkContainer(readText(CONTAINER, root), readText(VOLUME, root), ctx)
}

export const summary = 'Quadlet syntax and Podman 4.6 keys, stable tag with AutoUpdate=registry, exec-form health check, port, opentodo.volume on /data, read-only, variables'
