#!/usr/bin/env node
// Prepares a release: every edit the "Prepare x.y.z" commits made by hand (M2 of the 2026-10
// audit). See RELEASING.md for the whole flow.
//
//   node scripts/release/prepare.mjs 0.15.0 [--date 2026-11-02]    (make release-prepare VERSION=0.15.0)
//   node scripts/release/prepare.mjs 1.0.0-rc.1                       (a release candidate)
//
// It moves the release from the latest one in CHANGELOG.md to <version>:
//   - the release in every template under deploy/ and docs/self-hosting/, the bug report form,
//     web/package.json and the root entries of web/package-lock.json;
//   - Runtipi's tipi_version + 1, and on a new minor the release line (`:0.15`) in the docs;
//   - the store fields a version alone does not move: CasaOS's update_at (the date), an Easypanel
//     changeLog entry, and TrueNAS's own app version (a patch bump, as their Renovate does);
//   - a "## <version>" entry in the Home Assistant add-on's CHANGELOG;
//   - "## [<version>] - <date>" under Unreleased in CHANGELOG.md with the changelog fragments
//     (changelog.d/<Section>/<name>.md, scripts/release/fragments.mjs) as its entries, which it
//     deletes, and the compare links;
//   - F-Droid's notes for the Android version code, fastlane/metadata/android/en-US/changelogs/
//     <code>.txt: that section as plain text within 500 characters, as for Google Play (when it
//     has entries; the owner then rewrites it for the app);
//   - F-Droid's recipe (mobile/android/store/fdroid/app.opentodo.yml): its build and the
//     CurrentVersion its bot reads from main;
//   - then the upstream/ copies (scripts/deploy/mirror.mjs).
// Only the project's own version contexts change (an image tag, a version/tag/placeholder key,
// a version in backticks), never a bare number: web/package-lock.json, for one, has packages
// whose version happens to equal a release. Umbrel's digest is refreshed after the images are
// published (node scripts/deploy/pin.mjs); until then it keeps the previous digest.
//
// A release candidate (x.y.z-rc.N, OpenSpec change release-candidates) is a snapshot for testers:
// it only adds "## [x.y.z-rc.N] - <date>" to CHANGELOG.md with the fragments as its entries, and
// keeps them. Templates, docs, the web app's version and the store fields stay on the latest
// release, as the release workflow moves no `stable` or line tag, publishes no chart and submits
// to no store for it. The final x.y.z then replaces its candidates' sections with one section
// from the fragments, which it deletes. The release gates run for x.y.z; on a candidate the ones
// that need the owner's devices (an over-budget reference-device record) are warnings. The
// reference-device record itself is optional until real devices can be measured (#990), and
// pending screen-reader passes are a warning for any release (screen-reader-passes-optional).

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareVersions, imageFor, latestRelease, loadFacts, ROOT } from '../deploy/common.mjs'
import { COPIES, mirror } from '../deploy/mirror.mjs'
import { checkDeviceRecord } from './deviceRecord.mjs'
import { fragmentsMarkdown, readFragments, removeFragments, unreleasedProblems } from './fragments.mjs'
import { checkMatrixFreshness } from './switchMatrix.mjs'
import { checkUpgradeFixture } from './upgradeFixture.mjs'
import { checkSecurityReviews } from './securityReview.mjs'
import { checkScreenshotFreshness } from './screenshotFreshness.mjs'
import { checkAccessibilityAudit } from './accessibilityAudit.mjs'
import { finalVersion, releaseNotes } from './play-upload.mjs'

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/
/** A release (x.y.z) or a release candidate (x.y.z-rc.N, N from 1). */
const RELEASE = /^(\d+\.\d+\.\d+)(?:-rc\.([1-9]\d*))?$/
/** A release candidate's heading in CHANGELOG.md: base version and number. */
const RC_HEADING = /^## \[(\d+\.\d+\.\d+)-rc\.(\d+)\][^\n]*$/gm
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Files outside deploy/ and docs/self-hosting/ that name the release. */
const FIXED = ['.github/ISSUE_TEMPLATE/bug_report.yml']
/** Files in which every occurrence of the release is the release (a store's own test fixture). */
const WHOLE = new Set(['deploy/runtipi/upstream/scripts/__tests__/update-config.test.ts'])
/** Files whose version is another project's (the Runtipi store repo's own package): never edited. */
const FOREIGN = new Set(['deploy/runtipi/upstream/package.json'])
const HA_CHANGELOG = 'deploy/homeassistant/upstream/opentodo/CHANGELOG.md'
const HA_DOCKERFILE = 'deploy/homeassistant/upstream/opentodo/Dockerfile'
const RUNTIPI_CONFIG = 'deploy/runtipi/config.json'
const CASAOS_COMPOSE = 'deploy/casaos/docker-compose.yml'
const EASYPANEL_META = 'deploy/easypanel/meta.yaml'
const TRUENAS_APP = 'deploy/truenas/opentodo/app.yaml'
const FDROID_RECIPE = 'mobile/android/store/fdroid/app.opentodo.yml'
/** F-Droid's release notes of an Android version code (fastlane/README.md). */
export const fdroidChangelog = (version) => `fastlane/metadata/android/en-US/changelogs/${finalVersion(version).code}.txt`

