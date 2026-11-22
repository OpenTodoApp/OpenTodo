// The build step that writes gzip copies (OpenSpec change compressed-static-assets, D1).
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { compressDist } from './compress-dist.mjs'

describe('compressDist', () => {
  it('replaces a compressible file of 1 KiB or more that shrinks by its gzip form, and only that', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'compress-dist-'))
    mkdirSync(path.join(dist, 'assets'))
    const big = 'const a = 1;\n'.repeat(200)
    const files = {
      'assets/main-a1.js': big, 'assets/main-a1.css': big, 'assets/icon-b2.svg': big, 'assets/CREDITS-c3.md': big,
      'assets/tiny-d4.js': 'x=1', 'assets/font-e5.woff2': big, 'assets/noise-f6.js': randomBytes(4000),
      'index.html': big,
    }
    for (const [p, body] of Object.entries(files)) writeFileSync(path.join(dist, p), body)
    const res = compressDist(dist)
    expect(res.files).toBe(4)
    for (const p of ['assets/main-a1.js', 'assets/main-a1.css', 'assets/icon-b2.svg', 'assets/CREDITS-c3.md']) {
      expect(gunzipSync(readFileSync(path.join(dist, p + '.gz'))).toString()).toBe(big)
      expect(existsSync(path.join(dist, p))).toBe(false) // one form only
    }
    // Too small, not a compressible type, does not shrink enough, or outside assets/.
    for (const p of ['assets/tiny-d4.js', 'assets/font-e5.woff2', 'assets/noise-f6.js', 'index.html']) {
      expect(existsSync(path.join(dist, p + '.gz'))).toBe(false)
      expect(existsSync(path.join(dist, p))).toBe(true)
    }
    expect(res.packed).toBeLessThan(res.raw)
  })
})
