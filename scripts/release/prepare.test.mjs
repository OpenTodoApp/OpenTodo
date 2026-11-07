// node --test scripts/release/prepare.test.mjs  (make release-prepare; RELEASING.md)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { run as deployCheck } from '../deploy-check.mjs'
import { compareVersions, laterRelease, loadFacts, readText, releaseVersion, ROOT } from '../deploy/common.mjs'
import { staleCopies } from '../deploy/mirror.mjs'
import { bumpLine, bumpText, candidateChangelogText, candidates, casaosText, changelogText, easypanelText, haChangelogText, prepare, truenasText, withoutCandidates } from './prepare.mjs'
import { checkUpgradeFixture, fixtureDir, isNewMinor } from './upgradeFixture.mjs'
import { fragmentsMarkdown, readFragments } from './fragments.mjs'
import { checkSecurityReviews, monthsBetween } from './securityReview.mjs'
import { checkScreenshotFreshness } from './screenshotFreshness.mjs'

const facts = loadFacts()
const CURRENT = releaseVersion(readText('CHANGELOG.md'))
const [maj, min, patch] = CURRENT.split('.').map(Number)
const NEXT_PATCH = `${maj}.${min}.${patch + 1}`
/** This tree's CHANGELOG.md without the sections of a release candidate it has open (newer than CURRENT). */
const BASE_CHANGELOG = (() => {
  const text = readText('CHANGELOG.md')
  const open = new Set(candidates(text).filter((c) => compareVersions(c.base, CURRENT) > 0).map((c) => c.base))
  return [...open].reduce(withoutCandidates, text)
})()

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
]

/** A copy of what prepare and the deploy checks read, in a temporary directory. */
function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'release-prepare-'))
  for (const p of ['.github', 'deploy', 'docs/self-hosting', 'internal', 'scripts', 'skills', 'web/public', 'CHANGELOG.md', 'LICENSE', 'README.md',
    'web/package.json', 'web/package-lock.json']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (src) => !src.includes('node_modules') })
  }
  // The changelog fragments of this tree are left out: each test writes the ones it needs.
  mkdirSync(join(dir, 'changelog.d'))
  // So are the sections of a release candidate this tree has open (between 1.0.0-rc.1 and 1.0.0):
  // the tests prepare the next patch, minor or candidate after the latest release.
  writeFileSync(join(dir, 'CHANGELOG.md'), BASE_CHANGELOG)
  return dir
}

