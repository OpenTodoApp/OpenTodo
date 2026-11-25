import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The built service worker and manifest (OpenSpec change attachments, tasks 9.1
// and 9.2). Skipped when the web app has not been built yet (`npm run build`),
// except with REQUIRE_BUILT=1: CI runs these after its build step and a missing
// build must fail there, not skip. Read from disk at run time: an import.meta.glob
// is cached with the transformed file, so a run before the build would hide it.
const dist = path.resolve(process.cwd(), '../internal/web/dist')
const read = (name: string) => (existsSync(path.join(dist, name)) ? readFileSync(path.join(dist, name), 'utf8') : undefined)
const sw = read('sw.js')
const manifest = read('manifest.webmanifest')
const list = read('app-manifest.json')

describe('built service worker', () => {
  it.runIf(process.env.REQUIRE_BUILT === '1')('the build exists (REQUIRE_BUILT=1)', () => {
    expect(sw, 'internal/web/dist/sw.js: run npm run build first').toBeTruthy()
    expect(manifest, 'internal/web/dist/manifest.webmanifest: run npm run build first').toBeTruthy()
  })
  it.skipIf(!sw)('precaches the build, keeps the deny list and push, and handles the share POST', () => {
    expect(sw).toMatch(/"revision":"[0-9a-f]+"/)
    expect(sw).not.toContain('self.__WB_MANIFEST')
    // A task page, a note page and a stop page are t.html, never the app (task-pages D8);
    // the OAuth endpoints and discovery documents reach the server (mcp-oauth), and so
    // does the OpenTodo app's sign-in (app-sign-in).
    expect(sw).toContain('[/^\\/t\\//,/^\\/n\\//,/^\\/routine-emails\\//]')
    expect(sw).toContain('[/^\\/app\\/sign-in$/]')
    expect(sw).toContain('[/^\\/api\\//,/^\\/healthz/,/^\\/dav\\//,/^\\/feeds\\//,/^\\/oauth\\//,/^\\/\\.well-known\\//,/^\\/mcp(\\/|$)/,')
    // Reminder push is bundled in (signed-web-app D1): the list's hash of sw.js covers it.
    expect(sw).toContain('notificationclick')
    expect(sw).not.toContain('importScripts')
    expect(sw).toContain('/share?inbox=')
    expect(sw).toContain('opentodo-share')
    // A classic script (importScripts needs one): no module syntax at the top level.
    expect(sw).not.toMatch(/^\s*(import|export)\s/m)
  })
})

// The signed file list (OpenSpec change signed-web-app): every file of the
// build with its hash, and the worker's install set equal to the Workbox-format
// list sw.js still carries for the Android apps that read it (design D6).
describe('built file list', () => {
  it.runIf(process.env.REQUIRE_BUILT === '1')('exists (REQUIRE_BUILT=1)', () => {
    expect(list, 'internal/web/dist/app-manifest.json: run npm run build first').toBeTruthy()
  })
  it.skipIf(!list || !sw)('lists every file with its hash, installs what Workbox precached, and keeps the old list in sw.js', () => {
    const envelope = JSON.parse(list!) as { format: number; payload: string; signatures: unknown[] }
    expect(envelope.format).toBe(1)
    const m = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString()) as { app: string; worker: { path: string; sha256: string }; files: Record<string, { sha256: string; size: number; load: string; lang?: string }> }
    expect(m.app).toBe('opentodo-web')
    for (const [p, f] of Object.entries(m.files)) {
      // A file the build keeps only compressed is listed as the bytes it decodes to (compressed-static-assets).
      const file = path.join(dist, p)
      const body = existsSync(file) ? readFileSync(file) : gunzipSync(readFileSync(file + '.gz'))
      expect(createHash('sha256').update(body).digest('hex'), p).toBe(f.sha256)
      expect(body.length, p).toBe(f.size)
    }
    expect(m.worker).toEqual({ path: 'sw.js', sha256: m.files['sw.js'].sha256 })
    expect(m.files['manifest.webmanifest']).toBeUndefined()
    expect(m.files['push-sw.js']).toBeUndefined()
    const legacy = JSON.parse(/opentodoPrecache=(\[[^\]]*\])/.exec(sw!)![1]) as { url: string }[]
    const installs = Object.keys(m.files).filter((p) => m.files[p].load === 'install').sort()
    // The interface catalogues are lazy with their language (precache-device-language D2),
    // and the Workbox list keeps them for the Android shells that read it (D4).
    const catalogues = Object.keys(m.files).filter((p) => m.files[p].lang).sort()
    expect(catalogues.length).toBeGreaterThan(0)
    for (const p of catalogues) expect(m.files[p].load, p).toBe('lazy')
    // Workbox lists the icons twice and the web app manifest, which the list leaves to the server (D7).
    expect([...new Set(legacy.map((e) => e.url))].filter((u) => u !== 'manifest.webmanifest').sort()).toEqual([...installs, ...catalogues].sort())
    for (const lazy of ['t.html', 'sw.js']) expect(m.files[lazy]?.load).toBe('lazy')
  })
})

describe('built manifest', () => {
  it.skipIf(!manifest)('offers a POST share target with files', () => {
    const m = JSON.parse(manifest!) as { share_target: { action: string; method: string; enctype: string; params: { files: { name: string; accept: string[] }[] } } }
    expect(m.share_target).toMatchObject({ action: '/share', method: 'POST', enctype: 'multipart/form-data' })
    expect(m.share_target.params.files[0].name).toBe('files')
    expect(m.share_target.params.files[0].accept).toContain('image/*')
  })
  // sidebar-v2 D3: the brand icons, with the maskable one filling its square, and
  // every icon in the precache so an installed app updates its mark offline too.
  it.skipIf(!manifest || !sw)('lists the five brand icons and precaches them', () => {
    const m = JSON.parse(manifest!) as { icons: { src: string; purpose?: string }[] }
    expect(m.icons.map((i) => i.src)).toEqual(['/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png', '/apple-touch-icon.png', '/favicon.svg'])
    expect(m.icons.find((i) => i.purpose === 'maskable')?.src).toBe('/pwa-maskable-512.png')
    for (const i of m.icons) expect(sw).toContain(`"url":"${i.src.slice(1)}"`)
  })
})
