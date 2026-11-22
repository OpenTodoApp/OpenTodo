import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// OpenSpec design-system "Design workbench": the workbench is a development tool
// only, so the production build (embedded in the Go binary) must contain no
// Storybook code. Skipped when the web app has not been built yet, except with
// REQUIRE_BUILT=1 (CI, after its build step). Read from disk at run time: an
// import.meta.glob is cached with the transformed file, so a run before the build
// would hide it.
const dist = path.resolve(process.cwd(), '../internal/web/dist')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? files(file) : /\.(js|css|html|webmanifest)(\.gz)?$/.test(name) ? [file] : []
  })
}
// A file the build keeps only compressed (compressed-static-assets) is read as what it decodes to.
const text = (f: string) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)) : readFileSync(f)).toString('utf8')
const built: Record<string, string> = Object.fromEntries((existsSync(dist) ? files(dist) : []).map((f) => [f, text(f)]))

describe('production build', () => {
  it.runIf(process.env.REQUIRE_BUILT === '1')('exists (REQUIRE_BUILT=1)', () => {
    expect(Object.keys(built).length, 'internal/web/dist: run npm run build first').toBeGreaterThan(0)
  })
  it.skipIf(Object.keys(built).length === 0)('contains no workbench code', () => {
    const offenders = Object.entries(built)
      .filter(([, text]) => /storybook/i.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