/** Every text file prepare may edit: deploy/ (but not the generated copies) and the self-hosting docs. */
export function scannedFiles(root = ROOT) {
  const copies = new Set(COPIES.map(([, dst]) => dst))
  const walk = (dir) => readdirSync(join(root, dir)).sort().flatMap((n) => {
    const rel = `${dir}/${n}`
    if (n === 'node_modules') return []
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel]
  })
  return [...walk('deploy'), ...walk('docs/self-hosting'), ...FIXED]
    .filter((rel) => !copies.has(rel) && !FOREIGN.has(rel))
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

/**
 * CHANGELOG.md: the release's heading under Unreleased with `sections` (the fragments, assembled
 * by fragmentsMarkdown) as its entries, and the compare links. Unreleased keeps its pointer to
 * changelog.d/; an entry written there by hand is refused, since it would be left out. The
 * release's own candidates (x.y.z-rc.N) lose their sections and links; another release's refuse it.
 */
export function changelogText(text, from, to, date, sections = '') {
  if (new RegExp(`^## \\[${esc(to)}\\]`, 'm').test(text)) throw new Error(`CHANGELOG.md already has a ## [${to}] section`)
  const problems = [...unreleasedProblems(text), ...otherCandidates(text, to, from)]
  if (problems.length) throw new Error(problems[0])
  text = withoutCandidates(text, to)
  const head = /^## \[Unreleased\][^\n]*\n/m.exec(text)
  const rest = text.slice(head.index + head[0].length)
  const next = rest.search(/^## |^\[[^\]]+\]: /m)
  const at = head.index + head[0].length + (next < 0 ? rest.length : next)
  const release = `## [${to}] - ${date}\n\n${sections ? `${sections}\n` : ''}`
  let out = text.slice(0, at) + release + text.slice(at)
  const link = new RegExp(`^\\[Unreleased\\]: (\\S+)/compare/v${esc(from)}\\.\\.\\.HEAD$`, 'm')
  const m = link.exec(out)
  if (!m) throw new Error(`CHANGELOG.md: no "[Unreleased]: …/compare/v${from}...HEAD" link`)
  out = out.replace(link, `[Unreleased]: ${m[1]}/compare/v${to}...HEAD\n[${to}]: ${m[1]}/compare/v${from}...v${to}`)
  return out
}

/** The release candidates in CHANGELOG.md, newest heading first: [{ version, base, n }]. */
export function candidates(changelog) {
  return [...changelog.matchAll(RC_HEADING)].map((m) => ({ version: `${m[1]}-rc.${m[2]}`, base: m[1], n: Number(m[2]) }))
}

/**
 * Problems with preparing `base` (x.y.z, or the base of a candidate) while CHANGELOG.md has open
 * candidates of another release: ones newer than the latest release `from` (older ones, such as
 * 0.3.1-rc.1, are history).
 */
function otherCandidates(changelog, base, from) {
  const other = candidates(changelog).filter((c) => c.base !== base && compareVersions(c.base, from) > 0)
  return other.length
    ? [`CHANGELOG.md has release candidate sections for ${other[0].base} (${other.map((c) => c.version).join(', ')}): release ${other[0].base} or another candidate of it next, or remove those sections first`]
    : []
}

/**
 * The text without the sections and compare links of `base`'s release candidates: the final
 * release's section, assembled from the same fragments, lists everything they did.
 */
export function withoutCandidates(text, base) {
  const v = esc(base)
  return text
    .replace(new RegExp(`^## \\[${v}-rc\\.\\d+\\][^\\n]*\\n[\\s\\S]*?(?=^## |^\\[[^\\]]+\\]: |(?![\\s\\S]))`, 'gm'), '')
    .replace(new RegExp(`^\\[${v}-rc\\.\\d+\\]: [^\\n]*\\n`, 'gm'), '')
}

/**
 * CHANGELOG.md for the release candidate `to` (x.y.z-rc.N) after the release `from`: its heading
 * under Unreleased with `sections` (the fragments, which stay for the next candidate and the
 * release) as its entries, and its compare link from `from`. Unreleased still compares from
 * `from`, since a candidate is not a release. Refuses a candidate that is not newer than the
 * last one of its release, or while another release has candidates.
 */
export function candidateChangelogText(text, from, to, date, sections = '') {
  const [, base, n] = RELEASE.exec(to)
  if (new RegExp(`^## \\[${esc(to)}\\]`, 'm').test(text)) throw new Error(`CHANGELOG.md already has a ## [${to}] section`)
  const problems = [...unreleasedProblems(text), ...otherCandidates(text, base, from)]
  if (problems.length) throw new Error(problems[0])
  const last = candidates(text).filter((c) => c.base === base).sort((a, b) => b.n - a.n)[0]
  if (last && last.n >= Number(n)) throw new Error(`${to} is not newer than the last release candidate, ${last.version}`)
  const head = /^## \[Unreleased\][^\n]*\n/m.exec(text)
  const rest = text.slice(head.index + head[0].length)
  const next = rest.search(/^## |^\[[^\]]+\]: /m)
  const at = head.index + head[0].length + (next < 0 ? rest.length : next)
  let out = text.slice(0, at) + `## [${to}] - ${date}\n\n${sections ? `${sections}\n` : ''}` + text.slice(at)
  const link = new RegExp(`^\\[Unreleased\\]: (\\S+)/compare/v${esc(from)}\\.\\.\\.HEAD$`, 'm')
  const m = link.exec(out)
  if (!m) throw new Error(`CHANGELOG.md: no "[Unreleased]: …/compare/v${from}...HEAD" link`)
  out = out.replace(link, `${m[0]}\n[${to}]: ${m[1]}/compare/v${from}...v${to}`)
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

/**
 * The release gates for `base` (x.y.z) after `from`: throws on the first that refuses it, and
 * returns the warnings. For a release candidate (`candidate`), a reference-device record over budget
 * is a warning that names it; pending screen-reader passes are a warning for any release; everything
 * else is as strict as for the release.
 */
/** F-Droid's recipe at <to>: its one build and the version its bot reads from main (UpdateCheckMode: HTTP). */
export function fdroidRecipeText(text, to) {
  const { code } = finalVersion(to)
  return text
    .replace(/^( {2}- versionName: )\S+\n( {4}versionCode: )\d+\n( {4}commit: )\S+$/m, `$1${to}\n$2${code}\n$3v${to}`)
    .replace(/^CurrentVersion: \S+\nCurrentVersionCode: \d+$/m, `CurrentVersion: ${to}\nCurrentVersionCode: ${code}`)
}

export function runGates(root, { base, from, date, candidate = false, fromDate = '' }) {
  const warnings = []
  // A minor release's reference-device record, when it has one, is within budget or links issues
  // (performance-10k D5). No record passes: real devices are measured after 1.0 (#990).
  try {
    checkDeviceRecord(root, base, from)
  } catch (e) {
    if (!candidate) throw e
    warnings.push(`reference-device record to fix before ${base}: ${e.message}`)
  }
  // Every import of the migration matrix was checked against a real export lately (migration-everywhere D6).
  checkMatrixFreshness(root, base, date)
  // Every minor leaves the data directory it writes, which later servers must upgrade (stability-contract D4).
  checkUpgradeFixture(root, base, from)
  // From 1.0.0, an external review's findings follow the fix rule and a review is at most 24 months old
  // (external-security-review D4). No review file passes: the review is optional.
  checkSecurityReviews(root, base, from, date, fromDate)
  // From 1.0.0, the guide's screenshots are newer than the last change to the app (docs-1-0 D7).
  checkScreenshotFreshness(root, base)
  // A manual accessibility audit at most 12 months old, every core keyboard and zoom pass done from 1.0.0 on
  // (accessibility-aa D4); screen-reader passes may be pending on any release (screen-reader-passes-optional).
  warnings.push(...checkAccessibilityAudit(root, base, date))
  return warnings
}

/** The date of release `version` in CHANGELOG.md (`## [x.y.z] - YYYY-MM-DD`), or ''. */
export function releaseDate(changelog, version) {
  return new RegExp(`^## \\[${esc(version)}\\] - (\\d{4}-\\d{2}-\\d{2})`, 'm').exec(changelog)?.[1] ?? ''
}

/**
 * Runs the whole preparation of `to` (x.y.z or x.y.z-rc.N) in `root`; returns the files it
 * changed, relative to root, and the gates' warnings.
 */
export function prepare(to, { root = ROOT, date = new Date().toISOString().slice(0, 10) } = {}) {
  const parsed = RELEASE.exec(to)
  if (!parsed) throw new Error(`the version must be x.y.z or x.y.z-rc.N, got ${to}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`the date must be YYYY-MM-DD, got ${date}`)
  // A release candidate is checked as the release it is a candidate of.
  const [, base, rc] = parsed
  const facts = loadFacts(root)
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const r = latestRelease(changelog)
  const from = `${r.major}.${r.minor}.${r.patch}`
  if (compareVersions(base, from) <= 0) throw new Error(`${base} is not newer than the latest release, ${from}`)
  // Another release's open candidates come first: they decide what can be prepared at all.
  const open = otherCandidates(changelog, base, from)
  if (open.length) throw new Error(open[0])
  const warnings = runGates(root, { base, from, date, candidate: Boolean(rc), fromDate: releaseDate(changelog, from) })

  // Nothing is edited when the changelog is not ready: a bad fragment or an entry under Unreleased.
  const notReady = [...readFragments(root).problems, ...unreleasedProblems(changelog)]
  if (notReady.length) throw new Error(notReady.join('; '))

  if (rc) {
    // A candidate is a snapshot of the fragments, which stay for the next candidate and the release.
    const text = candidateChangelogText(changelog, from, to, date, fragmentsMarkdown(readFragments(root).fragments))
    writeFileSync(join(root, 'CHANGELOG.md'), text)
    return { from, to, changed: ['CHANGELOG.md'], warnings }
  }
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
  edit(FDROID_RECIPE, (t) => fdroidRecipeText(t, to))
  edit(HA_CHANGELOG, (t) => haChangelogText(t, to, facts.repository))
  // The add-on copies the binary from the image the release is published under (as its scripts/bump.sh does).
  edit(HA_DOCKERFILE, (t) => t.replace(/^FROM ghcr\.io\/[\w-]+\/opentodo:(\$\{OPENTODO_VERSION\} AS opentodo)$/m, `FROM ${imageFor(facts, to)}:$1`))
  edit('web/package.json', (t) => t.replace(new RegExp(`^(  "version": ")${esc(from)}"`, 'm'), `$1${to}"`))
  // Only the lockfile's own entries: the root and packages[""], each right after "name": "opentodo-web".
  edit('web/package-lock.json', (t) => t.replace(new RegExp(`("name": "opentodo-web",\\n\\s*"version": ")${esc(from)}"`, 'g'), `$1${to}"`))
  // The release's entries are the changelog fragments (changelog.d/README.md), which it then deletes.
  const { fragments } = readFragments(root)
  edit('CHANGELOG.md', (t) => changelogText(t, from, to, date, fragmentsMarkdown(fragments)))
  removeFragments(root, fragments)
  for (const f of fragments) changed.add(f.rel)
  // Without fragments the section is still empty: the notes are written by hand with its summary.
  if (fragments.length) {
    const notes = fdroidChangelog(to)
    mkdirSync(dirname(join(root, notes)), { recursive: true })
    writeFileSync(join(root, notes), releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), to) + '\n')
    changed.add(notes)
  }
  for (const [, dst] of mirror(root)) changed.add(dst)
  return { from, to, changed: [...changed].sort(), warnings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--date')
  const date = at >= 0 ? args.splice(at, 2)[1] : undefined
  const [to] = args
  if (!to) {
    console.error('usage: node scripts/release/prepare.mjs <x.y.z | x.y.z-rc.N> [--date YYYY-MM-DD]')
    process.exit(2)
  }
  try {
    const { from, changed, warnings } = prepare(to, date ? { date } : {})
    for (const f of changed) console.log(`  ${f}`)
    console.log(`release-prepare: ${from} → ${to}, ${changed.length} files changed.`)
    for (const w of warnings) console.log(`warning: ${w}`)
    if (/-rc\./.test(to)) {
      console.log(`A release candidate: only CHANGELOG.md changed, the fragments stay for ${to.replace(/-rc\..*/, '')} (RELEASING.md, Release candidates).`)
      console.log(`Next: write a line under "## [${to}]" saying what to test, commit "Prepare ${to}" and open the pull request.`)
    } else {
      if (!changed.some((f) => f.startsWith('changelog.d/'))) console.log('No changelog fragments: the release has no entries yet (changelog.d/README.md).')
      console.log(`Next: write the release's summary paragraph under "## [${to}]" in CHANGELOG.md, check the order of its entries (and the add-on's entry if it needs more),`)
      console.log(`write ${fdroidChangelog(to)} as what changed for the Android app (at most 500 characters),`)
      console.log('run make deploy-check docs-check, commit "Prepare ' + to + '" and open the pull request (RELEASING.md).')
    }
  } catch (e) {
    console.error(`release-prepare: ${e.message}`)
    process.exit(1)
  }
}
