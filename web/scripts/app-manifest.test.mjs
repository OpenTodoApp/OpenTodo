// The build step that writes the signed web app's file list (OpenSpec change
// signed-web-app, task 2.1), on a small fixture build.
import { generateKeyPairSync, createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildManifest, loadOf, writeManifest } from './app-manifest.mjs'
import { buildKeys, officialKeys, publicSpki } from './signingKeys.mjs'

function fixture() {
  const dist = mkdtempSync(path.join(tmpdir(), 'app-manifest-'))
  const files = {
    'index.html': '<div id=root></div>', 't.html': '<p>task</p>', 'sw.js': 'self.x=1', 'registerSW.js': 'r',
    'assets/index-a1.js': 'main', 'assets/MapView-b2.js': 'map', 'assets/maplibre-gl-worker-c3.js': 'w', 'assets/t-d4.js': 't',
    'assets/index-a1.css': 'css', 'assets/CREDITS-e5.md': '# c', 'favicon.svg': '<svg/>', 'manifest.webmanifest': '{}', '.gitkeep': '',
  }
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dist, p)), { recursive: true })
    writeFileSync(path.join(dist, p), body)
  }
  return { dist, files }
}

const payloadOf = (env) => JSON.parse(Buffer.from(env.payload, 'base64url').toString())

describe('app-manifest.mjs', () => {
  it('lists every file with its hash and size, install or lazy, and leaves out the web manifest', () => {
    const { dist, files } = fixture()
    const env = buildManifest(dist, { version: 'v1.3.0', keys: [{ spki: 'K', role: 'release' }] })
    expect(env).toMatchObject({ format: 1, signatures: [] })
    const m = payloadOf(env)
    expect(m).toMatchObject({ app: 'opentodo-web', version: '1.3.0', refuse: false, keys: [{ spki: 'K', role: 'release' }] })
    expect(Object.keys(m.files).sort()).toEqual(Object.keys(files).filter((p) => p !== 'manifest.webmanifest' && p !== '.gitkeep').sort())
    for (const [p, f] of Object.entries(m.files)) {
      expect(f.sha256).toBe(createHash('sha256').update(files[p]).digest('hex'))
      expect(f.size).toBe(Buffer.byteLength(files[p]))
    }
    expect(m.worker).toEqual({ path: 'sw.js', sha256: m.files['sw.js'].sha256 })
    expect(Object.fromEntries(Object.entries(m.files).map(([p, f]) => [p, f.load]))).toEqual({
      'index.html': 'install', 't.html': 'lazy', 'sw.js': 'lazy', 'registerSW.js': 'install',
      'assets/index-a1.js': 'install', 'assets/MapView-b2.js': 'lazy', 'assets/maplibre-gl-worker-c3.js': 'lazy', 'assets/t-d4.js': 'lazy',
      'assets/index-a1.css': 'install', 'assets/CREDITS-e5.md': 'install', 'favicon.svg': 'install',
    })
  })

  it('marks a preview build and defaults the version', () => {
    const { dist } = fixture()
    expect(payloadOf(buildManifest(dist, { build: 'preview' }))).toMatchObject({ version: '0.0.0-dev', build: 'preview' })
  })

  it('writes the official keys, or the public half of WEB_SIGNING_KEY alone', () => {
    const { dist } = fixture()
    const official = officialKeys()
    let m = payloadOf(writeManifest(dist, { OPENTODO_VERSION: '1.4.0' }))
    expect(m.keys).toEqual(official.keys)
    expect(m.refuse).toBe(official.refuse)
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
    m = payloadOf(writeManifest(dist, { WEB_SIGNING_KEY: pem }))
    expect(m.keys).toEqual([{ spki: publicSpki(pem), role: 'release' }])
    expect(JSON.parse(readFileSync(path.join(dist, 'app-manifest.json'), 'utf8')).signatures).toEqual([])
    expect(buildKeys({ WEB_SIGNING_KEY: pem }).official).toEqual(official.keys.map((k) => k.spki))
  })

  it('reads a key file relative to the repository, the way make passes it', () => {
    const k = buildKeys({ WEB_SIGNING_KEY: 'internal/websign/testdata/test-key.pem' })
    expect(k.keys).toHaveLength(1)
    expect(k.keys[0].spki).toMatch(/^MFkw/)
  })

  it('keeps the precache rule', () => {
    expect(loadOf('assets/foo-1.woff2')).toBe('install')
    expect(loadOf('robots.txt')).toBe('lazy')
  })
})
