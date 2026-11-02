// The theme template (OpenSpec change themes-layout-template): made from a theme,
// it reads back through the importer as that theme plus `$schema`, names every
// token of the format, and stays valid with every commented line uncommented. The
// templates of OpenTodo Light and Dark are written to internal/themes/testdata/template/,
// where the Go validator reads them too (themes_test.go); UPDATE_THEME_TEMPLATES=1
// rewrites them.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import light from './builtin/opentodo-light.json'
import dark from './builtin/opentodo-dark.json'
import nord from './builtin/nord.json'
import { resolveDraft, simplifyDocument } from './compute'
import { readThemeFile, withoutFileKeys } from './files'
import type { ThemeDocument } from './format'
import { SEED_NAMES, templateFileName, themeTemplate, THEME_SCHEMA_URL, type TemplateText } from './template'
import { THEME_TOKENS } from './tokens'

const dir = join(__dirname, '../../../../internal/themes/testdata/template')

/** English notes, fixed, so the shared files do not follow a catalogue's wording. */
const EN: TemplateText = {
  header: ['OpenTodo theme template.', 'Lines that start with // are notes.'],
  key: { opentodoTheme: 'Keep 1.', id: 'An id.', name: 'A name.', author: 'You.', licence: 'SPDX.', source: 'Text.', kind: 'light or dark.', bar: 'Bar.', notes: 'Notes.', shape: 'Corners.', type: 'Type.' },
  seeds: 'Base colours.',
  statusSeeds: 'Status colours.',
  seed: (s) => `The ${s} seed.`,
  tokens: ['Every other colour.'],
  group: (g) => g,
  token: (tok) => tok,
}

const uncommented = (text: string) => text.replace(/^(\s*)\/\/ (".*)$/gm, '$1$2')

function templateOf(source: ThemeDocument) {
  const doc = simplifyDocument(source)
  return { doc, text: themeTemplate(doc, resolveDraft(doc).resolved, EN) }
}

describe('theme template', () => {
  for (const source of [light, dark, nord] as unknown as ThemeDocument[]) {
    it(`${source.id}: reads back as the theme, with $schema`, () => {
      const { doc, text } = templateOf(source)
      const r = readThemeFile(text)
      expect(r.ok, JSON.stringify(r)).toBe(true)
      if (!r.ok) return
      expect(r.doc.$schema).toBe(THEME_SCHEMA_URL)
      expect(withoutFileKeys(r.doc)).toEqual(doc)
    })

    it(`${source.id}: names every token and stays valid with every line uncommented`, () => {
      const { text } = templateOf(source)
      const missing = [...THEME_TOKENS, ...SEED_NAMES].filter((tok) => !text.includes(`"${tok}":`))
      expect(missing).toEqual([])
      const all = readThemeFile(uncommented(text))
      expect(all.ok, JSON.stringify(all)).toBe(true)
      if (!all.ok) return
      // Uncommented, every token is set: the theme still looks the same.
      const before = resolveDraft(simplifyDocument(source)).resolved.tokens
      const after = resolveDraft(withoutFileKeys(all.doc)).resolved.tokens
      expect(Object.keys(after).length).toBe(Object.keys(before).length)
    })
  }

  it('keeps tokens the theme sets as values', () => {
    const doc = { ...(light as unknown as ThemeDocument), tokens: { muted: '#5b6474' } }
    const text = themeTemplate(doc, resolveDraft(doc).resolved, EN)
    expect(text).toMatch(/^ {4}"muted": "#5b6474", \/\/ muted$/m)
    expect(text).toMatch(/^ {4}\/\/ "faint": "#[0-9a-f]{6}", \/\/ faint$/m)
  })

  it('is named after the theme', () => {
    expect(templateFileName('Nord (custom)')).toBe('nord-custom-template.opentodo-theme.jsonc')
  })

  it('shared templates of OpenTodo Light and Dark (read by the Go validator too)', () => {
    for (const source of [light, dark] as unknown as ThemeDocument[]) {
      const file = join(dir, `${source.id}.jsonc`)
      const { text } = templateOf(source)
      if (process.env.UPDATE_THEME_TEMPLATES) writeFileSync(file, text)
      expect(readFileSync(file, 'utf8'), `${file} is stale: run UPDATE_THEME_TEMPLATES=1 npx vitest run src/lib/theme/template.test.ts`).toBe(text)
    }
  })
})
