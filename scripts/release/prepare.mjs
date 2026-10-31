#!/usr/bin/env node
// Prepares a release: every edit the "Prepare x.y.z" commits made by hand (M2 of the 2026-10
// audit). See RELEASING.md for the whole flow.
//
//   node scripts/release/prepare.mjs 0.15.0 [--date 2026-11-02]    (make release-prepare VERSION=0.15.0)
//
// It moves the release from the latest one in CHANGELOG.md to <version>:
//   - the release in every template under deploy/ and docs/self-hosting/, the bug report form,
//     web/package.json, the root entries of web/package-lock.json and web/src/generated/help.json;
//   - Runtipi's tipi_version + 1, and on a new minor the release line (`:0.15`) in the docs;
//   - the store fields a version alone does not move: CasaOS's update_at (the date), an Easypanel
//     changeLog entry, and TrueNAS's own app version (a patch bump, as their Renovate does);
//   - a "## <version>" entry in the Home Assistant add-on's CHANGELOG;
//   - "## [<version>] - <date>" under Unreleased in CHANGELOG.md, and its compare links;
//   - then the upstream/ copies (scripts/deploy/mirror.mjs).
// Only the project's own version contexts change (an image tag, a version/tag/placeholder key,
// a version in backticks), never a bare number: web/package-lock.json, for one, has packages
// whose version happens to equal a release. Umbrel's digest is refreshed after the images are
// published (node scripts/deploy/pin.mjs); until then it keeps the previous digest.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareVersions, imageFor, latestRelease, loadFacts, ROOT } from '../deploy/common.mjs'
import { COPIES, mirror } from '../deploy/mirror.mjs'

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Files outside deploy/ and docs/self-hosting/ that name the release. */
const FIXED = ['.github/ISSUE_TEMPLATE/bug_report.yml']
/** Files in which every occurrence of the release is the release (a store's own test fixture). */
const WHOLE = new Set(['deploy/runtipi/upstream/scripts/__tests__/update-config.test.ts'])
const HA_CHANGELOG = 'deploy/homeassistant/upstream/opentodo/CHANGELOG.md'
const HA_DOCKERFILE = 'deploy/homeassistant/upstream/opentodo/Dockerfile'
const RUNTIPI_CONFIG = 'deploy/runtipi/config.json'
const CASAOS_COMPOSE = 'deploy/casaos/docker-compose.yml'
const EASYPANEL_META = 'deploy/easypanel/meta.yaml'
const TRUENAS_APP = 'deploy/truenas/opentodo/app.yaml'

/** Every text file prepare may edit: deploy/ (but not the generated copies) and the self-hosting docs. */
export function scannedFiles(root = ROOT) {
  const copies = new Set(COPIES.map(([, dst]) => dst))
  const walk = (dir) => readdirSync(join(root, dir)).sort().flatMap((n) => {
    const rel = `${dir}/${n}`
    if (n === 'node_modules') return []
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]
  })
  return [...walk('deploy'), ...walk('docs/self-hosting'), ...FIXED]
    .filter((rel) => !copies.has(rel))
    .filter((rel) => !readFileSync(join(root, rel)).includes(0))
}

/**
 * The release `from` replaced by `to` wherever the text names the project's release: an image tag
 * (the current image; the legacy one only in a digest pin, which moves to the name the new release
 * is published under), a version/tag/placeholder key, ARG OPENTODO_VERSION, a version in backticks.
 */
export function bumpText(text, from, to, facts, whole = false) {
  const v = esc(from)
  const end = '(?![\\w.-]*\\d)'
  if (whole) return text.replace(new RegExp(`(?<![\\d.])${v}(?![\\d])`, 'g'), to)
  let out = text
    .replace(new RegExp(`(${esc(facts.image)}:)${v}${end}`, 'g'), `$1${to}`)
    .replace(new RegExp(`(^|[\\s{,])(["']?(?:version|app_version|appVersion|tag|defaultValue|placeholder)["']?\\s*[:=]\\s*["']?v?)${v}(?=["']?(?:\\s|,|$))`, 'gm'), `$1$2${to}`)
    .replace(new RegExp(`(ARG OPENTODO_VERSION=)${v}${end}`, 'g'), `$1${to}`)
    .replace(new RegExp(`(\`["':]?v?)${v}(["']?\`)`, 'g'), `$1${to}$2`)
    .replace(new RegExp(`(OpenTodo )${v}(?=[,\\s])`, 'g'), `$1${to}`)
  if (facts.legacy?.image) {
    out = out.replace(new RegExp(`${esc(facts.legacy.image)}:${v}(@sha256:[0-9a-f]{64})`, 'g'), `${imageFor(facts, to)}:${to}$1`)
  }
  return out
}

/** On a new minor, the release line (`opentodo:0.14`, `:0.14`) in the docs moves to the new one. */
export function bumpLine(text, from, to) {
  const v = esc(from)
  return text.replace(new RegExp(`((?:opentodo|\`):)${v}(?!\\.?\\d)`, 'g'), `$1${to}`)
}

