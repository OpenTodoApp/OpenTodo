import { describe, expect, it } from 'vitest'

// The built service worker and manifest (OpenSpec change attachments, tasks 9.1
// and 9.2). Skipped when the web app has not been built yet (`npm run build`).
const built = import.meta.glob<string>(['../../../internal/web/dist/sw.js', '../../../internal/web/dist/manifest.webmanifest'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const sw = Object.entries(built).find(([p]) => p.endsWith('sw.js'))?.[1]
const manifest = Object.entries(built).find(([p]) => p.endsWith('manifest.webmanifest'))?.[1]

describe('built service worker', () => {
  it.skipIf(!sw)('precaches the build, keeps the deny list and push, and handles the share POST', () => {
    expect(sw).toMatch(/"revision":"[0-9a-f]+"/)
    expect(sw).not.toContain('self.__WB_MANIFEST')
    // A task page (/t/) is its own document, never the app (task-pages D8).
    expect(sw).toContain('denylist:[/^\\/api\\//,/^\\/healthz/,/^\\/t\\//]')
    expect(sw).toContain('push-sw.js')
    expect(sw).toContain('/share?inbox=')
    expect(sw).toContain('opentodo-share')
    // A classic script (importScripts needs one): no module syntax at the top level.
    expect(sw).not.toMatch(/^\s*(import|export)\s/m)
  })
})

describe('built manifest', () => {
  it.skipIf(!manifest)('offers a POST share target with files', () => {
    const m = JSON.parse(manifest!) as { share_target: { action: string; method: string; enctype: string; params: { files: { name: string; accept: string[] }[] } } }
    expect(m.share_target).toMatchObject({ action: '/share', method: 'POST', enctype: 'multipart/form-data' })
    expect(m.share_target.params.files[0].name).toBe('files')
    expect(m.share_target.params.files[0].accept).toContain('image/*')
  })
})
