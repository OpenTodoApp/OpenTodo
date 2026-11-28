// Repository checks for CI and release hygiene (OpenSpec change release-hygiene):
// the CI path filter, the patched Go toolchain shared by go.mod, CI and the
// Dockerfile, the root docker-compose.yml publishing on loopback by default, and
// migration numbering against the base branch (sync-convergence). The release
// gates (ci-release-gates): pinned actions and images, timeouts, publishing only
// after every gate, signed and attested artefacts, CI running `make check`.
// Contributor docs (contributor-docs-and-template-checks): every internal/ package
// and token scope named in docs/contributing/packages.md (the long form of AGENTS.md) and docs/architecture.md.
// Run: node --test scripts/repo-checks.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { checkSurfaceFreeze, surfaceProblems, SURFACE_FILE } from './release/surfaceFreeze.mjs'
import { MATRIX_APPS, matrixProblems, parseMatrix, staleRows, checkMatrixFreshness } from './release/switchMatrix.mjs'
import { readFragments, unreleasedProblems } from './release/fragments.mjs'
import { gateProblems, latestRelease, tableProblems, verificationProblems, VERIFICATION_TABLES } from './release/verificationTables.mjs'
import { finishedProblems, gitLastTouched, openChanges, staleWarnings, taskCounts } from './openspec-hygiene.mjs'
import { unguardedHover } from './css-hover.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')
const workflowFiles = () => readdirSync(path.join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`)

function changes(files) {
  const out = execFileSync('sh', [path.join(root, 'scripts/ci-changes.sh')], { input: files.join('\n') + '\n', encoding: 'utf8' })
  return Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')))
}

// path(s) → expected outputs of scripts/ci-changes.sh
const table = [
  [['internal/sync/ops.go'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['web/src/app/App.tsx'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['go.sum'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['Dockerfile'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['.github/workflows/ci.yml'], { code: 'true', docs: 'false', mobile: 'true', ios: 'true' }],
  [['skills/opentodo-cli/SKILL.md'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['skills/skills.go'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['deploy/coolify/opentodo.yaml'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/deploy/casaos.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/deploy-check.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/release/prepare.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/ci-changes.sh'], { code: 'true', docs: 'false', mobile: 'true', ios: 'true' }],
  [['scripts/repo-checks.test.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['docker-compose.yml'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/coolify-template-check.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/e2e-views.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/e2e-offline.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['.github/dependabot.yml'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['.dockerignore'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['templates/trip-planning/template.yaml'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['scripts/templates-check.mjs'], { code: 'true', docs: 'false', mobile: 'false' }],
  [['docs/self-hosting/docker.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['changelog.d/Added/urgency-sort.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['README.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['CHANGELOG.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['openspec/changes/x/proposal.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['docs/api.md', 'changelog.d/Added/urgency-sort.md'], { code: 'false', docs: 'true', mobile: 'false' }],
  [['docs/api.md', 'internal/httpapi/router.go'], { code: 'true', docs: 'true', mobile: 'false' }],
  [['skill/README.md'], { code: 'false', docs: 'false', mobile: 'false' }],
  [['LICENSE'], { code: 'false', docs: 'false', mobile: 'false' }],
  [['mobile/android/app/src/main/java/app/opentodo/Bridge.kt'], { code: 'false', docs: 'false', mobile: 'true', ios: 'false' }],
  [['mobile/README.md', 'mobile/android/app/build.gradle.kts'], { code: 'false', docs: 'false', mobile: 'true', ios: 'false' }],
  [['mobile/android/store/permissions.txt', 'internal/httpapi/router.go'], { code: 'true', docs: 'false', mobile: 'true' }],
  [['fastlane/metadata/android/en-US/full_description.txt'], { code: 'false', docs: 'false', mobile: 'true', ios: 'false' }],
  [['mobile/ios/OpenTodo/Bridge.swift'], { code: 'false', docs: 'false', mobile: 'false', ios: 'true' }],
  [['scripts/release/ios-testflight.sh'], { code: 'true', docs: 'false', mobile: 'false', ios: 'true' }],
  [['mobile/ios/project.yml', 'mobile/android/app/build.gradle.kts'], { code: 'false', docs: 'false', mobile: 'true', ios: 'true' }],
  [['mobile/README.md'], { code: 'false', docs: 'false', mobile: 'false', ios: 'false' }],
]

// The tier outputs (ci-speed): which pull request jobs a change runs.
const tiers = [
  [['web/src/app/App.tsx'], { ui: 'true', layout: 'true', extension: 'false', skill: 'false' }],
  [['web/src/ui/Button.stories.tsx'], { ui: 'true', layout: 'true' }],
  [['web/src/lib/sync.ts'], { ui: 'true', layout: 'true' }],
  [['web/vitest.contract.config.ts'], { ui: 'false', layout: 'true' }],
  [['internal/sync/ops.go'], { ui: 'false', layout: 'true', extension: 'false', skill: 'false' }],
  [['internal/store/migrations/0099_x.sql'], { ui: 'false', layout: 'true' }],
  [['scripts/ui-check/a11y.mjs'], { ui: 'true', layout: 'false' }],
  [['scripts/e2e-smoke.mjs'], { ui: 'false', layout: 'true' }],
  [['deploy/coolify/opentodo.yaml'], { ui: 'false', layout: 'false', extension: 'false', skill: 'false' }],
  [['extension/popup.js'], { ui: 'false', layout: 'false', extension: 'true', skill: 'false', obsidian: 'false' }],
  [['obsidian/src/main.ts'], { code: 'false', ui: 'false', layout: 'false', extension: 'false', obsidian: 'true' }],
  [['web/src/lib/nlp/parse.ts'], { obsidian: 'true' }],
  [['web/src/lib/e2eeEnvelope.ts'], { obsidian: 'true' }],
  [['internal/vault/testdata/lines.vectors.json'], { obsidian: 'true' }],
  [['web/src/app/App.tsx'], { obsidian: 'false' }],
  [['skills/opentodo-cli/SKILL.md'], { ui: 'false', layout: 'false', extension: 'false', skill: 'true' }],
  [['docs/api.md'], { code: 'false', docs: 'true', ui: 'false', layout: 'false', extension: 'false', skill: 'false' }],
  [['openspec/changes/x/proposal.md'], { code: 'false', docs: 'true', ui: 'false', layout: 'false' }],
  [['changelog.d/Fixed/x.md'], { code: 'false', docs: 'true', ui: 'false', layout: 'false' }],
  [['.github/workflows/ci.yml'], { ui: 'true', layout: 'true', a11y: 'true', extension: 'true', obsidian: 'true', skill: 'true', mobile: 'true', ios: 'true' }],
  // The accessibility gate on real screens (accessibility-aa D1): the web app and the audit scripts only.
  [['web/src/app/Shell.tsx'], { a11y: 'true' }],
  [['scripts/ux-audit/tour.mjs'], { a11y: 'true', ui: 'false' }],
  [['internal/sync/ops.go'], { a11y: 'false' }],
  [['docs/api.md'], { a11y: 'false' }],
]

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]))
for (const [files, want] of [...table, ...tiers]) {
  test(`ci-changes: ${files.join(' + ')} → ${Object.keys(want).join(',')}`, () => {
    assert.deepEqual(pick(changes(files), Object.keys(want)), want)
  })
}

test('go.mod pins a patched toolchain that the Dockerfile and every setup-go step use', () => {
  const toolchain = read('go.mod').match(/^toolchain go(\d+\.\d+\.\d+)$/m)
  assert.ok(toolchain, 'go.mod must have a `toolchain go1.N.P` line')
  const docker = read('Dockerfile').match(/^FROM .*\bgolang:(\d+\.\d+\.\d+)-alpine@sha256:/m)
  assert.equal(docker?.[1], toolchain[1], 'the Dockerfile golang image must name the go.mod toolchain')
  const ci = read('.github/workflows/ci.yml')
  for (const f of workflowFiles()) {
    const steps = read(f).split(/\n\s*- uses: actions\/setup-go@/).slice(1)
    for (const s of steps) assert.match(s, /^\S+(?: # v[\d.]+)?\n\s+with:\n\s+go-version-file: go\.mod\n/, `${f}: setup-go must read go.mod`)
  }
  assert.ok(ci.includes('actions/setup-go@'))
  assert.match(ci, /go run golang\.org\/x\/vuln\/cmd\/govulncheck@v\d+\.\d+\.\d+ \.\/\.\.\./, 'CI runs a pinned govulncheck')
})

test('the root docker-compose.yml publishes on every interface unless OPENTODO_BIND says otherwise', () => {
  const ports = read('docker-compose.yml').match(/^\s+ports:\n((?:\s+#.*\n)*)\s+- "([^"]+)"/m)
  assert.ok(ports)
  assert.equal(ports[2], '${OPENTODO_BIND:-0.0.0.0}:${OPENTODO_PORT:-8080}:8080')
  assert.match(ports[1], /OPENTODO_BIND=127\.0\.0\.1/, 'the comment explains the safer setting behind a proxy')
  assert.match(read('.env.example'), /^#? ?OPENTODO_BIND=/m)
})

test('SECURITY.md names the X-Forwarded-For hop the code uses (the nearest untrusted one)', () => {
  const s = read('SECURITY.md')
  assert.doesNotMatch(s, /first `X-Forwarded-For`/)
  assert.match(s, /nearest untrusted `X-Forwarded-For` hop/)
  assert.match(s, /OPENTODO_TRUSTED_PROXIES/)
})

// Schema migrations (OpenSpec change sync-convergence): the store runs only
// files numbered above the database's version, so a file added on a branch with
// a number at or below one already on main would never run on an upgraded
// server. (Duplicate numbers are refused by internal/store's tests.)
const migrationsDir = 'internal/store/migrations'
const migrationNumber = (name) => Number.parseInt(name.split('_')[0], 10)

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

test('migrations added on a branch are numbered above every migration on the base branch', (t) => {
  const base = process.env.MIGRATIONS_BASE || 'origin/main'
  try {
    git('rev-parse', '--verify', '--quiet', `${base}^{commit}`)
  } catch {
    t.skip(`${base} is not available (shallow clone)`)
    return
  }
  const onBase = git('ls-tree', '--name-only', base, `${migrationsDir}/`).split('\n').filter((p) => p.endsWith('.sql'))
  const highest = Math.max(0, ...onBase.map((p) => migrationNumber(path.basename(p))))
  const added = git('diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', `${migrationsDir}/`)
    .split('\n').filter((p) => p.endsWith('.sql'))
  for (const p of added) {
    const v = migrationNumber(path.basename(p))
    assert.ok(v > highest, `${p} must be numbered above ${highest}, the highest migration on ${base}: renumber it`)
  }
})

// ---- Release gates (OpenSpec change ci-release-gates) ------------------------------------------

/** The jobs of a workflow: id → the job's indented block (a line-based reader for our own files). */
function jobsOf(text) {
  const lines = text.split('\n')
  const out = {}
  let cur = null
  for (const l of lines.slice(lines.indexOf('jobs:') + 1)) {
    const m = l.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (m) { cur = m[1]; out[cur] = ''; continue }
    if (/^\S/.test(l)) break
    if (cur) out[cur] += l + '\n'
  }
  return out
}
const needsOf = (block) => {
  const v = block.match(/^ {4}needs: (.+)$/m)?.[1].trim()
  if (!v) return []
  return v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()) : [v]
}
const makePrereqs = (target) => {
  const m = read('Makefile').match(new RegExp(`^${target}:(.*)$`, 'm'))
  assert.ok(m, `Makefile has a ${target} target`)
  return m[1].trim().split(/\s+/).filter(Boolean)
}

test('every action is pinned to a full commit SHA with its release in a comment', () => {
  for (const f of workflowFiles()) {
    for (const [, ref, rest] of read(f).matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)) {
      if (ref.startsWith('./')) continue
      assert.match(ref, /^[\w.-]+\/[\w.\/-]+@[0-9a-f]{40}$/, `${f}: ${ref} must be pinned to a commit SHA`)
      assert.match(rest, /^ # v\d+\.\d+\.\d+$/, `${f}: ${ref} needs a "# vX.Y.Z" comment naming the release`)
    }
  }
})

// Supply chain (2026-10 audit, wave 2): an expression pasted into a script is
// shell code when it expands to attacker-chosen text (a branch name, a PR
// title), so run steps read such values from env: instead.
test('no ${{ }} expression inside a run step', () => {
  for (const f of workflowFiles()) {
    const lines = read(f).split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(- )?run:\s*(.*)$/)
      if (!m) continue
      const indent = m[1].length + (m[2] ? 2 : 0)
      const block = [[i, m[3]]]
      if (/^[|>]-?$/.test(m[3].trim())) {
        for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].length - lines[j].trimStart().length > indent); j++) block.push([j, lines[j]])
      }
      for (const [n, text] of block) assert.ok(!text.includes('${{'), `${f}:${n + 1}: move the expression into env: (${text.trim()})`)
    }
  }
})

test('Dependabot waits a cooldown before proposing a release', () => {
  const entries = read('.github/dependabot.yml').split(/\n(?=  - package-ecosystem: )/).slice(1)
  assert.ok(entries.length >= 5)
  for (const e of entries) {
    const eco = e.match(/package-ecosystem: (\S+)/)[1]
    assert.match(e, /\n {4}cooldown:\n {6}default-days: ([7-9]|[1-9]\d)\n/, `${eco}: cooldown of at least 7 days`)
  }
})

test('CodeQL (Go and TypeScript) and a pinned gosec run on every pull request', () => {
  const sec = read('.github/workflows/security.yml')
  assert.match(sec, /^ {2}pull_request:/m)
  assert.match(sec, /language: go\n/)
  assert.match(sec, /language: javascript-typescript\n/)
  assert.match(sec, /run: make gosec-sarif/)
  assert.match(read('Makefile'), /^GOSEC_VERSION := v\d+\.\d+\.\d+$/m, 'gosec runs at one exact version')
  assert.match(read('web/.npmrc'), /^min-release-age=\d+$/m, 'npm installs only releases older than a few days')
})

test('every workflow has a concurrency group and every job a timeout', () => {
  for (const f of workflowFiles()) {
    const text = read(f)
    assert.match(text, /^concurrency:\n {2}group: /m, `${f}: concurrency group`)
    for (const [id, block] of Object.entries(jobsOf(text))) {
      // A job that calls a workflow of this repository takes no timeout of its own
      // (GitHub refuses one): the called workflow's jobs carry theirs, checked here too.
      if (/^ {4}uses: \.\/\.github\/workflows\/[\w-]+\.yml$/m.test(block)) continue
      assert.match(block, /^ {4}timeout-minutes: \d+$/m, `${f}: job ${id} needs timeout-minutes`)
    }
  }
  // Pull requests and pushes to main cancel superseded runs; tags, the nightly and a run by hand never do.
  const ci = read('.github/workflows/ci.yml')
  assert.match(ci, /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}/, 'the nightly never shares a group with a push')
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| \(github\.event_name == 'push' && !startsWith\(github\.ref, 'refs\/tags\/'\)\) \}\}/)
})

test('base and job images are pinned by digest', () => {
  const dockerfile = read('Dockerfile')
  const stages = [...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((m) => m[1])
  for (const [, from] of dockerfile.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)) {
    // scratch is the empty image, nothing to pin (the web-dist stage, signed-web-app D4).
    if (stages.includes(from) || from === 'scratch') continue
    assert.match(from, /^[\w.\/-]+:[\w.-]+@sha256:[0-9a-f]{64}$/, `Dockerfile: ${from} must be tag@sha256:digest`)
  }
  const pinned = read('Makefile').match(/^PLAYWRIGHT_IMAGE := (.+)$/m)?.[1].replace('$(PLAYWRIGHT_VERSION)', read('Makefile').match(/^PLAYWRIGHT_VERSION := (\S+)$/m)[1])
  assert.match(pinned ?? '', /@sha256:[0-9a-f]{64}$/, 'Makefile PLAYWRIGHT_IMAGE is pinned by digest')
  for (const f of workflowFiles()) {
    for (const [, image] of read(f).matchAll(/^\s+container: (\S+)$/gm)) {
      assert.match(image, /@sha256:[0-9a-f]{64}$/, `${f}: container ${image} must be pinned by digest`)
      assert.equal(image, pinned, `${f}: container image matches the Makefile's PLAYWRIGHT_IMAGE (same baselines)`)
    }
  }
})