/** CHANGELOG.md: the release heading under Unreleased (whose entries become the release's) and the compare links. */
export function changelogText(text, from, to, date) {
  if (new RegExp(`^## \\[${esc(to)}\\]`, 'm').test(text)) throw new Error(`CHANGELOG.md already has a ## [${to}] section`)
  if (!/^## \[Unreleased\]\n/m.test(text)) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading')
  let out = text.replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${to}] - ${date}\n`)
  const link = new RegExp(`^\\[Unreleased\\]: (\\S+)/compare/v${esc(from)}\\.\\.\\.HEAD$`, 'm')
  const m = link.exec(out)
  if (!m) throw new Error(`CHANGELOG.md: no "[Unreleased]: …/compare/v${from}...HEAD" link`)
  out = out.replace(link, `[Unreleased]: ${m[1]}/compare/v${to}...HEAD\n[${to}]: ${m[1]}/compare/v${from}...v${to}`)
  return out
}

/** The Home Assistant add-on's CHANGELOG gets the release as its newest entry. */
export function haChangelogText(text, to, repository) {
  if (new RegExp(`^## ${esc(to)}$`, 'm').test(text)) return text
  const at = text.search(/^## /m)
  const entry = `## ${to}\n\n- OpenTodo [${to}](${repository}/releases/tag/v${to}).\n\n`
  return at < 0 ? `${text.trimEnd()}\n\n${entry}` : text.slice(0, at) + entry + text.slice(at)
}

/** CasaOS's x-casaos.update_at becomes the release date. */
export function casaosText(text, date) {
  return text.replace(/^(  update_at: ")\d{4}-\d{2}-\d{2}(")$/m, `$1${date}$2`)
}

/** Easypanel's changeLog gets an entry for the release, after the last one (once). */
export function easypanelText(text, to, date) {
  const m = /^changeLog:\n((?:  [- ].*\n)+)/m.exec(text)
  if (!m) throw new Error(`${EASYPANEL_META}: no changeLog list`)
  if (m[1].includes(`description: Update to ${to}\n`)) return text
  const at = m.index + m[0].length
  return `${text.slice(0, at)}  - date: ${date}\n    description: Update to ${to}\n${text.slice(at)}`
}

/** TrueNAS's app.yaml: the catalogue's own `version` gets a patch bump, as truenas/apps' Renovate does. */
export function truenasText(text) {
  return text.replace(/^(version: )(\d+)\.(\d+)\.(\d+)$/m, (_, k, a, b, c) => `${k}${a}.${b}.${Number(c) + 1}`)
}

/** Runs the whole preparation in `root`; returns the files it changed, relative to root. */
export function prepare(to, { root = ROOT, date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!VERSION.test(to)) throw new Error(`the version must be x.y.z, got ${to}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`the date must be YYYY-MM-DD, got ${date}`)
  const facts = loadFacts(root)
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const r = latestRelease(changelog)
  const from = `${r.major}.${r.minor}.${r.patch}`
  if (compareVersions(to, from) <= 0) throw new Error(`${to} is not newer than the latest release, ${from}`)
  const [, maj, min] = VERSION.exec(to)
  const newMinor = maj !== r.major || min !== r.minor

  const changed = new Set()
  const edit = (rel, fn) => {
    const p = join(root, rel)
    const before = readFileSync(p, 'utf8')
    const after = fn(before)
    if (after !== before) { writeFileSync(p, after); changed.add(rel) }
  }

  for (const rel of scannedFiles(root)) {
    edit(rel, (t) => {
      let out = bumpText(t, from, to, facts, WHOLE.has(rel))
      if (newMinor && (rel.startsWith('docs/') || rel.endsWith('README.md'))) out = bumpLine(out, `${r.major}.${r.minor}`, `${maj}.${min}`)
      return out
    })
  }
  edit(RUNTIPI_CONFIG, (t) => t.replace(/("tipi_version":\s*)(\d+)/, (_, k, n) => `${k}${Number(n) + 1}`))
  edit(CASAOS_COMPOSE, (t) => casaosText(t, date))
  edit(EASYPANEL_META, (t) => easypanelText(t, to, date))
  edit(TRUENAS_APP, truenasText)
  edit(HA_CHANGELOG, (t) => haChangelogText(t, to, facts.repository))
  // The add-on copies the binary from the image the release is published under (as its scripts/bump.sh does).
  edit(HA_DOCKERFILE, (t) => t.replace(/^FROM ghcr\.io\/[\w-]+\/opentodo:(\$\{OPENTODO_VERSION\} AS opentodo)$/m, `FROM ${imageFor(facts, to)}:$1`))
  edit('web/package.json', (t) => t.replace(new RegExp(`^(  "version": ")${esc(from)}"`, 'm'), `$1${to}"`))
  // Only the lockfile's own entries: the root and packages[""], each right after "name": "opentodo-web".
  edit('web/package-lock.json', (t) => t.replace(new RegExp(`("name": "opentodo-web",\\n\\s*"version": ")${esc(from)}"`, 'g'), `$1${to}"`))
  edit('web/src/generated/help.json', (t) => t.replace(new RegExp(`^\\{"version":"${esc(from)}"`), `{"version":"${to}"`))
  edit('CHANGELOG.md', (t) => changelogText(t, from, to, date))
  for (const [, dst] of mirror(root)) changed.add(dst)
  return { from, to, changed: [...changed].sort() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--date')
  const date = at >= 0 ? args.splice(at, 2)[1] : undefined
  const [to] = args
  if (!to) {
    console.error('usage: node scripts/release/prepare.mjs <x.y.z> [--date YYYY-MM-DD]')
    process.exit(2)
  }
  try {
    const { from, changed } = prepare(to, date ? { date } : {})
    for (const f of changed) console.log(`  ${f}`)
    console.log(`release-prepare: ${from} → ${to}, ${changed.length} files changed.`)
    console.log(`Next: write the release's summary paragraph under "## [${to}]" in CHANGELOG.md (and the add-on's entry if it needs more),`)
    console.log('run make deploy-check docs-check, commit "Prepare ' + to + '" and open the pull request (RELEASING.md).')
  } catch (e) {
    console.error(`release-prepare: ${e.message}`)
    process.exit(1)
  }
}
