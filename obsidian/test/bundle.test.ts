// The built main.js (obsidian-plugin task 3.1): within budget, no Node or
// Electron module (Obsidian mobile has neither), none of the web app's catalogue,
// React or Dexie, and only the configured server as a destination.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain ES module without types
import { BUDGET_BYTES, build } from '../esbuild.config.mjs'

describe('bundle', () => {
  it('builds within budget, without Node, Electron or the web app’s runtime', async () => {
    const out = mkdtempSync(join(tmpdir(), 'opentodo-obsidian-'))
    const size = (await build({ outdir: out })) as number
    expect(size).toBeLessThanOrEqual(BUDGET_BYTES)
    const js = readFileSync(join(out, 'main.js'), 'utf8')
    for (const banned of ['require("fs")', 'require("electron")', 'child_process', 'require("path")', 'require("crypto")']) expect(js).not.toContain(banned)
    expect(js).not.toMatch(/dexie|indexedDB|react\.element|__vite/i)
    // No address of its own: no analytics, no update check.
    const hosts = [...js.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]).filter((u) => !/^https:\/\/(github\.com|todo\.example\.com|www\.w3\.org)$/.test(u))
    expect(hosts).toEqual([])
    expect(js).toMatch(/require\("obsidian"\)/)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ id: 'opentodo', isDesktopOnly: false })
  })
})