// The runner's apt mirror sometimes serves a job at a few kB/s, so no job installs
// browsers or their system packages: every job that uses Playwright runs in the pinned
// Playwright image, and every Playwright package is the Makefile's PLAYWRIGHT_VERSION.
test('Playwright jobs run in the pinned image at one version', () => {
  const version = read('Makefile').match(/^PLAYWRIGHT_VERSION := (\S+)$/m)?.[1]
  assert.ok(version, 'Makefile sets PLAYWRIGHT_VERSION')
  const files = [...workflowFiles(), 'Makefile', 'scripts/README.md', 'docs/design-system.md']
  for (const f of files) {
    for (const [, v] of read(f).matchAll(/playwright(?:\/test)?@(\d[\w.-]*)/g)) {
      assert.equal(v, version, `${f}: Playwright ${v} must be the Makefile's PLAYWRIGHT_VERSION`)
    }
  }
  for (const f of workflowFiles()) {
    for (const [id, block] of Object.entries(jobsOf(read(f)))) {
      assert.doesNotMatch(block, /playwright install|--with-deps/, `${f}: job ${id} must not install browsers or apt packages`)
      if (/playwright(?:\/test)?@/.test(block)) {
        assert.match(block, /^ {4}container: mcr\.microsoft\.com\/playwright:/m, `${f}: job ${id} uses Playwright, so it runs in the pinned Playwright image`)
      }
    }
  }
})

// CI capacity (ci-pr-fast-tier): the merge queue and a push to main run the path tier for
// what they change; release tags, the nightly schedule and a run by hand run every job and
// matrix leg; a pull request skips the browser, workbench, accessibility, phone, binary and
// site bundle jobs, which the merge queue runs before the change lands.
test('the full matrix runs on tags, nightly and by hand; pull requests run the fast tier', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.match(ci, /^ {2}schedule:\n {4}- cron: "[^"]+"$/m, 'a nightly full run')
  assert.match(ci, /^ {2}workflow_dispatch:$/m, 'a full run by hand')
  assert.match(ci, /^ {2}merge_group:$/m, 'the merge queue runs CI')
  assert.match(ci, /types: \[opened, synchronize, reopened\]/, 'drafts and ready pull requests run the same tier, so marking one ready starts no run')
  const jobs = jobsOf(ci)
  assert.match(jobs.changes, /full: \$\{\{ steps\.filter\.outputs\.full \}\}/)
  assert.match(jobs.changes, /git diff --name-only "\$BEFORE" HEAD > changed\.txt\n\s+cat changed\.txt\n\s+\.\/scripts\/ci-changes\.sh < changed\.txt \| sed -E 's\/\^\(ui\|layout\|a11y\|mobile\|ios\)=true\$\/\\1=false\/' >> "\$GITHUB_OUTPUT"/, 'a push to main is compared with the commit before and skips the heavy jobs the queue ran (ci-pr-fast-tier)')
  assert.match(jobs.changes, /git diff --name-only "\$QUEUE_BASE" HEAD > changed\.txt\n\s+cat changed\.txt\n\s+\.\/scripts\/ci-changes\.sh < changed\.txt >> "\$GITHUB_OUTPUT"/, 'the merge queue runs the whole path tier')
  assert.match(jobs.changes, /git diff --name-only "\$BASE"\.\.\.HEAD > changed\.txt\n\s+cat changed\.txt\n(\s+#.*\n)*\s+\.\/scripts\/ci-changes\.sh < changed\.txt \| sed -E 's\/\^\(ui\|layout\|a11y\|mobile\|ios\)=true\$\/\\1=false\/' >> "\$GITHUB_OUTPUT"\n\n/, 'every pull request turns the heavy jobs off, with no condition around it')
  assert.doesNotMatch(jobs.changes, /DRAFT/, 'a draft is no longer a tier of its own')
  for (const id of ['layout', 'cli']) assert.match(jobs[id], /fromJSON\(needs\.changes\.outputs\.full != 'true' && /, `${id} runs its full matrix only when full`)
  assert.doesNotMatch(ci, /fromJSON\(github\.event_name == 'pull_request'/, 'no matrix keys off the event alone')
  // ci-pr-shorter-chain: the binaries and the site bundle only lengthen a pull request's chain.
  for (const id of ['cli', 'site-bundle']) assert.match(jobs[id], /^ {4}if: \$\{\{ !cancelled\(\) && (!failure\(\) && )?github\.event_name != 'pull_request' && /m, `${id} runs in the merge queue, not on pull requests`)
  for (const id of ['cli', 'site-bundle']) assert.doesNotMatch(jobs[id].match(/^ {4}if: .*$/m)[0], /merge_group|github\.event_name == /, `${id} is skipped on no other event`)
})

test('the image, stable tag and release are published only after every gate', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  // claude-plugin publishes the Claude Code marketplace after the release (claude-plugin D5).
  // play uploads the Android bundle to Google Play's internal track after the release (play-production D2).
  // obsidian-plugin publishes the Obsidian plugin's release repository after the release (obsidian-plugin D1).
  // ios-testflight uploads the iPhone app to TestFlight after the release (ios-distribution D5).
  const publishing = ['docker', 'release', 'claude-plugin', 'play', 'obsidian-plugin', 'ios-testflight']
  for (const p of publishing) assert.ok(jobs[p], `ci.yml has a ${p} job`)
  assert.deepEqual(needsOf(jobs['claude-plugin']), ['release'], 'the plugin is published only after the release')
  assert.deepEqual(needsOf(jobs.play), ['release'], 'the Play upload runs only after the release')
  assert.deepEqual(needsOf(jobs['obsidian-plugin']), ['release'], 'the Obsidian plugin is published only after the release')
  assert.deepEqual(needsOf(jobs['ios-testflight']), ['release'], 'the TestFlight upload runs only after the release')
  assert.match(jobs['ios-testflight'], /^ {4}secrets: inherit$/m, 'the called TestFlight workflow gets the release secrets')
  const gates = Object.keys(jobs).filter((j) => !publishing.includes(j))
  for (const g of gates) {
    assert.ok(needsOf(jobs.docker).includes(g), `the docker (publish) job must need ${g}`)
    assert.ok(needsOf(jobs.release).includes(g), `the release job must need ${g}`)
  }
  assert.ok(needsOf(jobs.release).includes('docker'), 'the release waits for the image')
  // Pull requests never publish; a gate skipped by the pull request tier never blocks
  // publishing, a failed or cancelled one always does (ci-speed).
  assert.match(jobs.docker, /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && github\.event_name == 'push' \}\}$/m, 'only a push (main or a tag) publishes, and a failed gate stops publishing')
  assert.match(jobs.release, /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && startsWith\(github\.ref, 'refs\/tags\/v'\) \}\}$/m, 'a failed gate stops the release')
  assert.match(jobs.docker, /type=raw,value=stable,/, 'stable moves only in the gated publish job')
})

