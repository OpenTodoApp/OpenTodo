// Shared rules for every platform template in deploy/<platform>/ (OpenSpec change
// unraid-template). A platform checker (scripts/deploy/<platform>.mjs) parses its
// own format and passes what it found to checkShared(); the facts every template
// must agree on are in deploy/deploy.json.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function readText(rel, root = ROOT) {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

export function loadFacts(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'deploy/deploy.json'), 'utf8'))
}

/** The newest released version in CHANGELOG.md. */
export function latestRelease(changelog) {
  const m = /^## \[(\d+)\.(\d+)\.(\d+)\]/m.exec(changelog)
  if (!m) throw new Error('CHANGELOG.md has no released version')
  return { major: m[1], minor: m[2], patch: m[3] }
}

/** Every OPENTODO_* name written as a string literal in internal/config (tests excluded). */
export function configVariables(root = ROOT) {
  const dir = join(root, 'internal/config')
  const names = new Set()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.go') || f.endsWith('_test.go')) continue
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/"(OPENTODO_[A-Z0-9_]+)"/g)) names.add(m[1])
  }
  return names
}

/** Problems with the catalogue itself: names the server does not read, duplicates. */
export function checkFacts(facts, configVars) {
  const errors = []
  const seen = new Set()
  for (const v of facts.variables ?? []) {
    if (seen.has(v.name)) errors.push(`deploy/deploy.json lists ${v.name} twice`)
    seen.add(v.name)
    if (!configVars.has(v.name)) errors.push(`deploy/deploy.json lists ${v.name}, which internal/config does not read`)
    if (typeof v.default !== 'string') errors.push(`deploy/deploy.json: ${v.name} needs a string default ("" for none)`)
    if (!v.description) errors.push(`deploy/deploy.json: ${v.name} needs a description`)
  }
  return errors
}

/** The release image line a template must name: ghcr.io/pixari/opentodo:<major>.<minor>[.<patch>]. */
export function checkImage(image, facts, changelog) {
  const esc = facts.image.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const m = new RegExp(`^${esc}:(\\d+)\\.(\\d+)(?:\\.(\\d+))?$`).exec(image ?? '')
  if (!m) return [`image must be ${facts.image}:<major.minor> or :<major.minor.patch> (no latest or floating tags), got: ${image}`]
  const rel = latestRelease(changelog)
  if (m[1] !== rel.major || m[2] !== rel.minor || (m[3] !== undefined && m[3] !== rel.patch)) {
    return [`image tag ${image.split(':')[1]} does not match the latest release ${rel.major}.${rel.minor}.${rel.patch} in CHANGELOG.md`]
  }
  return []
}

/**
 * The rules every template shares. `found` is what the platform checker read:
 *   { image, port, dataTarget, variables: Map<name, { default, required, platformValue }> }
 * `platformValue` marks a value the platform fills (Coolify's ${SERVICE_URL_*}), compared only
 * for catalogue entries without platformDefault.
 */
export function checkShared(found, { facts, changelog, configVars }) {
  const errors = [...checkImage(found.image, facts, changelog)]
  if (String(found.port) !== String(facts.port)) errors.push(`the container port must be ${facts.port}, got ${found.port}`)
  if (found.dataTarget !== facts.dataDir) errors.push(`the data must be mounted on ${facts.dataDir}, got ${found.dataTarget}`)
  const catalogue = new Map((facts.variables ?? []).map((v) => [v.name, v]))
  for (const [name, v] of found.variables) {
    if (!name.startsWith('OPENTODO_')) continue
    if (!configVars.has(name)) { errors.push(`${name} is not read by internal/config`); continue }
    const entry = catalogue.get(name)
    if (!entry) { errors.push(`${name} is not in the variable catalogue (deploy/deploy.json); add it there first`); continue }
    if (v.required) errors.push(`${name} must not be required: OpenTodo needs no variables`)
    if (!entry.platformDefault && v.default !== entry.default) {
      errors.push(`${name} defaults to ${JSON.stringify(v.default)}, the catalogue says ${JSON.stringify(entry.default)}`)
    }
  }
  for (const entry of catalogue.values()) {
    if (entry.essential && !found.variables.has(entry.name)) errors.push(`${entry.name} must be offered (essential in deploy/deploy.json)`)
  }
  return errors
}
