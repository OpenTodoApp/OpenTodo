// Theme files (OpenSpec change theme-editor, task 5.1, design D11), over the shared
// valid and invalid examples of internal/themes.
import { describe, expect, it } from 'vitest'
import nord from './builtin/nord.json'
import type { ThemeDocument } from './format'
import { fileErrorText, importedDraft, MAX_THEME_FILE_BYTES, readThemeFile, themeFileName, themeFileText } from './files'

const valid = import.meta.glob<string>('../../../../internal/themes/testdata/valid/*.json', { query: '?raw', import: 'default', eager: true })
const invalid = import.meta.glob<string>('../../../../internal/themes/testdata/invalid/*.json', { query: '?raw', import: 'default', eager: true })
const NORD = nord as unknown as ThemeDocument

describe('theme files', () => {
  it('exports a theme as <slug>.opentodo-theme.json that reads back the same', () => {
    expect(themeFileName('Nord (custom)')).toBe('nord-custom.opentodo-theme.json')
    expect(themeFileName('Rosé Pine')).toBe('rose-pine.opentodo-theme.json')
    const back = readThemeFile(themeFileText(NORD))
    expect(back).toEqual({ ok: true, doc: NORD })
  })

  it('accepts every shared valid example and refuses every invalid one', () => {
    expect(Object.keys(valid).length).toBeGreaterThan(3)
    for (const [name, text] of Object.entries(valid)) expect(readThemeFile(text).ok, name).toBe(true)
    // A file is measured on the document it holds, written compact as it is synced: too-large.json
    // is 17.8 KB of indented text but 13.5 KB of document, so as a file it is read (exports are indented).
    for (const [name, text] of Object.entries(invalid)) if (!name.endsWith('too-large.json')) expect(readThemeFile(text).ok, name).toBe(false)
    const big = { ...NORD, notes: { text: 'x'.repeat(500) }, tokens: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`t${i}`, '#000000'])) }
    expect(readThemeFile(JSON.stringify(big))).toMatchObject({ ok: false, message: 'The theme is larger than 16 KB.' })
  })

  it('says which line is wrong: a canvas that is not a colour', () => {
    const text = themeFileText({ ...NORD, seeds: { ...NORD.seeds, canvas: 'blue' } })
    const r = readThemeFile(text)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const line = text.split('\n').findIndex((l) => l.includes('"canvas": "blue"')) + 1
    expect(r.line).toBe(line)
    expect(fileErrorText(r)).toBe(`Line ${line}: canvas is not a colour.`)
  })

  it('refuses a file over 64 KB before reading it', () => {
    expect(readThemeFile('{}', MAX_THEME_FILE_BYTES + 1)).toMatchObject({ ok: false, message: 'The file is larger than 64 KB.' })
  })

  it('an imported theme gets a new id and a free name', () => {
    expect(importedDraft(NORD, ['Nord'], 'th-new')).toMatchObject({ id: 'th-new', name: 'Nord (2)' })
  })
})
