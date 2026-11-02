// The theme format against the shared examples (theme-engine D1, task 1.2):
// internal/themes/testdata holds valid and invalid documents and the code each
// one must give; internal/themes/validate_test.go reads the same files, so the
// app and the server accept and refuse exactly the same documents.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colourError, migrate, MAX_THEME_BYTES, parseTheme, type ThemeDocument } from './format'
import { CSS_TOKENS, THEME_TOKENS, TOKEN_GROUPS } from './tokens'

const dir = join(__dirname, '../../../../internal/themes/testdata')
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, string>

describe('shared theme examples', () => {
  it('has valid and invalid examples', () => {
    const codes = Object.values(expected)
    expect(codes.filter((c) => c === 'ok').length).toBeGreaterThanOrEqual(5)
    expect(codes.filter((c) => c !== 'ok').length).toBeGreaterThanOrEqual(15)
  })

  for (const [file, want] of Object.entries(expected)) {
    it(`${file}: ${want}`, () => {
      const r = parseTheme(readFileSync(join(dir, file), 'utf8'))
      const got = r.ok ? 'ok' : r.error
      expect(got, `${file}: the app answers ${got}, the shared examples say ${want}`).toBe(want)
    })
  }
})

describe('theme format', () => {
  const doc = (): ThemeDocument => JSON.parse(readFileSync(join(dir, 'valid/seeds-only-dark.json'), 'utf8'))

  it('keeps an unknown token in the document', () => {
    const r = parseTheme(readFileSync(join(dir, 'valid/unknown-token-kept.json'), 'utf8'))
    expect(r.ok && r.doc.tokens?.['hue-amber']).toBe('#ffbf00')
  })

  it('refuses a document over 16 KB', () => {
    const big = JSON.stringify({ ...doc(), notes: { text: 'x'.repeat(400) }, tokens: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`x-${i}`, '#000000'])) })
    expect(new TextEncoder().encode(big).length).toBeGreaterThan(MAX_THEME_BYTES)
    expect(parseTheme(big)).toMatchObject({ ok: false, error: 'size' })
  })

  it('accepts only #rrggbb and in-gamut oklch, alpha only where allowed', () => {
    expect(colourError('#88c0d0')).toBeNull()
    expect(colourError('oklch(0.5081 0.1049 165.61)')).toBeNull()
    expect(colourError('oklch(0 0 0 / 0.6)', true)).toBeNull()
    expect(colourError('oklch(0 0 0 / 0.6)')).toBe('alpha')
    expect(colourError('#00000080')).toBe('alpha')
    for (const v of ['url(x)', 'var(--ot-text)', 'red', 'rgb(0 0 0)', '#fff', 'oklch(0.5 0.1)', 'oklch(1.2 0 0)', 'expression(alert(1))', '', 12])
      expect(colourError(v), String(v)).toBe('colour')
    expect(colourError('oklch(0.7 0.35 150)')).toBe('gamut')
  })

  it('migrates format 1 unchanged', () => {
    const d = doc()
    const before = JSON.stringify(d)
    expect(migrate(d)).toEqual(d)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('lists every token once, in groups', () => {
    expect(new Set(THEME_TOKENS).size).toBe(THEME_TOKENS.length)
    expect(TOKEN_GROUPS.labels).toHaveLength(12)
    expect(new Set(CSS_TOKENS).size).toBe(CSS_TOKENS.length)
    expect(CSS_TOKENS).toContain('hue-red-solid')
    expect(CSS_TOKENS).not.toContain('hue-red')
  })
})