test('the image under test is the one built in the run, scanned and smoke-tested', () => {
  const ci = read('.github/workflows/ci.yml')
  const jobs = jobsOf(ci)
  assert.match(jobs.image, /^ {10}load: true$/m, 'the image job loads the built image into Docker')
  assert.match(jobs.image, /^ {10}push: false$/m)
  assert.match(jobs.image, /anchore\/scan-action@[0-9a-f]{40}/, 'the image job scans the image')
  assert.match(jobs.image, /^ {10}severity-cutoff: critical$/m, 'scan fails on critical')
  assert.match(jobs.image, /^ {10}fail-build: true$/m)
  assert.match(jobs.image, /^ {10}only-fixed: true$/m, 'scan counts findings with a fix')
  assert.match(jobs.image, /coolify-template-check\.mjs --smoke --image opentodo:ci/, 'smoke test runs the built image')
  for (const f of workflowFiles()) {
    for (const [line] of read(f).matchAll(/^.*--smoke\b.*$/gm)) {
      assert.match(line, /--image /, `${f}: a smoke test must name the image under test, not the published one`)
    }
  }
})

test('published artefacts are signed and attested, with OIDC only where needed', () => {
  const ci = read('.github/workflows/ci.yml')
  const jobs = jobsOf(ci)
  assert.match(jobs.docker, /^ {10}provenance: mode=max$/m)
  assert.match(jobs.docker, /^ {10}sbom: true$/m)
  assert.match(jobs.docker, /sigstore\/cosign-installer@/)
  assert.match(jobs.docker, /cosign sign --yes "\$\{image\}@\$\{DIGEST\}"/, 'the pushed digest is signed')
  assert.match(jobs.release, /actions\/attest-build-provenance@/)
  assert.match(jobs.release, /^ {6}attestations: write$/m)
  for (const f of workflowFiles()) {
    const text = read(f)
    const top = text.slice(0, text.indexOf('\njobs:'))
    assert.doesNotMatch(top, /id-token|attestations/, `${f}: OIDC and attestation permissions belong on the jobs that need them`)
    for (const [id, block] of Object.entries(jobsOf(text))) {
      if (/id-token: write/.test(block)) assert.ok(f.endsWith('ci.yml') && ['docker', 'release'].includes(id), `${f}: ${id} must not ask for id-token`)
    }
  }
})

// What `make check` runs outside `make ci-checks`, and the CI step that runs it instead.
const checkElsewhere = {
  lint: ['go vet ./...', 'npm run typecheck'],
  test: ['go test ./...', 'npm test', 'make extension', 'make obsidian'],
  'docs-check': ['npm run docs:check'],
  staticcheck: ['make staticcheck'],
  deadcode: ['make staticcheck'],
  'web-lint': ['npm run lint'],
}

test('CI runs every part of make check', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.match(jobsOf(ci).checks ?? '', /run: make ci-checks$/m, 'the checks job runs make ci-checks')
  const ciChecks = makePrereqs('ci-checks')
  for (const t of makePrereqs('check')) {
    if (ciChecks.includes(t)) continue
    assert.ok(checkElsewhere[t], `make check runs ${t}: add it to ci-checks (or to checkElsewhere with the CI step that runs it)`)
    for (const step of checkElsewhere[t]) assert.ok(ci.includes(step), `CI runs ${step} (for make ${t})`)
  }
  for (const t of ciChecks) assert.ok(makePrereqs('check').includes(t), `ci-checks runs ${t}, which make check must run too`)
  assert.ok(ciChecks.includes('fmt-check'), 'gofmt gate')
  assert.ok(makePrereqs('staticcheck').includes('deadcode'), 'make staticcheck runs deadcode, so the CI step runs it too')
  assert.match(read('Makefile'), /^fmt-check:\n\t.*gofmt -l /m)
})

test('the OpenSpec CLI runs at one exact version', () => {
  const version = read('Makefile').match(/^OPENSPEC_VERSION := (\d+\.\d+\.\d+)$/m)?.[1]
  assert.ok(version, 'Makefile pins OPENSPEC_VERSION to an exact version')
  for (const f of ['Makefile', 'AGENTS.md', 'CLAUDE.md', 'README.md', ...workflowFiles()]) {
    if (!existsSync(path.join(root, f))) continue
    for (const [use] of read(f).matchAll(/@fission-ai\/openspec(?:@\S+)?/g)) {
      assert.ok(use === '@fission-ai/openspec@$(OPENSPEC_VERSION)' || use === `@fission-ai/openspec@${version}`, `${f}: ${use} must be the pinned version`)
    }
  }
})

