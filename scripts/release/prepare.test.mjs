// node --test scripts/release/prepare.test.mjs  (make release-prepare; RELEASING.md)
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { run as deployCheck } from '../deploy-check.mjs'
import { laterRelease, loadFacts, readText, releaseVersion, ROOT } from '../deploy/common.mjs'
import { staleCopies } from '../deploy/mirror.mjs'
import { bumpLine, bumpText, casaosText, changelogText, easypanelText, haChangelogText, prepare, truenasText } from './prepare.mjs'
import { checkUpgradeFixture, fixtureDir, isNewMinor } from './upgradeFixture.mjs'
import { checkSecurityReviews, monthsBetween } from './securityReview.mjs'
import { checkScreenshotFreshness } from './screenshotFreshness.mjs'

const facts = loadFacts()
const CURRENT = releaseVersion(readText('CHANGELOG.md'))
const [maj, min, patch] = CURRENT.split('.').map(Number)
const NEXT_PATCH = `${maj}.${min}.${patch + 1}`

/**
 * The files a hand-made patch release changed ("Prepare 0.14.2", 3e5dfcb0), without the deploy
 * tests (they read the release from CHANGELOG.md now). A template that names the release and is
 * not here fails this test: add it, after checking that prepare's edit is the right one.
 */
const PATCH_RELEASE_FILES = [
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  'CHANGELOG.md',
  'deploy/caprover/README.md',
  'deploy/caprover/opentodo.yml',
  'deploy/caprover/upstream/public/v4/apps/opentodo.yml',
  'deploy/casaos/README.md',
  'deploy/casaos/docker-compose.yml',
  'deploy/casaos/upstream/Apps/OpenTodo/docker-compose.yml',
  'deploy/claude-plugin/upstream/plugins/opentodo/.claude-plugin/plugin.json',
  'deploy/dokploy/blueprints/opentodo/docker-compose.yml',
  'deploy/dokploy/blueprints/opentodo/meta.json',
  'deploy/dokploy/meta.json',
  'deploy/dokploy/upstream/blueprints/opentodo/docker-compose.yml',
  'deploy/dokploy/upstream/blueprints/opentodo/meta.json',
  'deploy/easypanel/README.md',
  'deploy/easypanel/meta.yaml',
  'deploy/easypanel/upstream/templates/opentodo/meta.yaml',
  'deploy/helm/opentodo/Chart.yaml',
  'deploy/homeassistant/upstream/opentodo/CHANGELOG.md',
  'deploy/homeassistant/upstream/opentodo/Dockerfile',
  'deploy/homeassistant/upstream/opentodo/config.yaml',
  'deploy/runtipi/README.md',
  'deploy/runtipi/config.json',
  'deploy/runtipi/docker-compose.yml',
  'deploy/runtipi/upstream/apps/opentodo/config.json',
  'deploy/runtipi/upstream/apps/opentodo/docker-compose.yml',
  'deploy/runtipi/upstream/scripts/__tests__/update-config.test.ts',
  'deploy/truenas/README.md',
  'deploy/truenas/opentodo/app.yaml',
  'deploy/truenas/opentodo/ix_values.yaml',
  'deploy/truenas/upstream/ix-dev/community/opentodo/app.yaml',
  'deploy/truenas/upstream/ix-dev/community/opentodo/ix_values.yaml',
  'deploy/umbrel/docker-compose.yml',
  'deploy/umbrel/umbrel-app.yml',
  'deploy/umbrel/upstream/opentodo/docker-compose.yml',
  'deploy/umbrel/upstream/opentodo/umbrel-app.yml',
  'docs/self-hosting/caliber-node.md',
  'docs/self-hosting/caprover.md',
  'docs/self-hosting/casaos.md',
  'docs/self-hosting/docker.md',
  'docs/self-hosting/dokploy.md',
  'docs/self-hosting/easypanel.md',
  'docs/self-hosting/podman.md',
  'docs/self-hosting/render.md',
  'docs/self-hosting/runtipi.md',
  'docs/self-hosting/synology.md',
  'docs/self-hosting/truenas.md',
  'web/package-lock.json',
  'web/package.json',
  'web/src/generated/help.json',
]