/** Writes changelog.d/<rel> in `dir`. */
function fragment(dir, rel, text) {
  mkdirSync(dirname(join(dir, 'changelog.d', rel)), { recursive: true })
  writeFileSync(join(dir, 'changelog.d', rel), text)
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
    fragment(dir, 'Fixed/b-fix.md', '- **The second fix.** By name, after a-fix.\n')
    fragment(dir, 'Fixed/a-fix.md', '**The first fix.** Written without its bullet.\n')
    fragment(dir, 'Security/a-hole.md', '- **A security fix.**\n')
    const { from, changed } = prepare(NEXT_PATCH, { root: dir, date: '2030-01-02' })
    assert.equal(from, CURRENT)
    assert.deepEqual(changed, [...PATCH_RELEASE_FILES, 'changelog.d/Fixed/a-fix.md', 'changelog.d/Fixed/b-fix.md', 'changelog.d/Security/a-hole.md'].sort())
    // The fragments became the release's entries and are gone.
    assert.deepEqual(readdirSync(join(dir, 'changelog.d'), { recursive: true }).filter((f) => f.endsWith('.md')), [])
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
    const v = NEXT_PATCH.replaceAll('.', '\\.')
    assert.match(log, new RegExp(`^## \\[Unreleased\\]\\n\\nChanges since the last release are in \\[changelog\\.d/\\][^\\n]*\\n\\n## \\[${v}\\] - 2030-01-02\\n\\n` +
      '### Security\\n\\n- \\*\\*A security fix\\.\\*\\*\\n\\n### Fixed\\n\\n- \\*\\*The first fix\\.\\*\\* Written without its bullet\\.\\n- \\*\\*The second fix\\.\\*\\* By name, after a-fix\\.\\n\\n' +
      `## \\[${CURRENT.replaceAll('.', '\\.')}\\] - `, 'm'))
    // The release notes of the tag are those entries (scripts/release-notes.sh).
    const notes = execFileSync('sh', [join(ROOT, 'scripts/release-notes.sh'), NEXT_PATCH, join(dir, 'CHANGELOG.md')], { encoding: 'utf8' })
    assert.ok(notes.trimStart().startsWith('### Security\n\n- **A security fix.**\n\n### Fixed\n\n- **The first fix.**'), notes.slice(0, 200))
    assert.ok(!notes.includes('changelog.d'), 'the Unreleased pointer is not part of the notes')
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
  const log = '# Changelog\n\n## [Unreleased]\n\nSee changelog.d/.\n\n## [1.2.3] - 2030-01-01\n\n[Unreleased]: https://x/compare/v1.2.3...HEAD\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n'
  assert.equal(changelogText(log, '1.2.3', '1.2.4', '2030-02-02', '### Fixed\n\n- A fix.\n'),
    '# Changelog\n\n## [Unreleased]\n\nSee changelog.d/.\n\n## [1.2.4] - 2030-02-02\n\n### Fixed\n\n- A fix.\n\n## [1.2.3] - 2030-01-01\n\n' +
    '[Unreleased]: https://x/compare/v1.2.4...HEAD\n[1.2.4]: https://x/compare/v1.2.3...v1.2.4\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n')
  // No fragments: the heading alone (the summary is written by hand); an empty Unreleased works too.
  assert.ok(changelogText(log.replace('See changelog.d/.\n\n', ''), '1.2.3', '1.2.4', '2030-02-02').startsWith('# Changelog\n\n## [Unreleased]\n\n## [1.2.4] - 2030-02-02\n\n## [1.2.3]'))
  assert.throws(() => changelogText(log, '1.2.2', '1.2.3', '2030-02-02'), /already has/)
  // An entry written under Unreleased by hand would be lost: refused.
  assert.throws(() => changelogText(log.replace('See changelog.d/.', '### Fixed\n\n- A fix.'), '1.2.3', '1.2.4', '2030-02-02'), /under "## \[Unreleased\]".*changelog\.d/)
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

test('release-prepare: changelog fragments, assembled in a stable order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fragments-'))
  try {
    fragment(dir, 'Fixed/zeta.md', '- **Z.** Last by name.\n')
    fragment(dir, 'Fixed/alpha.md', '- **A.** First by name.\n  Continued.\n')
    fragment(dir, 'Added/two-bullets.md', '- **One.**\n- **Two.**\n')
    fragment(dir, 'Removed/old-thing.md', 'The old thing.\nOn two lines.\n')
    fragment(dir, 'Security/csp.md', '- **CSP.**\n')
    fragment(dir, 'Changed/x.md', '- **X.**\n')
    writeFileSync(join(dir, 'changelog.d/README.md'), '# About\n')
    const { fragments, problems } = readFragments(dir)
    assert.deepEqual(problems, [])
    assert.deepEqual(fragments.map((f) => f.rel), ['Security/csp.md', 'Added/two-bullets.md', 'Changed/x.md', 'Removed/old-thing.md', 'Fixed/alpha.md', 'Fixed/zeta.md'].map((r) => `changelog.d/${r}`))
    assert.equal(fragmentsMarkdown(fragments), '### Security\n\n- **CSP.**\n\n### Added\n\n- **One.**\n- **Two.**\n\n### Changed\n\n- **X.**\n\n' +
      '### Removed\n\n- The old thing.\n  On two lines.\n\n### Fixed\n\n- **A.** First by name.\n  Continued.\n- **Z.** Last by name.\n')
    assert.equal(fragmentsMarkdown([]), '')
    assert.deepEqual(readFragments(join(dir, 'nowhere')), { fragments: [], problems: [] })
    // Every misplaced or malformed file is named.
    fragment(dir, 'Fixes/typo.md', '- x\n')
    fragment(dir, 'Fixed/Upper Case.md', '- x\n')
    fragment(dir, 'Fixed/empty.md', '\n')
    fragment(dir, 'Fixed/heading.md', '### Fixed\n\n- x\n')
    fragment(dir, 'Fixed/sub/deep.md', '- x\n')
    fragment(dir, 'loose.md', '- x\n')
    assert.deepEqual(readFragments(dir).problems, [
      'changelog.d/Fixed/Upper Case.md: the name must be the change name or a slug (a-z, 0-9, -) ending in .md',
      'changelog.d/Fixed/empty.md: is empty',
      'changelog.d/Fixed/heading.md: has a heading; a fragment is only the entry, its section is its folder',
      'changelog.d/Fixed/sub/: no folders inside a section',
      'changelog.d/Fixes/: unknown section; use one of Security, Added, Changed, Removed, Fixed',
      'changelog.d/loose.md: a fragment goes in a section folder, changelog.d/<Security|Added|Changed|Removed|Fixed>/<name>.md',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release-prepare: refuses a bad fragment or an entry under Unreleased, before it writes anything', () => {
  const dir = copyRepo()
  try {
    fragment(dir, 'Fixd/typo.md', '- **A fix.**\n')
    assert.throws(() => prepare(NEXT_PATCH, { root: dir, date: '2030-01-02' }), /changelog\.d\/Fixd\/: unknown section/)
    rmSync(join(dir, 'changelog.d/Fixd'), { recursive: true })
    const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
    writeFileSync(join(dir, 'CHANGELOG.md'), log.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n\n- A fix written by hand.\n'))
    assert.throws(() => prepare(NEXT_PATCH, { root: dir, date: '2030-01-02' }), /2 line\(s\) under "## \[Unreleased\]"/)
    for (const rel of PATCH_RELEASE_FILES.filter((f) => f !== 'CHANGELOG.md')) assert.equal(readFileSync(join(dir, rel), 'utf8'), readFileSync(join(ROOT, rel), 'utf8'), rel)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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

// ---- release candidates (OpenSpec change release-candidates) ----

const NEXT_MAJOR = `${maj + 1}.0.0`
const rcOf = (n) => `${NEXT_MAJOR}-rc.${n}`
const reV = (v) => v.replaceAll('.', '\\.')

/**
 * A copy of the tree ready for NEXT_MAJOR but for what needs the owner's devices: its upgrade
 * fixture, one core screen whose keyboard and zoom passes are done and whose screen-reader passes
 * are pending, and no reference-device record (optional until real devices are measured, #990).
 */
function candidateRepo() {
  const dir = copyRepo()
  const fixture = join(dir, fixtureDir(NEXT_MAJOR))
  mkdirSync(fixture, { recursive: true })
  writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({ version: NEXT_MAJOR }))
  writeFileSync(join(fixture, 'data.tar.gz'), '')
  writeFileSync(join(dir, 'scripts/ux-audit/screens.json'), JSON.stringify([{ id: 'inbox', core: true }]))
  audit(dir, ['pass', 'pending', 'pending', 'pending', 'pending', 'pass'])
  return dir
}
function audit(dir, cells) {
  mkdirSync(join(dir, 'docs/accessibility'), { recursive: true })
  writeFileSync(join(dir, `docs/accessibility/audit-${NEXT_MAJOR}.md`), `Date: 2030-01-01\n\n| \`inbox\` | ${cells.join(' | ')} |\n`)
}
function deviceRecord(dir, coldStart = '1,000') {
  mkdirSync(join(dir, 'docs/performance'), { recursive: true })
  writeFileSync(join(dir, `docs/performance/results-${NEXT_MAJOR}.md`), `| Metric | Android | iPhone | Raspberry Pi 4 |\n| --- | --- | --- | --- |\n| \`cold-start\` (ms) | ${coldStart} | 1,000 | — |\n`)
}
const fragmentFiles = (dir) => readdirSync(join(dir, 'changelog.d'), { recursive: true }).filter((f) => f.endsWith('.md')).sort()

test('release-prepare: a release candidate only adds its CHANGELOG.md section, keeps the fragments and warns about what the owner has pending', async () => {
  const dir = candidateRepo()
  try {
    fragment(dir, 'Added/a-feature.md', '- **A feature.**\n')
    fragment(dir, 'Fixed/a-fix.md', '- **A fix.**\n')
    const { from, changed, warnings } = prepare(rcOf(1), { root: dir, date: '2030-01-02' })
    assert.equal(from, CURRENT)
    assert.deepEqual(changed, ['CHANGELOG.md'])
    // The pending screen-reader passes are one line for the release notes, for any release. No
    // reference-device record is no warning: it is optional until real devices are measured (#990).
    assert.equal(warnings.length, 1, warnings.join('\n'))
    assert.equal(warnings[0], `accessibility audit: 4 screen-reader passes pending on 1 core screens in docs/accessibility/audit-${NEXT_MAJOR}.md ` +
      `(NVDA + Firefox, VoiceOver + Safari (macOS), VoiceOver (iOS shell), TalkBack (Android shell)), recorded when someone runs them (#9)`)
    // No template, doc, store field or web app version moves to a candidate; the deploy checks still pass on the latest release.
    for (const rel of PATCH_RELEASE_FILES.filter((f) => f !== 'CHANGELOG.md')) assert.equal(readFileSync(join(dir, rel), 'utf8'), readFileSync(join(ROOT, rel), 'utf8'), rel)
    const problems = (await deployCheck(dir)).flatMap((r) => r.errors.map((e) => `${r.name}: ${e}`))
    assert.deepEqual(problems, [])
    assert.equal(releaseVersion(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')), CURRENT)
    // The fragments stay for the next candidate and the release.
    assert.deepEqual(fragmentFiles(dir), ['Added/a-feature.md', 'Fixed/a-fix.md'])
    const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
    assert.match(log, new RegExp(`^## \\[Unreleased\\]\\n\\nChanges since the last release are in [^\\n]*\\n\\n## \\[${reV(rcOf(1))}\\] - 2030-01-02\\n\\n` +
      `### Added\\n\\n- \\*\\*A feature\\.\\*\\*\\n\\n### Fixed\\n\\n- \\*\\*A fix\\.\\*\\*\\n\\n## \\[${reV(CURRENT)}\\] - `, 'm'))
    // Unreleased still compares from the latest release; the candidate has its own link.
    assert.match(log, new RegExp(`^\\[Unreleased\\]: (\\S+)/compare/v${reV(CURRENT)}\\.\\.\\.HEAD\\n\\[${reV(rcOf(1))}\\]: \\1/compare/v${reV(CURRENT)}\\.\\.\\.v${reV(rcOf(1))}\\n\\[${reV(CURRENT)}\\]: `, 'm'))
    // The tag's release notes are the candidate's section (scripts/release-notes.sh).
    const notes = execFileSync('sh', [join(ROOT, 'scripts/release-notes.sh'), rcOf(1), join(dir, 'CHANGELOG.md')], { encoding: 'utf8' })
    assert.ok(notes.trimStart().startsWith('### Added\n\n- **A feature.**\n\n### Fixed\n\n- **A fix.**\n'), notes.slice(0, 200))

    // The next candidate lists everything since the latest release again; an older or repeated number is refused.
    assert.throws(() => prepare(rcOf(1), { root: dir, date: '2030-01-03' }), /already has a ## \[/)
    fragment(dir, 'Fixed/b-fix.md', '- **Another fix.**\n')
    assert.deepEqual(prepare(rcOf(3), { root: dir, date: '2030-01-03' }).changed, ['CHANGELOG.md'])
    assert.throws(() => prepare(rcOf(2), { root: dir, date: '2030-01-04' }), new RegExp(`${reV(rcOf(2))} is not newer than the last release candidate, ${reV(rcOf(3))}`))
    const log3 = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
    assert.ok(log3.includes(`## [${rcOf(3)}] - 2030-01-03\n\n### Added\n\n- **A feature.**\n\n### Fixed\n\n- **A fix.**\n- **Another fix.**\n\n## [${rcOf(1)}] - 2030-01-02\n`))
    // Another release cannot start while this one has candidates.
    assert.throws(() => prepare(`${maj + 1}.1.0-rc.1`, { root: dir, date: '2030-01-04' }), new RegExp(`release candidate sections for ${reV(NEXT_MAJOR)} \\(${reV(rcOf(3))}, ${reV(rcOf(1))}\\)`))
    assert.throws(() => prepare(NEXT_PATCH, { root: dir, date: '2030-01-04' }), /release candidate sections for/)

    // The release is strict about a device record, when there is one, being within budget; screen-reader passes may stay pending.
    deviceRecord(dir, '9,000')
    assert.match(prepare(rcOf(4), { root: dir, date: '2030-01-04' }).warnings[0], new RegExp(`^reference-device record to fix before ${reV(NEXT_MAJOR)}: docs\\/performance\\/results-${reV(NEXT_MAJOR)}\\.md:\\n  cold-start, Android: 9000 ms`))
    assert.throws(() => prepare(NEXT_MAJOR, { root: dir, date: '2030-01-05' }), /results-[\d.]+\.md:\n {2}cold-start, Android: 9000 ms is over the budget of 3000 ms and links no issue/)
    deviceRecord(dir)
    const final = prepare(NEXT_MAJOR, { root: dir, date: '2030-01-05' })
    assert.equal(final.warnings.length, 1, final.warnings.join('\n'))
    assert.match(final.warnings[0], /^accessibility audit: 4 screen-reader passes pending on 1 core screens/)
    assert.ok(final.changed.includes('web/package.json') && final.changed.includes('deploy/helm/opentodo/Chart.yaml'))
    // One section with every fragment replaces the candidates' sections and links; the fragments are gone.
    assert.deepEqual(fragmentFiles(dir), [])
    const out = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')
    assert.doesNotMatch(out, new RegExp(`${reV(NEXT_MAJOR)}-rc`))
    assert.ok(out.includes(`## [${NEXT_MAJOR}] - 2030-01-05\n\n### Added\n\n- **A feature.**\n\n### Fixed\n\n- **A fix.**\n- **Another fix.**\n\n## [${CURRENT}] - `))
    assert.match(out, new RegExp(`^\\[Unreleased\\]: (\\S+)/compare/v${reV(NEXT_MAJOR)}\\.\\.\\.HEAD\\n\\[${reV(NEXT_MAJOR)}\\]: \\1/compare/v${reV(CURRENT)}\\.\\.\\.v${reV(NEXT_MAJOR)}\\n\\[${reV(CURRENT)}\\]: `, 'm'))
    // A candidate of an earlier release (0.3.1-rc.1) is history and stays.
    assert.equal(out.includes('## [0.3.1-rc.1]'), BASE_CHANGELOG.includes('## [0.3.1-rc.1]'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release-prepare: on a release candidate the other gates stay strict', () => {
  const dir = candidateRepo()
  try {
    // A keyboard pass is not a screen-reader pass: still pending, still refused.
    audit(dir, ['pending', 'pending', 'pending', 'pending', 'pending', 'pass'])
    assert.throws(() => prepare(rcOf(1), { root: dir, date: '2030-01-02' }), /accessibility audit:\n {2}[^\n]*inbox, Keyboard only is still pending$/)
    audit(dir, ['pass', 'pending', 'pending', 'pending', 'pending', 'pass'])
    // An audit more than 12 months old.
    assert.throws(() => prepare(rcOf(1), { root: dir, date: '2031-02-01' }), /a manual accessibility audit is due/)
    // The upgrade fixture of the release.
    rmSync(join(dir, fixtureDir(NEXT_MAJOR)), { recursive: true })
    assert.throws(() => prepare(rcOf(1), { root: dir, date: '2030-01-02' }), /needs its upgrade fixture/)
    // A version that is neither x.y.z nor x.y.z-rc.N, or a candidate of a release that is not newer.
    for (const v of [`${NEXT_MAJOR}-rc.0`, `${NEXT_MAJOR}-beta.1`, `${NEXT_MAJOR}-rc1`]) assert.throws(() => prepare(v, { root: dir }), /must be x\.y\.z or x\.y\.z-rc\.N/, v)
    assert.throws(() => prepare(`${CURRENT}-rc.1`, { root: dir }), /is not newer than the latest release/)
    assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), BASE_CHANGELOG)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('release-prepare: the changelog of a candidate and of the release after it', () => {
  const log = '# Changelog\n\n## [Unreleased]\n\nSee changelog.d/.\n\n## [1.2.3] - 2030-01-01\n\n[Unreleased]: https://x/compare/v1.2.3...HEAD\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n'
  const rc1 = candidateChangelogText(log, '1.2.3', '1.3.0-rc.1', '2030-02-01', '### Fixed\n\n- A fix.\n')
  assert.equal(rc1, '# Changelog\n\n## [Unreleased]\n\nSee changelog.d/.\n\n## [1.3.0-rc.1] - 2030-02-01\n\n### Fixed\n\n- A fix.\n\n## [1.2.3] - 2030-01-01\n\n' +
    '[Unreleased]: https://x/compare/v1.2.3...HEAD\n[1.3.0-rc.1]: https://x/compare/v1.2.3...v1.3.0-rc.1\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n')
  assert.deepEqual(candidates(rc1), [{ version: '1.3.0-rc.1', base: '1.3.0', n: 1 }])
  const rc2 = candidateChangelogText(rc1, '1.2.3', '1.3.0-rc.2', '2030-02-08', '### Fixed\n\n- A fix.\n- Another.\n')
  assert.equal(withoutCandidates(rc2, '1.3.0'), log)
  assert.equal(changelogText(rc2, '1.2.3', '1.3.0', '2030-02-15', '### Fixed\n\n- A fix.\n- Another.\n'),
    '# Changelog\n\n## [Unreleased]\n\nSee changelog.d/.\n\n## [1.3.0] - 2030-02-15\n\n### Fixed\n\n- A fix.\n- Another.\n\n## [1.2.3] - 2030-01-01\n\n' +
    '[Unreleased]: https://x/compare/v1.3.0...HEAD\n[1.3.0]: https://x/compare/v1.2.3...v1.3.0\n[1.2.3]: https://x/compare/v1.2.2...v1.2.3\n')
  // A summary written under a candidate goes with it: the release gets its own.
  assert.equal(withoutCandidates(rc1.replace('## [1.3.0-rc.1] - 2030-02-01\n\n', '## [1.3.0-rc.1] - 2030-02-01\n\nTest the new sync.\n\n'), '1.3.0'), log)
  // A candidate of an older release is history: it neither blocks nor is removed.
  const old = log.replace('## [1.2.3] - 2030-01-01\n\n', '## [1.2.3] - 2030-01-01\n\n## [1.2.3-rc.1] - 2029-12-01\n\nOld.\n\n')
  assert.ok(changelogText(old, '1.2.3', '1.2.4', '2030-02-15').includes('## [1.2.3-rc.1] - 2029-12-01\n\nOld.\n'))
})