test('browser end-to-end checks run in CI and the race detector nightly', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  // CI's image has no make, so the layout job runs what `make e2e` runs.
  assert.match(jobs.layout, /^ {10}scripts\/e2e\.sh$/m, 'the layout job runs scripts/e2e.sh')
  assert.match(read('Makefile'), /^e2e: cli\n\tscripts\/e2e\.sh$/m, 'make e2e builds bin/ot and runs scripts/e2e.sh')
  assert.match(read('scripts/e2e.sh'), /e2e-smoke e2e-views e2e-offline/, 'scripts/e2e.sh runs the two-device, saved-view and offline-start scripts')
  // The built service worker and manifest tests run after the build, where they cannot skip.
  const ciJobs = jobsOf(read('.github/workflows/ci.yml'))
  const script = read('scripts/ci-web-build.sh')
  assert.ok(script.includes('npm run build') && script.indexOf('npm run test:built') > script.indexOf('npm run build'), 'the CI web build runs npm run test:built after npm run build')
  assert.ok(needsOf(ciJobs.server ?? '').includes('web-build'), 'the server job waits for web-build where it runs')
  assert.match(ciJobs['web-build'] ?? '', /run: \.\/scripts\/ci-web-build\.sh/, 'the web-build job runs the CI web build')
  // ci-pr-server-builds-web: on a pull request the server job builds the web app itself.
  assert.match(ciJobs['web-build'] ?? '', /^ {4}if: .*github\.event_name != 'pull_request'/m, 'web-build is skipped on pull requests')
  assert.match(ciJobs.server ?? '', /if: github\.event_name == 'pull_request'\n\s+run: \|\n\s+\(cd web && npm ci --no-audit --no-fund\)\n\s+\.\/scripts\/ci-web-build\.sh\n\s+rm -rf web\/node_modules\n/, 'on a pull request the server job runs the CI web build, then removes node_modules before the Go steps')
  assert.match(ciJobs.server ?? '', /if: github\.event_name != 'pull_request'\n\s+with:\n\s+name: web-dist/, 'elsewhere it downloads web-dist')
  assert.match(ciJobs.server ?? '', /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && needs\.web-build\.result != 'cancelled' && /m, 'the server job runs when web-build was skipped, not when it was cancelled')
  // The report-only interface audit runs nightly and on demand, off every critical path (ci-speed).
  const audit = read('.github/workflows/ux-audit.yml')
  assert.match(audit, /^ {2}schedule:\n {4}- cron: /m, 'the interface audit runs nightly')
  assert.match(audit, /^ {2}workflow_dispatch:$/m, 'the interface audit runs on demand')
  assert.match(audit, /run: node scripts\/ux-audit\/tour\.mjs$/m)
  assert.ok(!jobsOf(read('.github/workflows/ci.yml'))['ux-audit'], 'the push run does not wait for the interface audit')
  const nightly = read('.github/workflows/nightly.yml')
  assert.match(nightly, /^ {2}schedule:\n {4}- cron: /m)
  assert.match(nightly, /go test -race /)
  assert.match(nightly, /run: scripts\/fuzz\.sh /, 'the fuzz targets run nightly')
  // A red night opens or updates the ci-nightly issue; a green one closes it.
  const alert = jobsOf(nightly).alert ?? ''
  assert.match(alert, /^ {4}if: \$\{\{ always\(\) /m, 'the nightly alert runs whatever the other jobs did')
  assert.match(alert, /^ {6}issues: write$/m, 'the nightly alert may write issues')
  assert.match(alert, /run: \.\/scripts\/nightly-alert\.sh$/m)
  for (const id of Object.keys(jobsOf(nightly))) {
    if (id !== 'alert') assert.ok(needsOf(alert).includes(id), `the nightly alert must need ${id}`)
  }
  // A first attempt that failed only for want of a runner is retried once, not reported.
  assert.match(alert, /^ {6}actions: read$/m, 'the nightly alert reads the run\'s jobs')
  assert.match(alert, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/)
  const retry = read('.github/workflows/nightly-retry.yml')
  assert.match(retry, /^ {2}workflow_run:\n {4}workflows: \[Nightly\]\n {4}types: \[completed\]$/m)
  assert.match(retry, /github\.event\.workflow_run\.run_attempt == 1/, 'a second attempt is never retried')
  assert.match(retry, /^ {6}actions: write$/m)
  assert.match(retry, /scripts\/nightly-retry\.sh check "\$RUN_ID" 1; then\n\s+scripts\/nightly-retry\.sh rerun "\$RUN_ID"/, 'only a run without a real failure is re-run')
})

test('the sync client contract tests run against the built server', () => {
  const server = jobsOf(read('.github/workflows/ci.yml')).server ?? ''
  assert.ok(server.indexOf('run: npm run test:contract') > server.indexOf('-o bin/opentodo ./cmd/opentodo'), 'the server job runs npm run test:contract after building bin/opentodo')
})

test('Dependabot keeps every pinned ecosystem current', () => {
  const d = read('.github/dependabot.yml')
  for (const [eco, dir] of [['gomod', '/'], ['npm', '/web'], ['github-actions', '/'], ['docker', '/']]) {
    const entry = d.match(new RegExp(`- package-ecosystem: ${eco}\\n {4}directory: ${dir.replace('/', '\\/')}\\n((?: {4}.*\\n|\\s*\\n)*)`))
    assert.ok(entry, `dependabot.yml updates ${eco} in ${dir}`)
    assert.match(entry[1], /interval: weekly/, `${eco} weekly`)
    assert.match(entry[1], /groups:/, `${eco} grouped`)
  }
})

test('sensitive paths have a code owner and SECURITY.md names private reporting', () => {
  const owners = read('.github/CODEOWNERS')
  for (const p of ['/.github/', '/Dockerfile', '/internal/auth/', '/internal/httpapi/', '/internal/e2ee/', '/internal/store/migrations/']) {
    assert.match(owners, new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s+@pixari$`, 'm'), `CODEOWNERS covers ${p}`)
  }
  assert.match(read('SECURITY.md'), /https:\/\/github\.com\/OpenTodoApp\/OpenTodo\/security\/advisories\/new/)
})

/** Paths the .dockerignore excludes (the subset of its syntax we use: names, dir/, *.ext at the root, !negation). */
function dockerIgnored(file) {
  const rules = read('.dockerignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  let ignored = false
  for (const r of rules) {
    const neg = r.startsWith('!')
    const pat = (neg ? r.slice(1) : r).replace(/\/$/, '')
    const re = new RegExp('^' + pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '(?:/.*)?$')
    if (re.test(file)) ignored = !neg
  }
  return ignored
}

test('.dockerignore leaves out what the image does not need and keeps what the Dockerfile copies', () => {
  const copies = [...read('Dockerfile').matchAll(/^COPY (?!--from)(?:--\S+ )*(.+) \S+$/gm)].flatMap((m) => m[1].split(/\s+/))
  assert.ok(copies.length >= 4)
  for (const c of copies) {
    const p = c.replace(/\/$/, '')
    assert.ok(!dockerIgnored(p), `.dockerignore excludes ${p}, which the Dockerfile copies`)
  }
  for (const p of ['web/src/ui/__screenshots__/button-light.png', 'docs/screenshots/demo.gif', 'scripts/e2e-smoke.mjs', 'deploy/coolify/opentodo.yaml', 'web/node_modules/x']) {
    assert.ok(dockerIgnored(p), `.dockerignore should exclude ${p}`)
  }
  // Files inside copied folders that the web build needs stay in.
  for (const p of ['web/src/main.tsx', 'web/package-lock.json', 'internal/web/web.go', 'go.sum']) assert.ok(!dockerIgnored(p), `${p} stays in the build context`)
})

// ---- changelog fragments (changelog.d/README.md) ----

test('changelog: entries are fragments in changelog.d/<Section>/<name>.md, never written under Unreleased', () => {
  // Pull requests in parallel all edited the top of "## [Unreleased]" and conflicted on every
  // merge; each now adds its own file, which make release-prepare assembles.
  assert.deepEqual(readFragments(root).problems, [])
  assert.deepEqual(unreleasedProblems(read('CHANGELOG.md')), [])
  assert.deepEqual(unreleasedProblems('## [Unreleased]\n\nSee changelog.d/.\n\n## [1.0.0] - 2030-01-01\n\n### Fixed\n\n- Old.\n'), [])
  assert.match(unreleasedProblems('## [Unreleased]\n\n### Fixed\n\n- New.\n\n## [1.0.0] - 2030-01-01\n')[0], /2 line\(s\) under "## \[Unreleased\]".*changelog\.d\/<Section>\/<name>\.md/)
  assert.match(unreleasedProblems('## [Unreleased]\n- New.\n\n[Unreleased]: https://x/compare/v1.0.0...HEAD\n')[0], /1 line\(s\)/)
  // The in-app help is built, not committed: nothing may bring it back into the tree.
  assert.ok(read('.gitignore').split('\n').includes('/web/src/generated/help.json'))
  for (const s of ['build', 'dev', 'test', 'typecheck', 'storybook', 'build-storybook']) {
    assert.equal(JSON.parse(read('web/package.json')).scripts[`pre${s}`], 'npm run --silent help', `web: npm run ${s} builds the in-app help first`)
  }
})

// ---- contributor docs (OpenSpec change contributor-docs-and-template-checks) ----

/** Every Go package under internal/ (a directory holding .go files), as `internal/<path>`. */
function internalPackages(dir = 'internal') {
  const out = []
  const entries = readdirSync(path.join(root, dir), { withFileTypes: true })
  if (entries.some((e) => e.isFile() && e.name.endsWith('.go'))) out.push(dir)
  for (const e of entries) {
    if (e.isDirectory() && !['testdata', 'dist', 'node_modules'].includes(e.name)) out.push(...internalPackages(`${dir}/${e.name}`))
  }
  return out
}

// The package map is the long form of AGENTS.md (docs/contributing/packages.md).
test('the package map names every internal/ package', () => {
  const agents = read('docs/contributing/packages.md')
  const pkgs = internalPackages()
  assert.ok(pkgs.length > 30, `expected the internal/ packages, found ${pkgs.length}`)
  const missing = pkgs.filter((p) => !agents.includes('`' + p + '`'))
  assert.deepEqual(missing, [], 'add each package to "Where things are" in docs/contributing/packages.md as `internal/<path>` with what it does')
})

test('docs/architecture.md has a row for every internal/ package', () => {
  const arch = read('docs/architecture.md')
  const missing = []
  for (const p of internalPackages()) {
    const [, top, ...sub] = p.split('/')
    if (sub.length === 0 ? !arch.includes('| `' + top + '` |') : !arch.includes('`' + sub.join('/') + '`')) missing.push(p)
  }
  assert.deepEqual(missing, [], 'add a row (or, for a sub-package, a mention in its parent row) to "Server packages" in docs/architecture.md')
})

test('the rules in full list every API token scope and do not call the MCP server read-only', () => {
  const agents = read('docs/contributing/packages.md')
  const scopes = [...read('internal/auth/service.go').matchAll(/^\s*Scope[A-Z]\w*\s*=\s*"([a-z]+)"/gm)].map((m) => m[1])
  assert.ok(scopes.length >= 4, `expected the token scopes, found ${scopes.join(', ')}`)
  const listed = agents.match(/API tokens have a scope (`[a-z]+`(?:\|`[a-z]+`)*)/)
  assert.ok(listed, 'docs/contributing/packages.md names the token scopes as `a`|`b`|...')
  assert.deepEqual(listed[1].split('|').map((s) => s.slice(1, -1)).sort(), [...scopes].sort())
  assert.doesNotMatch(agents, /`internal\/mcp` read-only/, 'the MCP server has write tools (agent tokens)')
  assert.match(agents, /`internal\/mcp`[^;]*write tools/)
})

// Reproducible Android builds (OpenSpec change play-production D4): the toolchain is pinned and
// named in mobile/README.md. Returns what is not pinned; empty when everything is.
function androidToolchainProblems({ wrapper, rootGradle, appGradle, ci, readme }) {
  const problems = []
  const gradle = wrapper.match(/^distributionUrl=.*gradle-(\d+\.\d+(?:\.\d+)?)-bin\.zip$/m)?.[1]
  if (!gradle) problems.push('gradle-wrapper.properties: no Gradle version in distributionUrl')
  if (!/^distributionSha256Sum=[0-9a-f]{64}$/m.test(wrapper)) problems.push('gradle-wrapper.properties: no distributionSha256Sum')
  const agp = rootGradle.match(/id\("com\.android\.application"\) version "(\d+\.\d+\.\d+)"/)?.[1]
  if (!agp) problems.push('build.gradle.kts: the Android Gradle Plugin has no exact version')
  const tools = appGradle.match(/^\s*buildToolsVersion = "(\d+\.\d+\.\d+)"$/m)?.[1]
  if (!tools) problems.push('app/build.gradle.kts: no buildToolsVersion')
  const javas = [...ci.matchAll(/^\s+java-version: (\S+)$/gm)].map((m) => m[1])
  if (javas.length === 0 || javas.some((j) => !/^21\.\d+\.\d+\+\d+$/.test(j))) problems.push(`CI: setup-java must pin an exact JDK 21 (found ${javas.join(', ') || 'none'})`)
  if (new Set(javas).size > 1) problems.push(`CI: one JDK everywhere (found ${[...new Set(javas)].join(', ')})`)
  if (tools && !ci.includes(`build-tools;${tools}`)) problems.push(`CI: the SDK step installs another build-tools than ${tools}`)
  for (const [what, v] of [['Gradle', gradle], ['the Android Gradle Plugin', agp], ['build tools', tools], ['the JDK', javas[0]]]) {
    if (v && !readme.includes(v)) problems.push(`mobile/README.md does not name ${what} ${v}`)
  }
  return problems
}

const androidToolchain = () => ({
  wrapper: read('mobile/android/gradle/wrapper/gradle-wrapper.properties'),
  rootGradle: read('mobile/android/build.gradle.kts'),
  appGradle: read('mobile/android/app/build.gradle.kts'),
  ci: read('.github/workflows/ci.yml') + read('.github/workflows/android-repro.yml'),
  readme: read('mobile/README.md'),
})

test('the Android toolchain is pinned and named in mobile/README.md', () => {
  assert.deepEqual(androidToolchainProblems(androidToolchain()), [])
})

test('a Gradle wrapper without its checksum is refused', () => {
  const t = androidToolchain()
  const wrapper = t.wrapper.replace(/^distributionSha256Sum=.*\n/m, '')
  assert.deepEqual(androidToolchainProblems({ ...t, wrapper }), ['gradle-wrapper.properties: no distributionSha256Sum'])
  assert.match(androidToolchainProblems({ ...t, ci: t.ci.replace(/java-version: 21\.\S+/, 'java-version: 21') }).join('\n'), /exact JDK 21/)
})

test('the release APK carries no dependency block or commit file', () => {
  const app = read('mobile/android/app/build.gradle.kts')
  assert.match(app, /dependenciesInfo \{\s*includeInApk = false\s*includeInBundle = false\s*\}/)
  assert.match(app, /buildTypes \{\s*release \{[\s\S]*?vcsInfo\.include = false/)
})

test('release tags prove the Android build reproducible, and anyone can run it on demand', () => {
  const android = jobsOf(read('.github/workflows/ci.yml'))['android-sign']
  const step = android.split(/\n(?= {6}- )/).find((s) => s.includes('scripts/android-repro.sh'))
  assert.ok(step, 'the android-sign job runs scripts/android-repro.sh')
  assert.match(android, /^ {4}if: startsWith\(github\.ref, 'refs\/tags\/v'\)$/m, 'on every release tag')
  assert.match(step, /REPRO_CLEAN_CACHE: "1"/, 'the second build has no Gradle cache')
  assert.match(step, /--require-hashes -r scripts\/release\/requirements-repro\.txt/, 'apksigcopier pinned by hash')
  assert.ok(android.indexOf('scripts/android-repro.sh') > android.indexOf('Signed release APK and AAB'), 'after the signed build, before the upload')
  for (const l of read('scripts/release/requirements-repro.txt').split('\n').filter((l) => /^[a-z]/i.test(l))) assert.match(l, /^[\w.-]+==[\d.]+ \\$/, `${l}: an exact version with hashes`)
  const manual = read('.github/workflows/android-repro.yml')
  assert.match(manual, /^ {2}workflow_dispatch:\n {4}inputs:\n {6}ref:/m)
  assert.match(manual, /scripts\/android-repro\.sh "\$target"/)
  assert.match(read('scripts/android-repro.sh'), /apksigcopier compare "\$apk" --unsigned "\$first"/)
})

test('the Play AAB is the build without location, checked on every Android run (play-location-later)', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  const check = jobs.android.split(/\n(?= {6}- )/).find((s) => s.includes('Play AAB without location'))
  assert.ok(check, 'a step checks the two builds')
  assert.doesNotMatch(check, /^ {8}if:/m, 'on every run, not only tags')
  assert.match(check, /-Popentodo\.play=true :app:bundleRelease\n/)
  assert.match(check, /scripts\/android-store-check\.sh /)
  const signed = jobs['android-sign'].split(/\n(?= {6}- )/).find((s) => s.includes('Signed release APK and AAB'))
  assert.match(signed, /OPENTODO_VERSION="\$version" \.\/gradlew --no-daemon -Popentodo\.play=true :app:bundleRelease\n/, 'the release AAB is the Play build')
  assert.match(signed, /OPENTODO_VERSION="\$version" \.\/gradlew --no-daemon :app:assembleRelease\n/, 'the release APK is the plain build')
  assert.match(signed, /android-store-check\.sh "\.\.\/\.\.\/dist\/opentodo-android-\$version\.aab"/, 'the signed files are checked too')
  assert.doesNotMatch(read('scripts/android-repro.sh'), /opentodo\.play/, 'the reproducible APK never uses the Play property')
  assert.doesNotMatch(read('mobile/android/store/fdroid/app.opentodo.yml'), /opentodo\.play/)
  assert.match(read('mobile/android/app/src/play/AndroidManifest.xml'), /ACCESS_BACKGROUND_LOCATION" tools:node="remove"/)
})

// Signed web app (OpenSpec signed-web-app D4): one job signs, on release tags, in the
// protected environment whose required reviewer approves every signing; the
// binaries and the image embed what it signed.
test('only web-sign reads the web signing key, on release tags, in the web-signing environment', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  const sign = jobs['web-sign']
  assert.ok(sign, 'ci.yml has a web-sign job')
  assert.match(sign, /^ {4}if: startsWith\(github\.ref, 'refs\/tags\/v'\)$/m, 'release tags only')
  assert.match(sign, /^ {4}environment: web-signing$/m)
  assert.match(sign, /websign sign -version "\$GITHUB_REF_NAME"/, 'the version must match the tag')
  assert.match(sign, /::warning::WEB_SIGNING_KEY is not set/, 'without the secret the release stays unsigned and green')
  for (const f of workflowFiles()) {
    for (const [id, block] of Object.entries(jobsOf(read(f)))) {
      const uses = /environment: web-signing|secrets\.WEB_SIGNING_KEY/.test(block)
      if (uses) assert.ok(f.endsWith('ci.yml') && id === 'web-sign', `${f}: only the web-sign job uses the web-signing environment or its key (${id})`)
    }
  }
  for (const id of ['cli', 'image', 'docker']) {
    assert.ok(needsOf(jobs[id]).includes('web-sign'), `${id} waits for the signed web app`)
    assert.match(jobs[id], /web-dist-signed/, `${id} embeds the signed web app on release tags`)
  }
})

// Release keys (Android keystore, plugin deploy keys) are read only by the release-tag
// jobs that use them, in the `signing` environment the owner approves; moving `stable`
// by hand runs in the `promote` environment.
test('only the signing jobs read the release keys, on release tags, in the signing environment', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  const keys = { 'android-sign': /secrets\.ANDROID_KEYSTORE_BASE64/, 'claude-plugin': /secrets\.CLAUDE_PLUGIN_DEPLOY_KEY/, 'obsidian-plugin': /secrets\.OBSIDIAN_DEPLOY_KEY/ }
  for (const [id, key] of Object.entries(keys)) {
    assert.ok(jobs[id], `ci.yml has a ${id} job`)
    assert.match(jobs[id], key)
    assert.match(jobs[id], /^ {4}environment: signing$/m, `${id} runs in the signing environment`)
    assert.match(jobs[id], /^ {4}if: .*startsWith\(github\.ref, 'refs\/tags\/v'\)/m, `${id} runs on release tags only`)
  }
  for (const f of workflowFiles()) {
    for (const [id, block] of Object.entries(jobsOf(read(f)))) {
      if (/environment: signing|secrets\.(ANDROID_KEY|CLAUDE_PLUGIN_DEPLOY_KEY|OBSIDIAN_DEPLOY_KEY)/.test(block)) {
        assert.ok(f.endsWith('ci.yml') && id in keys, `${f}: only ${Object.keys(keys).join(', ')} use the signing environment or a release key (${id})`)
      }
    }
  }
  assert.ok(needsOf(jobs.release).includes('android-sign'), 'the release attaches the signed Android build')
  assert.match(jobsOf(read('.github/workflows/promote-stable.yml')).promote, /^ {4}environment: promote$/m, 'moving stable by hand waits for the owner')
})

test('the official web app keys are published, and the test key is never one of them', async () => {
  const { createHash, createPrivateKey, createPublicKey } = await import('node:crypto')
  const official = JSON.parse(read('internal/websign/release-keys.json'))
  assert.equal(typeof official.refuse, 'boolean')
  const security = read('SECURITY.md')
  const page = read('docs/security/signed-app.md')
  for (const k of official.keys) {
    const fp = createHash('sha256').update(Buffer.from(k.spki, 'base64')).digest('hex')
    assert.ok(security.includes(fp), `SECURITY.md publishes the ${k.role} key's fingerprint ${fp}`)
    assert.ok(page.includes(fp), `docs/security/signed-app.md publishes the ${k.role} key's fingerprint ${fp}`)
  }
  for (const test of ['test-key.pem', 'test-recovery-key.pem']) {
    const spki = createPublicKey(createPrivateKey(read(`internal/websign/testdata/${test}`))).export({ type: 'spki', format: 'der' }).toString('base64')
    assert.ok(!official.keys.some((k) => k.spki === spki), `${test} is a test key and never official`)
  }
})

test('the Play upload runs only for final tags, after the release, with its secrets in the release environment', () => {
  const play = jobsOf(read('.github/workflows/ci.yml')).play
  assert.match(play, /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && startsWith\(github\.ref, 'refs\/tags\/v'\) && !contains\(github\.ref_name, '-'\) \}\}$/m, 'final tags only')
  assert.match(play, /^ {4}environment: release$/m)
  assert.match(play, /node scripts\/release\/play-upload\.mjs "\$GITHUB_REF_NAME"/)
  assert.match(play, /::warning::PLAY_SERVICE_ACCOUNT_JSON is not set/)
  // Without an upload key the release-signed AAB goes up as it is; with one it is re-signed.
  assert.match(play, /if \[ -n "\$UPLOAD_KEYSTORE_BASE64" \]; then/)
  assert.doesNotMatch(play, /-z "\$UPLOAD_KEYSTORE_BASE64"/, 'a missing upload key no longer skips the upload')
  assert.doesNotMatch(play, /production/, 'CI never promotes to production')
  for (const f of workflowFiles()) {
    for (const [id, block] of Object.entries(jobsOf(read(f)))) {
      if (/secrets\.PLAY_/.test(block)) assert.ok(f.endsWith('ci.yml') && id === 'play', `${f}: only the play job reads the Play secrets`)
    }
  }
})

