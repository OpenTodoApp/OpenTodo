// Spec "Plugin distribution and review", scenarios "Tagged release" and "Directory
// review": the release repository gets the three files with the release's
// version, and the source they are built from (`make obsidian-review` builds it).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain ES module without types
import { mirror } from '../scripts/mirror.mjs'

describe('release repository', () => {
  it('holds manifest.json with the release version, main.js, styles.css and versions.json', () => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'))
    writeFileSync(join(dist, 'manifest.json'), readFileSync(new URL('../manifest.json', import.meta.url)))
    writeFileSync(join(dist, 'main.js'), 'module.exports = {}')
    writeFileSync(join(dist, 'styles.css'), '')
    const dir = mkdtempSync(join(tmpdir(), 'mirror-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'versions.json'), JSON.stringify({ '0.19.1': '1.8.7' }))
    mirror('0.20.0', dir, { dist })
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ id: 'opentodo', version: '0.20.0', isDesktopOnly: false })
    expect(JSON.parse(readFileSync(join(dir, 'versions.json'), 'utf8'))).toEqual({ '0.19.1': '1.8.7', '0.20.0': manifest.minAppVersion })
    for (const f of ['main.js', 'styles.css', 'README.md', 'LICENSE', '.github/workflows/release.yml']) expect(existsSync(join(dir, f)), f).toBe(true)
    expect(readFileSync(join(dir, 'LICENSE'), 'utf8')).toMatch(/GNU AFFERO GENERAL PUBLIC LICENSE/)
    expect(() => mirror('v0.20.0', dir, { dist })).toThrow(/no "v"/)
  })

  it('holds the source main.js is built from, buildable with npm run build', () => {
    const dist = mkdtempSync(join(tmpdir(), 'dist-'))
    writeFileSync(join(dist, 'manifest.json'), readFileSync(new URL('../manifest.json', import.meta.url)))
    writeFileSync(join(dist, 'main.js'), 'module.exports = {}')
    writeFileSync(join(dist, 'styles.css'), '')
    const dir = mkdtempSync(join(tmpdir(), 'mirror-'))
    mkdirSync(join(dir, 'obsidian/src/old'), { recursive: true })
    writeFileSync(join(dir, 'obsidian/src/old/gone.ts'), '')
    mirror('0.20.0', dir, { dist })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.scripts).toEqual({ build: 'node obsidian/esbuild.config.mjs --outdir .' })
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(['esbuild', 'obsidian'])
    expect(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).packages[''].devDependencies).toEqual(pkg.devDependencies)
    expect(JSON.parse(readFileSync(join(dir, 'obsidian/manifest.json'), 'utf8')).version).toBe('0.20.0')
    for (const f of ['obsidian/src/main.ts', 'obsidian/src/shims/i18n.ts', 'obsidian/src/vault/engine.ts', 'obsidian/locales/de.json', 'obsidian/esbuild.config.mjs', 'obsidian/styles.css',
      'web/src/lib/nlp/parse.ts', 'web/src/lib/e2eeEnvelope.ts', 'web/src/generated/opSchema.ts', 'web/src/lib/types.ts', 'web/src/lib/i18n/index.ts', 'tsconfig.json', '.gitignore']) {
      expect(existsSync(join(dir, f)), f).toBe(true)
    }
    // Tests, the web app's own i18n and what an earlier release left are not there.
    expect(existsSync(join(dir, 'obsidian/src/send.test.ts'))).toBe(false)
    expect(existsSync(join(dir, 'obsidian/src/vault/memory.ts'))).toBe(false)
    expect(existsSync(join(dir, 'obsidian/src/old/gone.ts'))).toBe(false)
    expect(readFileSync(join(dir, 'web/src/lib/i18n/index.ts'), 'utf8')).toMatch(/obsidian\/src\/shims\/i18n/)
    expect(existsSync(join(dir, 'web/src/lib/i18n/react.ts'))).toBe(false)
  })

  it('the README states the network use, that nothing is collected and the full token', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    expect(readme).toMatch(/only to the OpenTodo server you configure/i)
    expect(readme).toMatch(/collects nothing/i)
    expect(readme).toMatch(/`full` API token/)
    expect(readme).toMatch(/community\.obsidian\.md/)
  })
})
