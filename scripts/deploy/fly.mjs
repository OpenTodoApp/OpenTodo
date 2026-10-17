// Fly.io app configuration (deploy/fly/fly.toml), OpenSpec change platform-catalogs. There is no
// store: people download the file and run fly launch --copy-config, then fly deploy, which resolves
// the image tag to a digest on every deploy (flyctl internal/build/imgsrc/remote_image_resolver.go),
// so the stable tag reaches them on their next fly deploy. The keys and value types below are the ones
// flyctl's internal/appconfig reads; the parser is a strict TOML subset, so a file the checker accepts
// is a file it understood. Fly cannot be reached from CI, so the setup token (a secret set with
// fly secrets set) is checked in the instructions that tell people to set it.

import { checkShared, readText, ROOT } from './common.mjs'

export const TEMPLATE = 'deploy/fly/fly.toml'
export const README = 'deploy/fly/README.md'
export const GUIDE = 'docs/self-hosting/fly.md'
export const SECRET_STEP = 'fly secrets set OPENTODO_SETUP_TOKEN='

// ---- strict TOML subset -------------------------------------------------------------------------

const BARE = '[A-Za-z0-9_-]+'

/** Removes a trailing comment outside strings. */
function stripComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#') return line.slice(0, i)
  }
  if (quote) throw new Error('unterminated string')
  return line
}

const ESC = { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }

/** One value: "basic", 'literal', integer, true/false, or a one-line array of those. */
export function parseValue(s) {
  let pos = 0
  const fail = (m) => { throw new Error(`${m}: ${s}`) }
  const ws = () => { while (s[pos] === ' ') pos++ }
  function one() {
    if (s[pos] === '"') {
      let out = ''
      pos++
      for (;;) {
        const c = s[pos]
        if (c === undefined) fail('unterminated string')
        if (c === '"') { pos++; return out }
        if (c === '\\') {
          const e = s[pos + 1]
          if (e === 'u' && /^[0-9A-Fa-f]{4}$/.test(s.slice(pos + 2, pos + 6))) { out += String.fromCharCode(parseInt(s.slice(pos + 2, pos + 6), 16)); pos += 6; continue }
          if (!(e in ESC)) fail('unsupported escape')
          out += ESC[e]
          pos += 2
          continue
        }
        if (c < ' ') fail('control character in a string')
        out += c
        pos++
      }
    }
    if (s[pos] === "'") {
      const end = s.indexOf("'", pos + 1)
      if (end < 0) fail('unterminated string')
      const out = s.slice(pos + 1, end)
      pos = end + 1
      return out
    }
    if (s[pos] === '[') {
      pos++
      const arr = []
      ws()
      if (s[pos] === ']') { pos++; return arr }
      for (;;) {
        ws()
        arr.push(one())
        ws()
        if (s[pos] === ',') { pos++; ws(); if (s[pos] === ']') { pos++; return arr } continue }
        if (s[pos] === ']') { pos++; return arr }
        fail('expected , or ] in an array')
      }
    }
    const m = /^(true|false|[+-]?(?:0|[1-9](?:_?\d)*))(?=[\s,\]]|$)/.exec(s.slice(pos))
    if (!m) fail('only strings, integers, booleans and one-line arrays are supported (no floats, dates, inline tables or multi-line strings)')
    pos += m[0].length
    return m[0] === 'true' ? true : m[0] === 'false' ? false : Number(m[0].replace(/_/g, ''))
  }
  const v = one()
  ws()
  if (pos !== s.length) fail('trailing text after a value')
  return v
}

/** Parses the subset; throws with a line number on anything else. */
export function parseToml(text) {
  const root = {}
  const defined = new Set() // tables opened by a [header]
  let cur = root
  text.split('\n').forEach((raw, i) => {
    const no = i + 1
    try {
      if (raw.includes('\t')) throw new Error('tabs are not allowed')
      if (raw.includes('\r')) throw new Error('use \\n line endings')
      const line = stripComment(raw).trim()
      if (line === '') return
      let m = new RegExp(`^\\[\\[(${BARE}(?:\\.${BARE})*)\\]\\]$`).exec(line)
      if (m) {
        const parts = m[1].split('.')
        const parent = walk(parts.slice(0, -1))
        const k = parts.at(-1)
        if (parent[k] === undefined) parent[k] = []
        if (!Array.isArray(parent[k])) throw new Error(`${m[1]} is already a table`)
        cur = {}
        parent[k].push(cur)
        return
      }
      m = new RegExp(`^\\[(${BARE}(?:\\.${BARE})*)\\]$`).exec(line)
      if (m) {
        const path = m[1]
        if (defined.has(path)) throw new Error(`table [${path}] defined twice`)
        defined.add(path)
        const parts = path.split('.')
        const parent = walk(parts.slice(0, -1))
        const k = parts.at(-1)
        if (parent[k] === undefined) parent[k] = {}
        else if (typeof parent[k] !== 'object' || Array.isArray(parent[k])) throw new Error(`${path} is not a table`)
        cur = parent[k]
        return
      }
      m = new RegExp(`^(${BARE})\\s*=\\s*(.+)$`).exec(line)
      if (!m) throw new Error(`expected [table], [[array]] or key = value, got: ${line}`)
      if (Object.hasOwn(cur, m[1])) throw new Error(`duplicate key ${m[1]}`)
      cur[m[1]] = parseValue(m[2].trim())
    } catch (e) {
      throw new Error(`line ${no}: ${e.message}`)
    }
  })
  return root

  function walk(parts) {
    let t = root
    for (const p of parts) {
      if (t[p] === undefined) t[p] = {}
      t = Array.isArray(t[p]) ? t[p].at(-1) : t[p]
      if (typeof t !== 'object' || t === null) throw new Error(`${p} is not a table`)
    }
    return t
  }
}