// The iPhone app's TestFlight upload (OpenSpec change ios-distribution D5, D9, D10): final tags after
// the release and by hand, the App Store Connect key only in the release environment, a registration
// job of its own, review submission for final tags only, and never any signing material in the repository.
test('the TestFlight upload runs for final tags after the release and by hand, with its secrets in the release environment', () => {
  const caller = jobsOf(read('.github/workflows/ci.yml'))['ios-testflight']
  assert.match(caller, /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && startsWith\(github\.ref, 'refs\/tags\/v'\) && !contains\(github\.ref_name, '-'\) \}\}$/m, 'final tags only')
  assert.match(caller, /^ {4}uses: \.\/\.github\/workflows\/ios-testflight\.yml$/m)
  const flow = read('.github/workflows/ios-testflight.yml')
  assert.match(flow, /^ {2}workflow_call:$/m)
  assert.match(flow, /^ {2}workflow_dispatch:$/m, 'the owner can upload any ref by hand')
  const job = jobsOf(flow)['ios-testflight']
  assert.match(job, /^ {4}environment: release$/m)
  assert.match(job, /::warning::APPLE_TEAM_ID, ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 is not set in the release environment: no TestFlight upload/)
  assert.match(job, /node scripts\/release\/appstore\.mjs register\n[\s\S]*ios-testflight\.sh archive /, 'the bundle IDs are registered before the archive')
  assert.match(job, /^ {8}id: upload$/m, 'the upload step has an id the cleanup reads')
  assert.match(job, /if: always\(\) && steps\.secrets\.outputs\.ready == 'true'\n[\s\S]*?UPLOADED: \$\{\{ steps\.upload\.outcome == 'success' \}\}\n[\s\S]*?if \[ "\$UPLOADED" != "true" \][^\n]*appstore\.mjs cleanup/, 'the keychain always goes; the certificate is revoked only when nothing was uploaded (ITMS-90035)')
  // App Store review (D10): a final tag's build only, after Apple processed it, never a release candidate; a hand run is a dry run unless chosen.
  assert.match(job, /appstore\.mjs processed[\s\S]*?name: Submit for App Store review[\s\S]*?set -- submit /, 'the submission waits for processing')
  const tools = job.match(/- name: Release scripts of this workflow's commit\n[\s\S]*?(?=\n {6}- |\n {6}# )/)?.[0] ?? ''
  assert.match(tools, /^ {10}ref: \$\{\{ github\.workflow_sha \}\}$/m, "the submission's scripts are pinned to the workflow's exact commit, never a branch name")
  assert.match(tools, /^ {10}sparse-checkout: scripts\/release$/m, 'only scripts/release is checked out from the workflow commit')
  assert.match(tools, /^ {10}path: release-tools$/m, 'the workflow copy sits beside the tag, never over it')
  assert.match(job, /node release-tools\/scripts\/release\/appstore\.mjs "\$@"/, "submit runs the workflow commit's appstore.mjs")
  assert.match(job, /set -- submit "\$VERSION" "\$BUILD" --changelog CHANGELOG\.md/, "What's New is the tag's own CHANGELOG.md")
  assert.equal((job.match(/release-tools\//g) ?? []).length, 1, 'every other step runs the tag')
  assert.match(job, /^ {8}if: steps\.secrets\.outputs\.ready == 'true' && !contains\(inputs\.ref, '-rc\.'\) && \(inputs\.app_store == 'submit' \|\| inputs\.app_store == 'dry-run' \|\| inputs\.app_store == 'submit-only'\)$/m, 'a release candidate is never submitted')
  assert.match(flow, /^ {6}app_store:\n {8}description:[^\n]*\n {8}type: choice\n {8}options: \[dry-run, submit, skip, submit-only\]\n {8}default: dry-run$/m, 'a run by hand is a dry run unless submit is chosen')
  assert.match(job, /id: upload\n {8}if: steps\.secrets\.outputs\.ready == 'true' && inputs\.app_store != 'submit-only'$/m, 'submit-only uploads nothing')
  assert.ok(job.indexOf('Release tag only') < job.indexOf('Submit for App Store review'), 'the tag check runs first')
  assert.doesNotMatch(flow, /betaAppReviewSubmissions/, 'CI never submits a TestFlight build to beta review')
  const register = jobsOf(read('.github/workflows/ios-register-ids.yml'))['ios-register-ids']
  assert.ok(register, 'ios-register-ids.yml has an ios-register-ids job')
  assert.match(read('.github/workflows/ios-register-ids.yml'), /^ {2}workflow_dispatch:$/m)
  assert.match(register, /^ {4}environment: release$/m)
  assert.match(register, /node scripts\/release\/appstore\.mjs register/)
  const ios = jobsOf(read('.github/workflows/ci.yml')).ios
  assert.match(ios, /make ios-archive/, 'the unsigned archive and its ad hoc signature are checked on every iOS change')
  for (const f of workflowFiles()) {
    for (const [id, block] of Object.entries(jobsOf(read(f)))) {
      if (/secrets\.(ASC_|APPLE_TEAM_ID)/.test(block)) {
        assert.ok(['ios-testflight', 'ios-register-ids'].includes(id) && /^ {4}environment: release$/m.test(block), `${f}: only the iOS release jobs read the App Store Connect secrets`)
      }
    }
  }
})

test('no signing key, certificate or profile is ever committed', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  const material = /\.(p8|p12|pfx|mobileprovision|provisionprofile|cer|certSigningRequest|keystore|jks)$/i
  assert.deepEqual(tracked.filter((f) => material.test(f)), [], 'key and certificate files never go into the repository')
  // A PEM block with real content (a header line followed by base64), in the places CI reads.
  const pem = /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)[A-Z ]*-----\r?\n[A-Za-z0-9+/=]{40,}/
  for (const f of tracked.filter((f) => /^(\.github|scripts|mobile)\//.test(f) && !/\.(png|jpg|webp|jar|apk|aab|zip)$/i.test(f))) {
    assert.doesNotMatch(read(f), pem, `${f} holds key or certificate material`)
  }
  const ignore = read('mobile/ios/.gitignore').split('\n')
  for (const p of ['*.p8', '*.p12', '*.mobileprovision', '*.cer']) assert.ok(ignore.includes(p), `mobile/ios/.gitignore ignores ${p}`)
})

test('the F-Droid metadata allows the release certificate that docs/android-app.md publishes', () => {
  const fdroid = read('mobile/android/store/fdroid/app.opentodo.yml')
  const cert = fdroid.match(/^AllowedAPKSigningKeys: ([0-9a-f]{64})$/m)?.[1]
  assert.ok(cert, 'AllowedAPKSigningKeys names one SHA-256')
  assert.ok(read('docs/android-app.md').includes(cert), 'docs/android-app.md publishes the same certificate')
  assert.match(fdroid, /^Binaries: \n {2}https:\/\/github\.com\/OpenTodoApp\/OpenTodo\/releases\/download\/v%v\/opentodo-android-%v\.apk$/m)
  // The version comes from the tag, so the bot reads it from this file at each tag, which only a
  // final release's prepare commit moves (release candidates never reach F-Droid).
  assert.match(fdroid, /^UpdateCheckMode: Tags$/m)
  assert.match(fdroid, /^UpdateCheckData: \n {2}mobile\/android\/store\/fdroid\/app\.opentodo\.yml\|CurrentVersionCode:\\s\*\(\\d\+\)\|\.\|CurrentVersion:\\s\*\(\[0-9\.\]\+\)$/m)
  assert.match(fdroid, /^AutoUpdateMode: Version$/m, "F-Droid's bot adds each final tag")
  assert.doesNotMatch(fdroid, /^ {4}sudo:/m, "the build server's default JDK, as in CI")
  // F-Droid takes the name, summary and description from fastlane/.
  // AutoName is the app's label, which F-Droid's checkupdates writes itself.
  assert.doesNotMatch(fdroid, /^(Name|Summary|Description):/m, 'the texts live in fastlane/metadata/android/')
  const builds = [...fdroid.matchAll(/^ {2}- versionName: (\S+)\n {4}versionCode: (\d+)\n {4}commit: (\S+)$/gm)]
  assert.equal(builds.length, 1, 'Builds keeps only the latest version')
  const [, name, code, commit] = builds[0]
  const [maj, min, patch] = name.split('.').map(Number)
  assert.equal(Number(code), maj * 10000 + min * 100 + patch, 'versionCode is major·10000 + minor·100 + patch')
  assert.ok(/^[0-9a-f]{40}$/.test(commit) || commit === `v${name}`, 'commit is a full hash or the tag of its version')
  assert.match(fdroid, new RegExp(`^CurrentVersion: ${name.replaceAll('.', '\\.')}\\nCurrentVersionCode: ${code}$`, 'm'))
})

// F-Droid's listing (fastlane/README.md): F-Droid reads fastlane/metadata/android/<locale>/ at the
// repository root of the built commit, within its limits; en-US is the fallback for the images.
const FASTLANE = 'fastlane/metadata/android'
const pngSize = (p) => { const b = readFileSync(path.join(root, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

test("F-Droid's Fastlane listing has the six languages within F-Droid's limits", () => {
  assert.deepEqual(readdirSync(path.join(root, FASTLANE)).sort(), ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'pt-PT'])
  for (const locale of readdirSync(path.join(root, FASTLANE))) {
    const text = (f) => read(`${FASTLANE}/${locale}/${f}`).trim()
    for (const [f, limit] of [['title.txt', 50], ['short_description.txt', 80], ['full_description.txt', 4000]]) {
      const t = text(f)
      assert.ok(t.length > 0 && [...t].length <= limit, `${locale}/${f}: 1 to ${limit} characters, has ${[...t].length}`)
    }
    assert.equal(text('title.txt'), 'OpenTodo', locale)
    assert.match(text('full_description.txt'), /OpenTodo/, `${locale}: the description says it needs an OpenTodo server`)
  }
  const images = `${FASTLANE}/en-US/images`
  assert.deepEqual(pngSize(`${images}/icon.png`), [512, 512])
  assert.deepEqual(pngSize(`${images}/featureGraphic.png`), [1024, 500])
  const shots = readdirSync(path.join(root, images, 'phoneScreenshots')).sort()
  assert.ok(shots.length >= 3 && shots.length <= 8, `3 to 8 phone screenshots, has ${shots.length}`)
  assert.deepEqual(shots, shots.map((_, i) => `${i + 1}.png`))
})

test("F-Droid's notes exist for the latest release's version code, within 500 characters", () => {
  const [maj, min, patch] = /^## \[(\d+)\.(\d+)\.(\d+)\]/m.exec(read('CHANGELOG.md')).slice(1).map(Number)
  const rel = `${FASTLANE}/en-US/changelogs/${maj * 10000 + min * 100 + patch}.txt`
  assert.ok(existsSync(path.join(root, rel)), `${rel} is missing: write what changed for the Android app (RELEASING.md)`)
  for (const f of readdirSync(path.join(root, FASTLANE, 'en-US/changelogs'))) {
    const t = read(`${FASTLANE}/en-US/changelogs/${f}`).trim()
    assert.ok(/^\d+\.txt$/.test(f) && t.length > 0 && [...t].length <= 500, `changelogs/${f}: 1 to 500 characters`)
  }
})

// The migration matrix (migration-everywhere D6): every listed competitor has a
// row, an importer format, a guide with export steps and a real-export fixture
// with a golden; the Import screen's picker lists the same apps and formats.
test('every competitor in the migration matrix has a verified path', () => {
  assert.deepEqual(matrixProblems(root), [])
  const rows = parseMatrix(read('docs/switch/README.md'))
  assert.deepEqual(rows.map((r) => r.guide).sort(), [...MATRIX_APPS].sort())
  const picker = [...read('web/src/lib/switchApps.ts').matchAll(/\{ guide: '([a-z0-9-]+)', name: '[^']+', format: '([a-z0-9-]+)'/g)].map((m) => `${m[1]} ${m[2]}`)
  assert.deepEqual(picker.sort(), rows.map((r) => `${r.guide} ${r.format}`).sort())
})

test('the matrix check fails on a missing fixture, guide section or row', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'matrix-'))
  try {
    for (const p of ['docs/switch', 'internal/importer']) cpSync(path.join(root, p), path.join(tmp, p), { recursive: true, filter: (src) => !src.includes('sanitize') })
    rmSync(path.join(tmp, 'internal/importer/testdata/tududi-db'), { recursive: true })
    assert.deepEqual(matrixProblems(tmp), ['Tududi: no fixture with a golden preview in internal/importer/testdata/tududi-db/'])
    const guide = path.join(tmp, 'docs/switch/vikunja.md')
    writeFileSync(guide, readFileSync(guide, 'utf8').replace('## Export from Vikunja', '## Getting the file'))
    const readme = path.join(tmp, 'docs/switch/README.md')
    writeFileSync(readme, readFileSync(readme, 'utf8').split('\n').filter((l) => !l.startsWith('| [Linear]')).join('\n'))
    const problems = matrixProblems(tmp)
    assert.ok(problems.includes('Vikunja: docs/switch/vikunja.md has no "## Export from …" section'), problems.join('\n'))
    assert.ok(problems.includes('linear: no row in docs/switch/README.md'), problems.join('\n'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('release preparation for 1.0 and later refuses a row checked more than 120 days before', () => {
  const text = '| [OmniFocus](omnifocus.md) | `omnifocus-csv` | a | b | 2026-04-01, OmniFocus 4 |\n| [Tududi](tududi.md) | `tududi-db` | a | b | 2026-11-03, Tududi 1.14 |\n'
  assert.deepEqual(staleRows(text, '2026-10-18').map((r) => r.name), ['OmniFocus'])
  assert.deepEqual(staleRows(text, '2026-07-29').map((r) => r.name), [])
  const tmp = mkdtempSync(path.join(tmpdir(), 'matrix-'))
  try {
    mkdirSync(path.join(tmp, 'docs/switch'), { recursive: true })
    writeFileSync(path.join(tmp, 'docs/switch/README.md'), text)
    assert.throws(() => checkMatrixFreshness(tmp, '1.0.0', '2026-10-18'), /OmniFocus \(2026-04-01\)/)
    assert.doesNotThrow(() => checkMatrixFreshness(tmp, '0.22.0', '2026-10-18'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ---- The real-client verification tables (OpenSpec change caldav-verified, design D3) ---------

// Every tree: both tables whole (no blank cell, a date on every "not verified",
// a version or date on every row with a result). The release gate (no "not
// verified" outside Mitra from 1.0 on) holds the tree once the change's runs are
// done and it is archived; while it is open, the cells still to run are listed.
test('the CalDAV and calendar sync verification tables are whole, and gated once caldav-verified is done', (t) => {
  const { shape, gate } = verificationProblems(root, latestRelease(root))
  assert.deepEqual(shape, [], 'docs/caldav-verification.md says what a cell holds')
  if (existsSync(path.join(root, 'openspec/changes/caldav-verified'))) {
    t.diagnostic(`caldav-verified is open: ${gate.length} cells still to run on real clients and servers`)
    return
  }
  assert.deepEqual(gate, [], 'run docs/caldav-verification.md for each cell, or say "not supported by <client>" with the reason')
})

const sampleTable = (rows) => '# Guide\n\n| Client | Due forms | Alarms |\n| --- | --- | --- |\n' + rows.join('\n') + '\n\nAfter the table.\n'
const caldavSpec = VERIFICATION_TABLES[0]

test('the verification table check passes a whole table and gates it from 1.0', () => {
  const pass = sampleTable([
    '| Thunderbird 158.0.1 (Linux, 2026-10-22) | works | works both ways |',
    '| DAVx⁵ 4.5 + jtx Board 2.9 (2026-11-20) | works | not supported by jtx Board: no alarms on tasks |',
    '| Apple Reminders 18.1 (iOS, 2026-11-21) | defect #1300 | works |',
    '| Mitra | not verified (2026-11-21) | not verified (2026-11-21) |',
  ])
  assert.deepEqual(tableProblems(pass, caldavSpec), [])
  assert.deepEqual(gateProblems(pass, caldavSpec, '1.0.0'), [], 'Mitra is exempt, unsupported and defect cells are results')
})

test('the verification table check fails a blank cell, a row without a version and an unverified gated cell', () => {
  const fail = sampleTable([
    '| Thunderbird | works |  |',
    '| DAVx⁵ + Tasks.org | not verified (2026-10-21) | not verified |',
    '| Apple Reminders (iOS) | not verified (2026-10-21) | not verified (2026-10-21) |',
  ])
  assert.deepEqual(tableProblems(fail, caldavSpec), [
    'docs/caldav.md:5 row "Thunderbird", column "Alarms": blank cell',
    'docs/caldav.md:5 row "Thunderbird": names no client version or date',
    'docs/caldav.md:6 row "DAVx⁵ + Tasks.org", column "Alarms": "not verified" needs the date of the last attempt',
  ])
  assert.deepEqual(gateProblems(fail, caldavSpec, '0.24.0'), [], 'before 1.0 nothing is gated')
  const gate = gateProblems(fail, caldavSpec, '1.0.0')
  assert.ok(gate.includes('docs/caldav.md: row "DAVx⁵ + Tasks.org", column "Due forms": not verified (a 1.0.0 release needs a result)'), gate.join('\n'))
  assert.equal(gate.length, 4)
  assert.deepEqual(tableProblems('# No table\n', caldavSpec), ['docs/caldav.md: no verification table (a "| Client | …" table)'])
  assert.deepEqual(tableProblems(sampleTable(['| Thunderbird 158 | works |']), caldavSpec), ['docs/caldav.md:5 row "Thunderbird 158": 1 cells, the header has 2 columns'])
})

// ---- The v1 surface freeze (OpenSpec change stability-contract) ----------------------------------

test('the v1 surface keeps every entry of the snapshot at v1.0.0', (t) => {
  const problems = checkSurfaceFreeze(root)
  if (problems === null) {
    t.skip('v1.0.0 is not tagged yet')
    return
  }
  assert.deepEqual(problems, [], 'the v1 surface only grows within 1.x (docs/stability.md)')
})

test('the surface freeze accepts a listed security narrowing exactly, and nothing else', () => {
  const tagged = { routes: { 'GET /api/v1/tokens': { policy: 'signed-in' }, 'GET /api/v1/me': { policy: 'signed-in' } } }
  const allowed = { 'routes › GET /api/v1/tokens › policy': { from: 'signed-in', to: 'signed-in.full-tokens' } }
  const narrowed = { routes: { 'GET /api/v1/tokens': { policy: 'signed-in.full-tokens' }, 'GET /api/v1/me': { policy: 'signed-in' } } }
  assert.deepEqual(surfaceProblems(tagged, narrowed, 'v1.0.0', allowed), [])
  const other = { routes: { 'GET /api/v1/tokens': { policy: 'owner-only' }, 'GET /api/v1/me': { policy: 'signed-in.full-tokens' } } }
  assert.deepEqual(surfaceProblems(tagged, other, 'v1.0.0', allowed), [
    'routes › GET /api/v1/me › policy: was "signed-in" at v1.0.0, now "signed-in.full-tokens"',
    'routes › GET /api/v1/tokens › policy: was "signed-in" at v1.0.0, now "owner-only"',
  ])
})

test('the surface freeze accepts a request field that became optional, not one that became required', () => {
  const tagged = { routes: { 'POST /api/v1/fields': { request: { project_id: 'id', name: 'string?' } } } }
  const relaxedNow = { routes: { 'POST /api/v1/fields': { request: { project_id: 'id?', name: 'string?' } } } }
  assert.deepEqual(surfaceProblems(tagged, relaxedNow, 'v1.0.0', {}), [])
  const required = { routes: { 'POST /api/v1/fields': { request: { project_id: 'id', name: 'string' } } } }
  assert.deepEqual(surfaceProblems(tagged, required, 'v1.0.0', {}), ['routes › POST /api/v1/fields › request › name: was "string?" at v1.0.0, now "string"'])
  // Only a route's request: a response or MCP key named request stays frozen.
  const other = { routes: { 'GET /api/v1/tasks/{id}': { response: { request: { id: 'id' } } } }, mcp: { tools: { list_tasks: { request: { limit: 'number' } } } } }
  const otherNow = { routes: { 'GET /api/v1/tasks/{id}': { response: { request: { id: 'id?' } } } }, mcp: { tools: { list_tasks: { request: { limit: 'number?' } } } } }
  assert.deepEqual(surfaceProblems(other, otherNow, 'v1.0.0', {}), [
    'mcp › tools › list_tasks › request › limit: was "number" at v1.0.0, now "number?"',
    'routes › GET /api/v1/tasks/{id} › response › request › id: was "id" at v1.0.0, now "id?"',
  ])
})

test('the surface freeze names an entry deleted by hand after v1.0.0', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'surface-freeze-'))
  try {
    const g = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
    g('init', '-q')
    g('config', 'user.email', 'test@example.com')
    g('config', 'user.name', 'test')
    mkdirSync(path.join(dir, path.dirname(SURFACE_FILE)), { recursive: true })
    const surface = { about: 'x', errors: { bad_request: ['400', 'listed'] }, routes: { 'GET /api/v1/me': { policy: 'signed-in' } } }
    writeFileSync(path.join(dir, SURFACE_FILE), JSON.stringify(surface))
    g('add', '.')
    g('commit', '-q', '-m', 'one')
    assert.equal(checkSurfaceFreeze(dir), null, 'no tag: skipped')
    g('tag', 'v1.0.0')
    assert.deepEqual(checkSurfaceFreeze(dir), [])
    delete surface.errors.bad_request
    surface.routes['GET /api/v1/me'].policy = 'owner-only'
    surface.routes['GET /api/v1/new'] = { policy: 'signed-in' }
    writeFileSync(path.join(dir, SURFACE_FILE), JSON.stringify(surface))
    assert.deepEqual(checkSurfaceFreeze(dir), [
      'errors › bad_request › 400: present at v1.0.0, missing now',
      'errors › bad_request › listed: present at v1.0.0, missing now',
      'routes › GET /api/v1/me › policy: was "signed-in" at v1.0.0, now "owner-only"',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the recorded client calls carry no session, token or password (stability-contract D5)', () => {
  const dir = 'internal/sync/testdata/v1_clients'
  const files = readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.json'))
  assert.ok(files.length >= 3, `${dir} holds the web, ot and extension recordings`)
  for (const f of files) {
    const text = read(`${dir}/${f}`)
    assert.doesNotMatch(text, /\bot_[A-Za-z0-9_-]{16,}/, `${dir}/${f} holds an API token`)
    assert.doesNotMatch(text, /opentodo_session=|"(?:cookie|authorization|set-cookie)"\s*:/i, `${dir}/${f} holds a session cookie or credential header`)
    for (const m of text.matchAll(/"(?:password|newPassword|currentPassword)"\s*:\s*"([^"]*)"/g)) {
      assert.equal(m[1], '<password>', `${dir}/${f} holds a password`)
    }
  }
})

test('surfaceProblems ignores the about text and additions', () => {
  assert.deepEqual(surfaceProblems({ about: 'a', ops: { task: { title: 'string' } } }, { about: 'b', ops: { task: { title: 'string', new: 'bool' } } }), [])
})

// Contributor pages name only make targets that exist (OpenSpec change docs-1-0,
// documentation "Contributor guide"). A target counts when it is named in code:
// an inline `make x` or a line of a fenced block, so prose ("make the change") never does.
function makeTargets(makefile) {
  return new Set([...makefile.matchAll(/^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/gm)].map((m) => m[1]))
}

function makeTargetProblems(docs, targets) {
  const out = new Set()
  for (const [file, text] of Object.entries(docs)) {
    const fence = /```[^\n]*\n([\s\S]*?)```/g
    const code = [...text.matchAll(fence)].map((m) => m[1])
    code.push(...[...text.replace(fence, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))
    for (const snippet of code) {
      for (const m of snippet.matchAll(/(?:^|[\s;&|(])make\s+([a-z][a-z0-9_-]*)/gm)) {
        if (!targets.has(m[1])) out.add(`${file}: names \`make ${m[1]}\`, which is not a target of the Makefile`)
      }
    }
  }
  return [...out].sort()
}

test('contributor pages name only make targets that exist', () => {
  const files = ['CONTRIBUTING.md', ...readdirSync(path.join(root, 'docs/contributing')).filter((f) => f.endsWith('.md')).map((f) => `docs/contributing/${f}`)]
  assert.deepEqual(makeTargetProblems(Object.fromEntries(files.map((f) => [f, read(f)])), makeTargets(read('Makefile'))), [])
})

test('a renamed make target fails the contributor pages check, naming the page', () => {
  const targets = makeTargets('check: lint\n\techo\ni18n-lint:\n\tnode x\nVERSION := 1\n')
  assert.deepEqual([...targets].sort(), ['check', 'i18n-lint'])
  const docs = { 'docs/contributing/x.md': 'First make the change.\n\nRun `make i18n-check`, then:\n\n```sh\nmake check\nOUT_DIR=x make screens\n```\n' }
  assert.deepEqual(makeTargetProblems(docs, targets), [
    'docs/contributing/x.md: names `make i18n-check`, which is not a target of the Makefile',
    'docs/contributing/x.md: names `make screens`, which is not a target of the Makefile',
  ])
})

// A job after the release (1.4.0): GitHub skips a job whose needs chain holds a skipped job unless
// its condition is explicit, so every job that needs the
// release states !cancelled() && !failure() instead of relying on the implicit success().
test('every job after the release runs even when a job before it was skipped', () => {
  const jobs = jobsOf(read('.github/workflows/ci.yml'))
  const after = Object.entries(jobs).filter(([, block]) => /^ {4}needs: \[release\]$/m.test(block))
  assert.ok(after.length >= 4, 'the publish jobs after the release')
  for (const [id, block] of after) {
    assert.match(block, /^ {4}if: \$\{\{ !cancelled\(\) && !failure\(\) && /m, `${id}: explicit condition`)
  }
})

// The service worker answers a navigation with the app shell unless the address is one
// of the server's pages (SERVER_PAGES), a task page (TASK_PAGES: the server's t.html, or
// the checked copy once refusal is on) or a data path (DATA_PATHS). An address the
// server answers itself with a redirect or a page of its own (the OAuth authorize step,
// the OpenTodo app's sign-in, a task page) must be on one of them: otherwise the browser
// shows the web app and the flow stops, but only in a browser that has opened the web
// app before, which no first test run is.
test("the service worker lets the server's own pages through", () => {
  const lines = read('web/src/sw.ts').split('\n').filter((l) => /^const (SERVER_PAGES|TASK_PAGES|DATA_PATHS) = /.test(l))
  assert.equal(lines.length, 3, 'SERVER_PAGES, TASK_PAGES and DATA_PATHS in web/src/sw.ts')
  const denied = lines.flatMap((line) => [...line.matchAll(/\/((?:\\\/|[^/])+)\/(?=[,\]])/g)].map((m) => new RegExp(m[1])))
  const reachesServer = (p) => denied.some((re) => re.test(p))
  // Every browser navigation the server registers outside /api/ and the app's own routes.
  for (const p of ['/app/sign-in', '/oauth/authorize', '/oauth/token', '/t/abc', '/n/abc', '/routine-emails/abc', '/.well-known/oauth-authorization-server', '/mcp', '/healthz', '/api/v1/health']) {
    assert.ok(reachesServer(p), `${p} must reach the server, not the app shell`)
  }
  for (const p of ['/', '/inbox', '/app', '/app/sign-in-help', '/today']) assert.ok(!reachesServer(p), `${p} is the web app's`)
  // The address the server registers for the app's sign-in is the one denied here.
  assert.match(read('internal/httpapi/app_sign_in.go'), /appSignInPath\s+= "\/app\/sign-in"/)
})

// shell-repairs D8: iOS ends the app at the first Face ID prompt when the usage text is
// missing, so the key must be in the Info.plist the app ships and in the project file
// that generates it, with a translation catalog.
test('the iOS app carries its Face ID usage text', () => {
  assert.match(read('mobile/ios/OpenTodo/Info.plist'), /<key>NSFaceIDUsageDescription<\/key>\s*<string>[^<]+<\/string>/)
  assert.match(read('mobile/ios/project.yml'), /^\s+NSFaceIDUsageDescription: \S/m)
  const catalog = JSON.parse(read('mobile/ios/OpenTodo/InfoPlist.xcstrings'))
  assert.ok(catalog.strings?.NSFaceIDUsageDescription, 'InfoPlist.xcstrings translates NSFaceIDUsageDescription')
})

// icon-quick-actions (#2041): neither shell is compiled here, so the declarations are checked.
// Android: the order, each action's address (MainActivity opens `opentodo-open:<path>`), the
// trampoline that hands it to the running app, and a label in every language. iOS: the Info.plist against project.yml, and every title translated.
test('both shells offer Add task, Today and Change server on the app icon', () => {
  const xml = read('mobile/android/app/src/main/res/xml/shortcuts.xml')
  const android = [...xml.matchAll(/<shortcut\b([\s\S]*?)<\/shortcut>/g)].map(([, s]) => ({
    id: /android:shortcutId="([^"]+)"/.exec(s)?.[1],
    label: /android:shortcutShortLabel="@string\/([^"]+)"/.exec(s)?.[1],
    action: /android:action="([^"]+)"/.exec(s)?.[1],
    data: /android:data="([^"]+)"/.exec(s)?.[1],
    target: /android:targetClass="([^"]+)"/.exec(s)?.[1],
    long: /android:shortcutLongLabel="@string\/([^"]+)"/.exec(s)?.[1],
  }))
  assert.deepEqual(android.map((s) => s.id), ['add_task', 'today', 'change_server'])
  assert.deepEqual(android.map((s) => s.data), ['opentodo-open:/?add=', 'opentodo-open:/today', undefined])
  assert.deepEqual(android.map((s) => s.action), ['android.intent.action.VIEW', 'android.intent.action.VIEW', 'app.opentodo.CHANGE_SERVER'])
  for (const s of android) {
    assert.equal(s.target, 'app.opentodo.ShortcutActivity', `${s.id} starts the trampoline, not a cleared MainActivity`)
    assert.ok(s.long, `${s.id} has a long label`)
  }
  assert.match(read('mobile/android/app/src/main/AndroidManifest.xml'), /android:name="\.ShortcutActivity"\s+android:excludeFromRecents="true"\s+android:exported="false"/)
  const res = 'mobile/android/app/src/main/res'
  for (const dir of readdirSync(path.join(root, res)).filter((d) => d.startsWith('values') && existsSync(path.join(root, res, d, 'strings.xml')))) {
    const strings = read(`${res}/${dir}/strings.xml`)
    for (const label of new Set(android.flatMap((s) => [s.label, s.long]))) assert.match(strings, new RegExp(`<string name="${label}">[^<]+</string>`), `${dir} labels ${label}`)
  }

  const want = [['add-task', 'Add task'], ['today', 'Today'], ['change-server', 'Change server']]
  const plist = read('mobile/ios/OpenTodo/Info.plist')
  const block = /<key>UIApplicationShortcutItems<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? ''
  const items = [...block.matchAll(/<dict>([\s\S]*?)<\/dict>/g)].map(([, d]) => [
    /<key>UIApplicationShortcutItemType<\/key>\s*<string>([^<]+)/.exec(d)?.[1],
    /<key>UIApplicationShortcutItemTitle<\/key>\s*<string>([^<]+)/.exec(d)?.[1],
  ])
  assert.deepEqual(items, want)
  const yml = read('mobile/ios/project.yml')
  const ymlItems = [...yml.matchAll(/UIApplicationShortcutItemType: (\S+)\s+UIApplicationShortcutItemTitle: ([^\n]+)/g)].map(([, t, title]) => [t, title.trim()])
  assert.deepEqual(ymlItems, want)
  const catalog = JSON.parse(read('mobile/ios/OpenTodo/InfoPlist.xcstrings'))
  const langs = Object.keys(JSON.parse(read('mobile/ios/Shared/Localizable.xcstrings')).strings.Today.localizations)
  for (const [, title] of want) {
    for (const lang of langs) assert.ok(catalog.strings?.[title]?.localizations?.[lang]?.stringUnit?.value, `InfoPlist.xcstrings translates "${title}" into ${lang}`)
  }
})

// shell-first-paint: both shells open on a launch screen in the web app's canvas colour,
// light and dark. Neither is compiled here, so the pieces that must agree are checked: the
// colour both platforms declare, the Info.plist against the project file that generates it,
// and the Android theme the launcher activity uses, with its Android 12 variant.
test('both shells declare a launch screen in the app\'s colour, light and dark', () => {
  const hex = (c) => '#' + ['red', 'green', 'blue'].map((k) => Math.round(Number(c.components[k]) * 255).toString(16).padStart(2, '0')).join('')
  const set = JSON.parse(read('mobile/ios/OpenTodo/Assets.xcassets/LaunchBackground.colorset/Contents.json')).colors
  const ios = { light: hex(set.find((c) => !c.appearances).color), dark: hex(set.find((c) => c.appearances?.some((a) => a.value === 'dark')).color) }
  const colour = (file) => /<color name="launch_background">#FF([0-9A-F]{6})<\/color>/.exec(read(file))?.[1].toLowerCase()
  const android = { light: '#' + colour('mobile/android/app/src/main/res/values/colors.xml'), dark: '#' + colour('mobile/android/app/src/main/res/values-night/colors.xml') }
  assert.deepEqual(ios, android, 'the iOS colour set and the Android colours are the same two colours')
  assert.notEqual(ios.light, ios.dark)
  // The dark one is the web app's dark canvas, as the installed web app's splash colour is.
  assert.match(read('web/vite.config.ts'), new RegExp(`background_color: '${ios.dark}'`))

  assert.match(read('mobile/ios/OpenTodo/Info.plist'), /<key>UILaunchScreen<\/key>\s*<dict>\s*<key>UIColorName<\/key>\s*<string>LaunchBackground<\/string>\s*<\/dict>/)
  assert.match(read('mobile/ios/project.yml'), /^\s+UILaunchScreen:\n\s+UIColorName: LaunchBackground$/m)
  assert.match(read('mobile/ios/OpenTodo/ShellView.swift'), /static let launchColor = "LaunchBackground"/)

  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml')
  assert.match(/<activity\s+android:name="\.MainActivity"[^>]*>/.exec(manifest)[0], /android:theme="@style\/Theme\.OpenTodo\.Launch"/)
  const style = (file) => /<style name="Theme\.OpenTodo\.Launch">([\s\S]*?)<\/style>/.exec(read(file))?.[1] ?? ''
  assert.match(style('mobile/android/app/src/main/res/values/themes.xml'), /"android:windowBackground">@drawable\/launch</)
  const v31 = style('mobile/android/app/src/main/res/values-v31/themes.xml')
  for (const item of ['android:windowBackground', 'android:windowSplashScreenBackground']) assert.match(v31, new RegExp(`"${item}">@color/launch_background<`))
  const launch = read('mobile/android/app/src/main/res/drawable/launch.xml')
  assert.match(launch, /@color\/launch_background/)
  assert.match(launch, /@drawable\/ic_launcher"/)
  // No splash screen library: the module ships AndroidX it already has and nothing else.
  assert.doesNotMatch(read('mobile/android/app/build.gradle.kts'), /splashscreen/)
})

test('docs screenshots are WebP (docs-screenshot-growth): no PNG or JPEG copies in docs/images or docs/screenshots', () => {
  const walk = (dir) => readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
  const raster = ['docs/images', 'docs/screenshots'].flatMap(walk).filter((f) => /\.(png|jpe?g)$/i.test(f))
  assert.deepEqual(raster, [], 'encode docs screenshots as WebP (scripts/docs-screenshots.mjs, scripts/screenshots.mjs); README.md embeds only docs/screenshots/demo.gif')
})

// OpenSpec hygiene: a change with every task ticked is archived, not left open.
// Stale changes are reported as diagnostics only (a decision, not a fix).
test('no open OpenSpec change has every task ticked', (t) => {
  const changes = openChanges(path.join(root, 'openspec/changes'))
  assert.ok(changes.length > 0, 'openspec/changes has open changes with a tasks.md')
  assert.deepEqual(finishedProblems(changes), [])
  for (const w of staleWarnings(changes, gitLastTouched(root))) t.diagnostic(`warning: stale change: ${w}`)
})

test('the OpenSpec hygiene check finds finished and stale changes', () => {
  assert.deepEqual(taskCounts('- [x] 1.1 a\n  - [X] 1.2 b\n- [ ] 2.1 c\n[ ] not a task\n'), { done: 2, open: 1 })
  const changes = [
    { name: 'done', done: 3, open: 0 },
    { name: 'empty', done: 0, open: 0 },
    { name: 'old', done: 1, open: 2 },
    { name: 'fresh', done: 0, open: 4 },
    { name: 'shallow', done: 0, open: 1 },
  ]
  assert.deepEqual(finishedProblems(changes), ['openspec/changes/done: all 3 tasks are ticked; archive it (/opsx:archive done)'])
  const dates = { done: '2026-01-01', old: '2026-10-29', fresh: '2026-11-10', shallow: '' }
  assert.deepEqual(staleWarnings(changes, (n) => dates[n] ?? '', new Date('2026-11-17T12:00:00Z')), [
    'openspec/changes/old: 1/3 tasks, untouched since 2026-10-29 (19 days)',
  ])
})

test('every :hover in the web app\'s CSS needs a pointer that hovers (touch-input-mode)', () => {
  const css = (dir) => readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' || e.name === 'generated' ? [] : css(`${dir}/${e.name}`)) : e.name.endsWith('.css') ? [`${dir}/${e.name}`] : [])
  const found = css('web/src').flatMap((f) => unguardedHover(read(f)).map((h) => `${f}:${h.line} ${h.selector}`))
  assert.deepEqual(found, [], 'wrap these in @media (hover: hover)')
  assert.deepEqual(unguardedHover('a:hover { x: 1 }\n@media (hover: hover) { b:hover { y: 2 } }\nc { &:hover { z: 3 } }').map((h) => h.line), [1, 3])
})
