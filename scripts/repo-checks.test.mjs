// Repository checks for CI and release hygiene (OpenSpec change release-hygiene):
// the CI path filter, the patched Go toolchain shared by go.mod, CI and the
// Dockerfile, the root docker-compose.yml publishing on loopback by default, and
// migration numbering against the base branch (sync-convergence).
// Run: node --test scripts/repo-checks.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

function changes(files) {
  const out = execFileSync('sh', [path.join(root, 'scripts/ci-changes.sh')], { input: files.join('\n') + '\n', encoding: 'utf8' })
  return Object.fromEntries(out.trim().split('\n').map((l) => l.split('=')))
}

// path(s) → expected outputs of scripts/ci-changes.sh
const table = [
  [['internal/sync/ops.go'], { code: 'true', docs: 'false' }],
  [['web/src/app/App.tsx'], { code: 'true', docs: 'false' }],
  [['go.sum'], { code: 'true', docs: 'false' }],
  [['Dockerfile'], { code: 'true', docs: 'false' }],
  [['.github/workflows/ci.yml'], { code: 'true', docs: 'false' }],
  [['skills/opentodo-cli/SKILL.md'], { code: 'true', docs: 'false' }],
  [['skills/skills.go'], { code: 'true', docs: 'false' }],
  [['deploy/coolify/opentodo.yaml'], { code: 'true', docs: 'false' }],
  [['scripts/deploy/casaos.mjs'], { code: 'true', docs: 'false' }],
  [['scripts/deploy-check.mjs'], { code: 'true', docs: 'false' }],
  [['scripts/ci-changes.sh'], { code: 'true', docs: 'false' }],
  [['scripts/repo-checks.test.mjs'], { code: 'true', docs: 'false' }],
  [['docker-compose.yml'], { code: 'true', docs: 'false' }],
  [['scripts/coolify-template-check.mjs'], { code: 'true', docs: 'false' }],
  [['docs/self-hosting/docker.md'], { code: 'false', docs: 'true' }],
  [['web/src/generated/help.json'], { code: 'false', docs: 'true' }],
  [['README.md'], { code: 'false', docs: 'true' }],
  [['CHANGELOG.md'], { code: 'false', docs: 'true' }],
  [['openspec/changes/x/proposal.md'], { code: 'false', docs: 'true' }],
  [['docs/api.md', 'web/src/generated/help.json'], { code: 'false', docs: 'true' }],
  [['docs/api.md', 'internal/httpapi/router.go'], { code: 'true', docs: 'true' }],
  [['skill/README.md'], { code: 'false', docs: 'false' }],
  [['LICENSE'], { code: 'false', docs: 'false' }],
]

for (const [files, want] of table) {
  test(`ci-changes: ${files.join(' + ')}`, () => {
    assert.deepEqual(changes(files), want)
  })
}

test('go.mod pins a patched toolchain that the Dockerfile and every setup-go step use', () => {
  const toolchain = read('go.mod').match(/^toolchain go(\d+\.\d+\.\d+)$/m)
  assert.ok(toolchain, 'go.mod must have a `toolchain go1.N.P` line')
  const docker = read('Dockerfile').match(/^ARG GO_VERSION=(\S+)$/m)
  assert.equal(docker?.[1], toolchain[1], 'Dockerfile GO_VERSION must match the go.mod toolchain')
  const ci = read('.github/workflows/ci.yml')
  const steps = ci.split(/\n\s*- uses: actions\/setup-go@/).slice(1)
  assert.ok(steps.length > 0)
  for (const s of steps) assert.match(s.split('\n- ')[0], /^\S+\n\s+with:\n\s+go-version-file: go\.mod\n/, 'setup-go must read go.mod')
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
