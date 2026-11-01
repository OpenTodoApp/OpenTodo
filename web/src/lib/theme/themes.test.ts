// OpenTodo Light and OpenTodo Dark as theme documents (theme-engine D9, task 3.1):
// generated from index.css with the derivation's reference values; this test fails
// when a generated file is stale, naming the token, and rewrites them with
// UPDATE_THEMES=1 (node scripts/themes-sync.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { generatedFiles, opentodoDocument } from './generate'
import { validateTheme, type ThemeDocument } from './format'
import { THEME_TOKENS } from './tokens'

const update = process.env.UPDATE_THEMES === '1'
const files = generatedFiles(css)

/** The tokens whose generated value differs from the stored document's. */
function staleTokens(stored: ThemeDocument, fresh: ThemeDocument): string[] {
  const names = new Set([...Object.keys(stored.tokens ?? {}), ...Object.keys(fresh.tokens ?? {}), ...Object.keys(fresh.seeds).map((k) => `seeds.${k}`)])
  return [...names].filter((n) => n.startsWith('seeds.') ? stored.seeds[n.slice(6)] !== fresh.seeds[n.slice(6)] : stored.tokens?.[n] !== fresh.tokens?.[n])
}

describe('generated theme files', () => {
  for (const [path, body] of Object.entries(files)) {
    it(`${path} is up to date`, () => {
      const file = join(__dirname, path)
      if (update) {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, body)
      }
      const stored = existsSync(file) ? readFileSync(file, 'utf8') : '(missing)'
      if (path.startsWith('builtin/') && stored !== body && stored !== '(missing)') {
        expect(staleTokens(JSON.parse(stored), JSON.parse(body)), `${path} is stale: node scripts/themes-sync.mjs`).toEqual([])
      }
      expect(stored, `${path} is out of date: node scripts/themes-sync.mjs`).toBe(body)
    })
  }

  it('names the token when the stylesheet changes and the documents are not regenerated', () => {
    const stored = opentodoDocument(css, 'dark')
    const changed = css.replaceAll('--ot-muted: oklch(0.7273 0.0111 261.78);', '--ot-muted: oklch(0.70 0.0111 261.78);')
    expect(changed).not.toBe(css)
    expect(staleTokens(stored, opentodoDocument(changed, 'dark'))).toEqual(['muted'])
  })

  for (const kind of ['light', 'dark'] as const) {
    it(`OpenTodo ${kind} is a valid document with every token explicit`, () => {
      const doc = opentodoDocument(css, kind)
      const r = validateTheme(doc)
      expect(r.ok, JSON.stringify(r)).toBe(true)
      expect(Object.keys(doc.tokens ?? {}).sort()).toEqual([...THEME_TOKENS].sort())
      expect(doc.id).toBe(`opentodo-${kind}`)
    })
  }
})
