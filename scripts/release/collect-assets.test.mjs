// The release job's asset collection (scripts/release/collect-assets.sh): only the
// files a release ships reach the GitHub release, never the web app's build chunks
// that happen to start with "opentodo-" (v0.20.0 shipped two of them).
// Run: node --test scripts/release/collect-assets.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'collect-assets.sh')
const root = path.resolve(here, '../..')

const platforms = ['linux-amd64', 'linux-arm64', 'darwin-amd64', 'darwin-arm64', 'windows-amd64', 'windows-arm64']
const binaries = platforms.flatMap((p) => {
  const ext = p.startsWith('windows') ? '.exe' : ''
  return [`bin-${p}/opentodo-${p}${ext}`, `bin-${p}/ot-${p}${ext}`]
})

const shipped = [
  ...binaries,
  'opentodo-browser-extension/opentodo-browser-extension-chrome.zip',
  'opentodo-browser-extension/opentodo-browser-extension-firefox.zip',
  'opentodo-agent-skill/opentodo-agent-skill.zip',
  'opentodo-agent-skill/opentodo-mcp-skill.zip',
  'opentodo-android/opentodo-android-0.20.0.apk',
  'opentodo-android/opentodo-android-0.20.0.aab',
  'opentodo-site-bundle-v0.20.0/opentodo-site-bundle-v0.20.0.tar.gz',
  'web-manifest/opentodo-web-manifest-v0.20.0.json',
]
// What else the run's artifacts hold, some of it named like a release file.
const stray = [
  'web-dist/assets/opentodo-dark-tMkRgx0r.js',
  'web-dist/assets/opentodo-light-BU5bAA6P.js',
  'web-dist/opentodo-dark-tMkRgx0r.js',
  'web-dist/app-manifest.json',
  'web-dist-signed/app-manifest.json',
  'opentodo-obsidian/main.js',
  'opentodo-android-debug/app-debug.apk',
  'opentodo-android-test-report/index.html',
  'ui-check-report-1/opentodo-shot.png',
  'opentodo-android/opentodo-android-0.20.0.apk.idsig',
]

function tree(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-assets-'))
  for (const f of files) {
    mkdirSync(path.join(dir, 'artifacts', path.dirname(f)), { recursive: true })
    writeFileSync(path.join(dir, 'artifacts', f), f)
  }
  return dir
}

test('only the files a release ships are collected, with their checksums', () => {
  const dir = tree([...shipped, ...stray])
  try {
    execFileSync('sh', [script, path.join(dir, 'artifacts'), path.join(dir, 'release')], { stdio: 'pipe' })
    const got = readdirSync(path.join(dir, 'release')).sort()
    assert.deepEqual(got, [...shipped.map((f) => path.basename(f)), 'SHA256SUMS'].sort())
    const sums = readFileSync(path.join(dir, 'release/SHA256SUMS'), 'utf8').trim().split('\n')
    assert.equal(sums.length, shipped.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a release without every binary fails', () => {
  const dir = tree(shipped.filter((f) => !f.endsWith('/ot-darwin-arm64')))
  try {
    const r = spawnSync('sh', [script, path.join(dir, 'artifacts'), path.join(dir, 'release')], { encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /missing release binary ot-darwin-arm64/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the release job collects its assets with this script', () => {
  const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  const release = ci.slice(ci.indexOf('\n  release:\n'))
  assert.match(release, /scripts\/release\/collect-assets\.sh artifacts release/)
  assert.doesNotMatch(release, /-name 'opentodo-\*'/, 'no catch-all name pattern')
})