// ---- checks -------------------------------------------------------------------------------------

const DURATION = /^\d+(ms|s|m|h)$/
const isTable = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
// The keys this template may use, each a key flyctl's appconfig reads (with its type there).
const KEYS = {
  '': ['kill_signal', 'kill_timeout', 'build', 'env', 'mounts', 'http_service', 'vm', 'deploy', 'swap_size_mb'],
  build: ['image'],
  mounts: ['source', 'destination', 'initial_size', 'snapshot_retention', 'scheduled_snapshots', 'auto_extend_size_threshold', 'auto_extend_size_increment', 'auto_extend_size_limit'],
  http_service: ['internal_port', 'force_https', 'auto_stop_machines', 'auto_start_machines', 'min_machines_running', 'checks', 'concurrency'],
  check: ['method', 'path', 'interval', 'timeout', 'grace_period'],
  vm: ['size', 'memory', 'cpu_kind', 'cpus'],
  deploy: ['strategy', 'wait_timeout'],
}

function keys(where, t, errors) {
  for (const k of Object.keys(t)) {
    if (!KEYS[where].includes(k)) {
      const why = { app: 'fly launch --name writes it; a committed name would point everyone at one app', primary_region: 'fly launch --region writes it', services: 'use [http_service] only', processes: 'one process, the image entrypoint', checks: 'use [[http_service.checks]]' }[k]
      errors.push(`${where ? `[${where}] ` : ''}"${k}" is not allowed here${why ? `: ${why}` : ''}`)
    }
  }
}

