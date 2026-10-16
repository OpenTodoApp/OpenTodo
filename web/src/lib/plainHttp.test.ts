// Plain-http LAN installs (issue #4): crypto.randomUUID and crypto.subtle are
// undefined outside a secure context, so the app generates ids through uuid()
// and hashes attachments with the bundled sha256() in lib/ids.ts.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256, uuid } from './ids'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses crypto.randomUUID where the context has it', () => {
    expect(uuid()).toMatch(V4)
  })

  it('works where crypto.randomUUID is missing (http on a network address)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const ids = new Set(Array.from({ length: 1000 }, () => uuid()))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(V4)
  })
})

describe('sha256 fallback for attachments', () => {
  it('matches the platform digest on a 5 MB file', () => {
    const bytes = new Uint8Array(5 * 1024 * 1024)
    for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, i + 65536))
    const ours = Buffer.from(sha256(bytes)).toString('hex')
    expect(ours).toBe(createHash('sha256').update(bytes).digest('hex'))
  })
})

describe('no direct crypto.randomUUID calls', () => {
  // The service worker only ever runs in a secure context; the story fixtures
  // stub it for deterministic ids; ids.ts is the one place that may call it.
  const allowed = new Set(['sw.ts', 'lib/ids.ts', 'app/stories/fixtures.tsx'])
  const root = join(__dirname, '..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) files.push(p)
    }
  }
  walk(root)

  it('every id comes from uuid()', () => {
    const offenders = files
      .map((f) => f.slice(root.length + 1))
      .filter((rel) => !allowed.has(rel) && /crypto\.randomUUID\s*\(/.test(readFileSync(join(root, rel), 'utf8')))
    expect(offenders).toEqual([])
  })
})