/** A copy of what prepare and the deploy checks read, in a temporary directory. */
function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'release-prepare-'))
  for (const p of ['.github', 'deploy', 'docs/self-hosting', 'internal', 'scripts', 'skills', 'web/public', 'CHANGELOG.md', 'LICENSE', 'README.md',
    'web/package.json', 'web/package-lock.json', 'web/src/generated/help.json']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (src) => !src.includes('node_modules') })
  }
  return dir
}

const lines = (text) => text.split('\n')
/** The lines of `rel` that differ between ROOT and `dir`, as [before, after] pairs. */
function changedLines(dir, rel) {
  const a = lines(readFileSync(join(ROOT, rel), 'utf8'))
  const b = lines(readFileSync(join(dir, rel), 'utf8'))
  return a.length === b.length ? a.flatMap((l, i) => (l === b[i] ? [] : [[l, b[i]]])) : null
}

test('release-prepare: a patch release on this tree makes the edits a hand release made, and passes the deploy checks', async () => {
  const dir = copyRepo()
  try {
    const { from, changed } = prepare(NEXT_PATCH, { root: dir, date: '2030-01-02' })
    assert.equal(from, CURRENT)
    assert.deepEqual(changed, PATCH_RELEASE_FILES)
    // Every problem the checks find on the new release, none (Umbrel's digest is checked by shape until pin.mjs runs).
    const problems = (await deployCheck(dir)).flatMap((r) => r.errors.map((e) => `${r.name}: ${e}`))
    assert.deepEqual(problems, [])
    assert.deepEqual(staleCopies(dir), [])

    // The lockfile: only its two own entries, never a dependency that has the same version.
    const lock = changedLines(dir, 'web/package-lock.json')
    assert.equal(lock.length, 2)
    for (const [a, b] of lock) assert.equal(b, a.replace(`"version": "${CURRENT}"`, `"version": "${NEXT_PATCH}"`))
    // Runtipi's tipi_version goes up by one.
    const tipi = (root) => JSON.parse(readFileSync(join(root, 'deploy/runtipi/config.json'), 'utf8')).tipi_version
    assert.equal(tipi(dir), tipi(ROOT) + 1)
    // Each changed line in the docs swaps the release, nothing else.
    for (const rel of PATCH_RELEASE_FILES.filter((f) => f.startsWith('docs/'))) {
      for (const [a, b] of changedLines(dir, rel)) assert.equal(b, a.replaceAll(CURRENT, NEXT_PATCH).replaceAll(facts.legacy.image, facts.image), rel)
    }
    // The store fields a version alone does not move, in the template and its upstream copy.
    for (const rel of ['deploy/casaos/docker-compose.yml', 'deploy/casaos/upstream/Apps/OpenTodo/docker-compose.yml']) {
      assert.match(readFileSync(join(dir, rel), 'utf8'), /^  update_at: "2030-01-02"$/m, rel)
    }
    for (const rel of ['deploy/easypanel/meta.yaml', 'deploy/easypanel/upstream/templates/opentodo/meta.yaml']) {
      assert.ok(readFileSync(join(dir, rel), 'utf8').includes(`  - date: 2030-01-02\n    description: Update to ${NEXT_PATCH}\n`), rel)
    }
    const appVersion = (root, rel) => /^version: (\S+)$/m.exec(readFileSync(join(root, rel), 'utf8'))[1]
    for (const rel of ['deploy/truenas/opentodo/app.yaml', 'deploy/truenas/upstream/ix-dev/community/opentodo/app.yaml']) {
      const [a, b, c] = appVersion(ROOT, rel).split('.').map(Number)
      assert.equal(appVersion(dir, rel), `${a}.${b}.${c + 1}`, rel)
    }
    const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
    assert.match(log, new RegExp(`^## \\[Unreleased\\]\\n\\n## \\[${NEXT_PATCH.replaceAll('.', '\\.')}\\] - 2030-01-02\\n`, 'm'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release-prepare: a new minor also moves the release line in the docs', () => {
  const dir = copyRepo()
  try {
    const next = laterRelease(CURRENT).replace(/\.\d+$/, '.0')
    const line = CURRENT.replace(/\.\d+$/, '')
    const nextLine = next.replace(/\.\d+$/, '')
    const before = ['docker', 'podman', 'render', 'synology', 'coolify'].map((p) => `docs/self-hosting/${p}.md`)
    for (const rel of before) assert.match(readFileSync(join(ROOT, rel), 'utf8'), new RegExp(`(opentodo|\`):${line.replace('.', '\\.')}\``), `${rel} names the release line`)
    assert.throws(() => prepare(next, { root: dir, date: '2030-01-02' }), /needs its upgrade fixture internal\/store\/testdata\/upgrade\/[\d.]+\/: build it with `scripts\/release\/upgrade-fixture\.sh/)
    const fixture = join(dir, fixtureDir(next))
    mkdirSync(fixture, { recursive: true })
    writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({ version: '9.9.0' }))
    writeFileSync(join(fixture, 'data.tar.gz'), '')
    assert.throws(() => prepare(next, { root: dir, date: '2030-01-02' }), /is for 9\.9\.0/)
    writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({ version: next }))
    const { changed } = prepare(next, { root: dir, date: '2030-01-02' })
    assert.ok(changed.includes('docs/self-hosting/coolify.md'))
    for (const rel of before) {
      const text = readFileSync(join(dir, rel), 'utf8')
      assert.match(text, new RegExp(`(opentodo|\`):${nextLine.replace('.', '\\.')}\``), rel)
      assert.doesNotMatch(text, new RegExp(`(opentodo|\`):${line.replace('.', '\\.')}\``), rel)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release-prepare: only the project version contexts change', () => {
  const t = (text, from = '0.13.0', to = '0.14.0') => bumpText(text, from, to, facts)
  // Things that merely have the same number.
  for (const keep of ['"eslint": "10.13.0"', '"version": "10.13.0"', 'busybox:0.13.0', 'after 0.13.0 the image moved', 'Releases up to 0.13.0 come from',
    `a pin such as \`${facts.legacy.image}:0.13.0@sha256:…\``, 'v: 0.13.0 # comment', 'version 0.13.0.1']) {
    assert.equal(t(keep), keep, keep)
  }
  // The release, where the text names it.
  const cases = [
    [`image: ${facts.image}:0.13.0`, `image: ${facts.image}:0.14.0`],
    ['  "version": "0.13.0",', '  "version": "0.14.0",'],
    ['version: "0.13.0"', 'version: "0.14.0"'],
    ['appVersion: "0.13.0"', 'appVersion: "0.14.0"'],
    ['app_version: 0.13.0', 'app_version: 0.14.0'],
    ['    tag: "0.13.0"', '    tag: "0.14.0"'],
    ["defaultValue: '0.13.0'", "defaultValue: '0.14.0'"],
    ['placeholder: v0.13.0', 'placeholder: v0.14.0'],
    ['ARG OPENTODO_VERSION=0.13.0', 'ARG OPENTODO_VERSION=0.14.0'],
    ['for example `0.13.0`.', 'for example `0.14.0`.'],
    ['pin one version `:0.13.0`;', 'pin one version `:0.14.0`;'],
    ['tag `"0.13.0"`', 'tag `"0.14.0"`'],
    ['en_US: "OpenTodo 0.13.0, the first', 'en_US: "OpenTodo 0.14.0, the first'],
  ]
  for (const [a, b] of cases) assert.equal(t(a), b, a)
  // A digest pin under the legacy name moves to the name the new release is published under.
  const d = 'a'.repeat(64)
  assert.equal(bumpText(`${facts.legacy.image}:${facts.legacy.lastRelease}@sha256:${d}`, facts.legacy.lastRelease, '99.0.0', facts), `${facts.image}:99.0.0@sha256:${d}`)
  // The release line only on a whole x.y.
  assert.equal(bumpLine('use `:0.13` or `opentodo:0.13`, or `:0.13.2`', '0.13', '0.14'), 'use `:0.14` or `opentodo:0.14`, or `:0.13.2`')
})

test('release-prepare: CHANGELOG.md and the add-on changelog', () => {
  const log = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- A fix.\n\n## [1.2.3] - 2030-01-01\n\n[Unreleased]: https://x/compare/v1.2.3...HEAD\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n'
  assert.equal(changelogText(log, '1.2.3', '1.2.4', '2030-02-02'),
    '# Changelog\n\n## [Unreleased]\n\n## [1.2.4] - 2030-02-02\n\n### Fixed\n\n- A fix.\n\n## [1.2.3] - 2030-01-01\n\n' +
    '[Unreleased]: https://x/compare/v1.2.4...HEAD\n[1.2.4]: https://x/compare/v1.2.3...v1.2.4\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n')
  assert.throws(() => changelogText(log, '1.2.2', '1.2.3', '2030-02-02'), /already has/)
  const ha = '# Changelog\n\nIntro.\n\n## 1.2.3\n\n- OpenTodo 1.2.3.\n'
  const out = haChangelogText(ha, '1.2.4', 'https://github.com/o/r')
  assert.equal(out, '# Changelog\n\nIntro.\n\n## 1.2.4\n\n- OpenTodo [1.2.4](https://github.com/o/r/releases/tag/v1.2.4).\n\n## 1.2.3\n\n- OpenTodo 1.2.3.\n')
  assert.equal(haChangelogText(out, '1.2.4', 'https://github.com/o/r'), out)
})

test('release-prepare: the CasaOS date, the Easypanel changeLog and the TrueNAS app version', () => {
  assert.equal(casaosText('x-casaos:\n  version: "1.2.4"\n  update_at: "2030-01-01"\n  title: x\n', '2030-02-02'),
    'x-casaos:\n  version: "1.2.4"\n  update_at: "2030-02-02"\n  title: x\n')
  const ep = 'name: x\nchangeLog:\n  - date: 2030-01-01\n    description: First Release\nlinks:\n  - label: Website\n'
  const epOut = easypanelText(ep, '1.2.4', '2030-02-02')
  assert.equal(epOut, 'name: x\nchangeLog:\n  - date: 2030-01-01\n    description: First Release\n  - date: 2030-02-02\n    description: Update to 1.2.4\nlinks:\n  - label: Website\n')
  assert.equal(easypanelText(epOut, '1.2.4', '2030-02-03'), epOut)
  assert.throws(() => easypanelText('name: x\n', '1.2.4', '2030-02-02'), /no changeLog/)
  assert.equal(truenasText('app_version: 1.2.4\nversion: 1.0.9\nlib_version: 2.3.17\n'), 'app_version: 1.2.4\nversion: 1.0.10\nlib_version: 2.3.17\n')
})

test('release-prepare: refuses a version that is not x.y.z or not newer, before it writes anything', () => {
  assert.throws(() => prepare('1.2', { root: ROOT }), /must be x\.y\.z/)
  assert.throws(() => prepare(CURRENT, { root: ROOT }), /is not newer than the latest release/)
  assert.throws(() => prepare(NEXT_PATCH, { root: ROOT, date: '2. Januar' }), /YYYY-MM-DD/)
})

test('release-prepare: a new minor needs its upgrade fixture, a patch does not (stability-contract)', () => {
  assert.equal(fixtureDir('1.2.0'), 'internal/store/testdata/upgrade/1.2')
  assert.ok(isNewMinor('1.2.0', '1.1.3'))
  assert.ok(isNewMinor('2.0.0', '1.9.1'))
  assert.ok(!isNewMinor('1.2.1', '1.2.0'))
  const dir = mkdtempSync(join(tmpdir(), 'upgrade-fixture-'))
  try {
    assert.throws(() => checkUpgradeFixture(dir, '1.2.0', '1.1.3'), /upgrade\/1\.2\/: build it with `scripts\/release\/upgrade-fixture\.sh 1\.2\.0 HEAD`/)
    assert.doesNotThrow(() => checkUpgradeFixture(dir, '1.2.1', '1.2.0'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A data root with one review file delivered on `delivered` and these finding rows (external-security-review D4). */
function reviewRoot(delivered, rows) {
  const dir = mkdtempSync(join(tmpdir(), 'security-review-'))
  mkdirSync(join(dir, 'docs/security/reviews'), { recursive: true })
  writeFileSync(join(dir, 'docs/security/reviews', `${delivered.slice(0, 7)}-example.md`), [
    '# Review', '', '## Record', '', '| Field | Value |', '|---|---|', '| Reviewer | Example |', `| Commit | \`${'b'.repeat(40)}\` |`,
    `| Delivered | ${delivered} |`, '| Published | Not yet |', '| Scope | `host-mode-isolation` |', '', '## Findings', '',
    '| ID | Title | Severity | Status | Fix | Regression test | Advisory |', '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`), '',
  ].join('\n'))
  return dir
}

test('release-prepare: the security review gate (external-security-review)', (t) => {
  const roots = []
  t.after(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })))
  const root = (...a) => { const d = reviewRoot(...a); roots.push(d); return d }
  const empty = mkdtempSync(join(tmpdir(), 'security-review-')); roots.push(empty)
  // No review file: the review is optional for 1.0, the gate passes.
  assert.doesNotThrow(() => checkSecurityReviews(empty, '1.0.0', '0.30.0', '2027-06-01', '2027-05-01'))
  // Before 1.0 the gate never runs, whatever the files say.
  assert.doesNotThrow(() => checkSecurityReviews(root('2027-03-01', [['OTD-01', 'x', 'High', 'Open', '', '', '']]), '0.31.0', '0.30.0', '2027-06-01'))
  // An open (or merely fixed) High blocks 1.0 and is named.
  assert.throws(() => checkSecurityReviews(root('2027-03-01', [['OTD-04', 'x', 'High', 'Fixed', '#1', '`internal/a/a_test.go`', '']]), '1.0.0', '0.30.0', '2027-06-01'),
    /OTD-04 \(High\) is Fixed; it must be Fixed \(retested\)/)
  // An accepted Medium within its target passes; past its target it blocks.
  const medium = root('2027-03-01', [['OTD-05', 'x', 'Medium', 'Accepted', 'Needs a schema change; target 1.1.0', '', '']])
  assert.doesNotThrow(() => checkSecurityReviews(medium, '1.0.0', '0.30.0', '2027-06-01'))
  assert.doesNotThrow(() => checkSecurityReviews(medium, '1.1.0', '1.0.3', '2027-09-01'))
  assert.throws(() => checkSecurityReviews(medium, '1.2.0', '1.1.0', '2027-12-01'), /OTD-05 \(Medium\) was accepted until 1\.1\.0/)
  // A review older than 24 months: a new one is due.
  const ok = root('2027-03-01', [['OTD-06', 'x', 'Low', 'Open', '#7', '', '']])
  assert.doesNotThrow(() => checkSecurityReviews(ok, '1.8.0', '1.7.2', '2029-02-28'))
  assert.throws(() => checkSecurityReviews(ok, '1.9.0', '1.8.0', '2029-04-01'), /more than 24 months ago: a new external review is due/)
  // A new major needs a review delivered after the previous major's last release.
  assert.throws(() => checkSecurityReviews(ok, '2.0.0', '1.8.4', '2028-06-01', '2028-05-01'), /2\.0\.0 is a new major version.*a new external review is due/)
  assert.doesNotThrow(() => checkSecurityReviews(root('2028-05-20', []), '2.0.0', '1.8.4', '2028-06-01', '2028-05-01'))
  assert.equal(monthsBetween('2027-03-01', '2029-02-28'), 23)
  assert.equal(monthsBetween('2027-03-01', '2029-03-01'), 24)
})

test('from 1.0.0, release preparation refuses screenshots older than the app (docs-1-0 D7)', () => {
  const times = (shots, app) => (_root, path) => (path === 'web/src/app' ? app : shots)
  const day = 86_400
  assert.throws(() => checkScreenshotFreshness('.', '1.0.0', times(10 * day, 12 * day)), /run `make docs-screenshots`/)
  assert.doesNotThrow(() => checkScreenshotFreshness('.', '1.0.0', times(12 * day, 12 * day)))
  assert.doesNotThrow(() => checkScreenshotFreshness('.', '0.23.0', times(10 * day, 12 * day)))
  // A dry run on this repository reads git: it passes, or names both dates.
  try { checkScreenshotFreshness(ROOT, '1.0.0') } catch (e) { assert.match(e.message, /^docs\/images: the newest screenshot was committed \d{4}-\d{2}-\d{2}/) }
})