export function checkTemplate(text, ctx) {
  if (text === null) return { errors: [`${TEMPLATE} is missing`] }
  const errors = []
  if (!text.endsWith('\n')) errors.push('fly.toml must end with a newline')
  let t
  try {
    t = parseToml(text)
  } catch (e) {
    return { errors: [...errors, `${TEMPLATE} is not in the supported TOML subset: ${e.message}`] }
  }
  keys('', t, errors)
  if (t.kill_signal !== undefined && !['SIGINT', 'SIGTERM'].includes(t.kill_signal)) errors.push('kill_signal must be SIGINT or SIGTERM (OpenTodo shuts down cleanly on both)')
  // fly.Duration reads an integer as nanoseconds, so durations are strings.
  if (t.kill_timeout !== undefined && !DURATION.test(t.kill_timeout)) errors.push('kill_timeout must be a duration string such as "30s"')

  const build = isTable(t.build) ? t.build : {}
  if (!isTable(t.build)) errors.push('[build] with image is required (no Dockerfile: Fly deploys the published image)')
  keys('build', build, errors)

  const env = isTable(t.env) ? t.env : {}
  if (t.env !== undefined && !isTable(t.env)) errors.push('[env] must be a table')
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== 'string') errors.push(`[env] ${k} must be a string`)
    if (k.startsWith('FLY_')) errors.push(`[env] ${k}: names starting with FLY_ are reserved`)
  }
  if (Object.hasOwn(env, 'OPENTODO_SETUP_TOKEN')) errors.push('OPENTODO_SETUP_TOKEN must not be in [env], which anyone with the file or the app config can read: set it with fly secrets set')
  // Fly serves only https, but the address is <app>.fly.dev, known only after fly launch: the
  // committed value is empty and the guide says to set it.
  if (Object.hasOwn(env, 'OPENTODO_BASE_URL') && env.OPENTODO_BASE_URL !== '') errors.push('OPENTODO_BASE_URL must be empty in the committed file: the app name is chosen at fly launch')

  let dataTarget = null
  if (Array.isArray(t.mounts)) errors.push('one [mounts] table, not [[mounts]]: one volume, one machine (SQLite has one writer)')
  else if (!isTable(t.mounts)) errors.push('[mounts] is required: without a volume the data is lost on every deploy')
  else {
    keys('mounts', t.mounts, errors)
    if (!/^[a-z0-9_]{1,30}$/.test(t.mounts.source ?? '')) errors.push('[mounts] source must be a volume name of lowercase letters, digits and _ (30 at most)')
    dataTarget = t.mounts.destination ?? null
    if (t.mounts.initial_size !== undefined && !/^[1-9]\d*gb$/.test(t.mounts.initial_size)) errors.push('[mounts] initial_size must be a size such as "1gb"')
  }

  let port = null
  const hs = t.http_service
  if (!isTable(hs)) errors.push('[http_service] is required')
  else {
    keys('http_service', hs, errors)
    port = hs.internal_port ?? null
    if (hs.force_https !== true) errors.push('[http_service] force_https must be true (secure cookies, passkeys and the app install need https)')
    // A stopped machine sends no reminders, runs no scheduled backup and polls no mailbox.
    if (hs.auto_stop_machines !== 'off') errors.push('[http_service] auto_stop_machines must be "off": reminders, scheduled backups and email to task run on the server')
    if (hs.auto_start_machines !== true) errors.push('[http_service] auto_start_machines must be true')
    if (hs.min_machines_running !== 1) errors.push('[http_service] min_machines_running must be 1')
    const checks = hs.checks
    if (!Array.isArray(checks) || checks.length !== 1) errors.push('one [[http_service.checks]] entry')
    else {
      const c = checks[0]
      keys('check', c, errors)
      if (c.path !== '/healthz') errors.push('the health check path must be /healthz')
      if (c.method !== undefined && c.method !== 'GET') errors.push('the health check method must be GET')
      for (const k of ['interval', 'timeout', 'grace_period']) if (!DURATION.test(c[k] ?? '')) errors.push(`the health check ${k} must be a duration string such as "10s"`)
    }
  }

  if (t.vm !== undefined) {
    if (!Array.isArray(t.vm) || t.vm.length !== 1) errors.push('one [[vm]] entry')
    else {
      keys('vm', t.vm[0], errors)
      if (t.vm[0].memory !== undefined && !/^\d+(mb|gb)$/.test(t.vm[0].memory)) errors.push('[[vm]] memory must be a size such as "256mb"')
    }
  }
  if (t.deploy !== undefined) {
    keys('deploy', t.deploy, errors)
    // Blue-green starts a second machine beside the first; a volume attaches to one machine only.
    if (t.deploy.strategy !== undefined && !['rolling', 'immediate'].includes(t.deploy.strategy)) errors.push('[deploy] strategy must be rolling or immediate (a volume attaches to one machine)')
  }

  const variables = new Map()
  for (const [k, v] of Object.entries(env)) variables.set(k, { default: v, required: false })
  return { errors, image: build.image, port, dataTarget, variables }
}

/** The instructions must set the setup token as a secret, so the template still offers it. */
export function checkInstructions(readme, guide) {
  const errors = []
  for (const [path, text] of [[README, readme], [GUIDE, guide]]) {
    if (text === null) errors.push(`${path} is missing`)
    else {
      if (!text.includes(SECRET_STEP)) errors.push(`${path} must tell people to run ${SECRET_STEP}...`)
      if (!text.includes('fly launch --copy-config --no-deploy')) errors.push(`${path} must use fly launch --copy-config --no-deploy, so the committed file is used`)
      if (!/OPENTODO_BASE_URL = "https:\/\/<app>\.fly\.dev"/.test(text) && !text.includes('OPENTODO_BASE_URL=https://<app>.fly.dev')) errors.push(`${path} must say to set OPENTODO_BASE_URL to https://<app>.fly.dev`)
    }
  }
  return errors
}

export function check(ctx, root = ROOT) {
  const t = checkTemplate(readText(TEMPLATE, root), ctx)
  const errors = [...t.errors]
  if (!t.variables) return errors
  const instr = checkInstructions(readText(README, root), readText(GUIDE, root))
  errors.push(...instr)
  if (!instr.some((e) => e.includes(SECRET_STEP))) t.variables.set('OPENTODO_SETUP_TOKEN', { default: '', required: false })
  errors.push(...checkShared({ image: t.image, port: t.port, dataTarget: t.dataTarget, variables: t.variables, policy: 'stable' }, ctx))
  return errors
}

export const summary = 'strict TOML, stable tag, port, volume on /data, always-on single machine, https, /healthz check, empty base URL, setup token as a secret'
