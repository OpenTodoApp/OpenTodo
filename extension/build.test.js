// Run with: node --test extension/build.test.js  (or `make extension`)
// The two store packages from one source manifest (OpenSpec change extension-v2,
// design D7; share-capture "Extension packaging for the stores").
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { FILES, build, changelogVersion, manifestFor, manifestProblems, zip } from './build.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const source = JSON.parse(readFileSync(join(here, 'manifest.src.json'), 'utf8'))

/** A copy of the extension sources in a temporary folder, so a test can change them. */
function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'opentodo-ext-'))
  for (const f of [...FILES, 'manifest.src.json', 'CHANGELOG.md']) cpSync(join(here, f), join(dir, 'src', f), { recursive: true })
  return dir
}

/** The names and contents in a zip written by `zip()`. */
function unzip(buf) {
  const out = new Map()
  let i = 0
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString()
    const start = i + 30 + nameLen
    out.set(name, inflateRawSync(buf.subarray(start, start + size)))
    i = start + size
  }
  return out
}

test('Two packages: the same files, one manifest each', () => {
  const dir = copy()
  try {
    const zips = build({ src: join(dir, 'src'), out: join(dir, 'dist') })
    assert.deepEqual(zips.map((z) => z.slice(dir.length + 1)), ['dist/opentodo-browser-extension-chrome.zip', 'dist/opentodo-browser-extension-firefox.zip'])
    const [chrome, firefox] = zips.map((z) => unzip(readFileSync(z)))
    assert.deepEqual([...chrome.keys()], [...firefox.keys()])
    for (const f of ['manifest.json', 'popup.html', 'popup.js', 'api.js', 'mail.js', 'background.js', 'options.html', 'icons/icon-128.png', '_locales/fr/messages.json']) assert.ok(chrome.has(f), f)
    for (const f of chrome.keys()) assert.ok(!/test|testdata|store\/|build\.mjs|CHANGELOG|README|package\.json/.test(f), `${f} must not ship`)
    const cm = JSON.parse(chrome.get('manifest.json'))
    const fm = JSON.parse(firefox.get('manifest.json'))
    assert.equal(cm.background.service_worker, 'background.js')
    assert.equal(cm.background.scripts, undefined)
    assert.equal(cm.browser_specific_settings, undefined)
    assert.deepEqual(fm.background.scripts, ['background.js'])
    assert.equal(fm.background.service_worker, undefined)
    assert.equal(fm.browser_specific_settings.gecko.id, 'share-capture@opentodo')
    assert.equal(cm.version, source.version)
    // web-ext lints only the Firefox package: Chrome's keys are checked here.
    const chromeKeys = ['manifest_version', 'name', 'short_name', 'version', 'description', 'default_locale', 'icons', 'action', 'background', 'permissions', 'optional_host_permissions', 'commands', 'options_ui']
    for (const k of Object.keys(cm)) assert.ok(chromeKeys.includes(k), `Chrome manifest key ${k}`)
    assert.deepEqual(Object.keys(cm.background).sort(), ['service_worker', 'type'])
    assert.deepEqual(chrome.get('popup.js'), readFileSync(join(here, 'popup.js')))
    assert.ok(existsSync(join(dir, 'dist/extension-chrome/manifest.json')))
    assert.ok(!existsSync(join(dir, 'src/manifest.json')), 'only --dev writes the source folder manifest')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the build repeats byte for byte', () => {
  const entries = [{ name: 'a.txt', data: Buffer.from('hello') }]
  assert.deepEqual(zip(entries), zip(entries))
})

test('Version not described: the build fails naming the version', () => {
  const dir = copy()
  try {
    const log = join(dir, 'src', 'CHANGELOG.md')
    writeFileSync(log, readFileSync(log, 'utf8').replace(/^## \d+\.\d+\.\d+.*\n[\s\S]*?(?=^## )/m, ''))
    assert.throws(() => build({ src: join(dir, 'src'), out: join(dir, 'dist') }), new RegExp(`manifest version ${source.version.replaceAll('.', '\\.')} is not the first entry`))
    assert.ok(!existsSync(join(dir, 'dist')), 'nothing written')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Manifest holds no host permission', () => {
  assert.deepEqual(manifestProblems(source), [])
  assert.equal(source.host_permissions, undefined)
  assert.equal(source.content_scripts, undefined)
  assert.equal(manifestProblems({ ...source, host_permissions: ['https://*/*'] }).length, 1)
  assert.equal(manifestProblems({ ...source, content_scripts: [{}] }).length, 1)
  assert.equal(manifestProblems({ ...source, optional_host_permissions: ['<all_urls>'] }).length, 1)
  assert.equal(manifestProblems({ ...source, action: {} }).length, 1)
})

test('the changelog version and the manifest forms', () => {
  assert.equal(changelogVersion('# x\n\n## 0.6.0 - 2026-10-22\n\n## 0.5.0'), '0.6.0')
  assert.equal(changelogVersion('## [v1.2.3]'), '1.2.3')
  assert.equal(changelogVersion('nothing'), '')
  assert.equal(changelogVersion(readFileSync(join(here, 'CHANGELOG.md'), 'utf8')), source.version)
  assert.ok(source.background.scripts && source.background.service_worker, 'the source holds both forms')
  assert.notEqual(manifestFor(source, 'chrome'), source)
})

test('every file the packages ship exists, and nothing the extension loads is missing', () => {
  for (const f of FILES) assert.ok(existsSync(join(here, f)), f)
  const shipped = new Set(FILES)
  for (const f of readdirSync(here).filter((f) => /\.(js|html|css)$/.test(f) && !f.endsWith('.test.js'))) {
    for (const [, ref] of readFileSync(join(here, f), 'utf8').matchAll(/(?:from |src=|href=)['"]\.?\/?([\w.-]+\.(?:js|css))['"]/g)) {
      assert.ok(shipped.has(ref), `${f} loads ${ref}, which is not in FILES`)
    }
  }
})
