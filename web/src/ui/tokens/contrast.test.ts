import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { resolveToken, toHex, tokenContrast } from './resolve'
import { ACCENT_TOKENS } from './accents'
import { parseAccents, parseContrastOverride, parseThemes } from './css'
import { GLYPH_PAIRS, OVERRIDE_PAIRS, PAIRS, type Pair } from './pairs'

// OpenSpec design-system "Accessible contrast in both themes".
const { lightTokens: light, darkTokens: darkAttr } = parseThemes(css)

describe('token contrast', () => {
  for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
    it(`every pair meets its minimum in ${theme}`, () => {
      const failures = [...PAIRS, ...GLYPH_PAIRS].flatMap(({ fg, bg, min, kind }) => {
        if (!(fg in tokens) || !(bg in tokens)) return [`${fg} on ${bg}: token missing in ${theme}`]
        const ratio = tokenContrast(tokens, fg, bg)
        return ratio + 1e-9 >= min ? [] : [`${fg} on ${bg} (${kind}) in ${theme}: ${ratio.toFixed(2)}:1, needs ${min}:1`]
      })
      expect(failures).toEqual([])
    })
  }

  // theming D5: every accent in both modes meets the pairs that involve an accent token.
  // The sidebar surface mixes the accent in (sidebar-v2 D8), so its pairs count as accent pairs.
  const accentDerived: readonly string[] = [...ACCENT_TOKENS, 'sidebar']
  const accentPairs = [...PAIRS, ...GLYPH_PAIRS].filter((p) => accentDerived.includes(p.fg) || accentDerived.includes(p.bg))
  for (const [name, a] of Object.entries(parseAccents(css))) {
    for (const [mode, tokens] of [['light', a.light], ['dark', a.dark]] as const) {
      it(`the ${name} accent meets every accent pair in ${mode}`, () => {
        const failures = accentPairs.flatMap(({ fg, bg, min, kind }) => {
          const ratio = tokenContrast(tokens, fg, bg)
          return ratio + 1e-9 >= min ? [] : [`${name} ${mode}: ${fg} on ${bg} (${kind}) ${ratio.toFixed(2)}:1, needs ${min}:1`]
        })
        expect(failures).toEqual([])
      })
    }
  }

  it('checks all 12 chip pairs', () => {
    expect(PAIRS.filter((p) => p.kind === 'chip')).toHaveLength(12)
  })
})

// OpenSpec display-mode D4, design-system "High-contrast and no-motion presentation".
describe('high-contrast override', () => {
  const hc = parseContrastOverride(css)

  /** Every failing pair of an override in a mode, naming the pair, the override and the ratio. */
  function failures(override: string, mode: string, tokens: Record<string, string>, pairs: Pair[]): string[] {
    return pairs.flatMap(({ fg, bg, min, kind }) => {
      if (!(fg in tokens) || !(bg in tokens)) return [`${override} ${mode}: ${fg} on ${bg}: token missing`]
      const ratio = tokenContrast(tokens, fg, bg)
      return ratio + 1e-9 >= min ? [] : [`${override} ${mode}: ${fg} on ${bg} (${kind}) ${ratio.toFixed(2)}:1, needs ${min}:1`]
    })
  }

  for (const [mode, tokens] of [['light', hc.light], ['dark', hc.dark]] as const) {
    it(`every pair meets the raised minimum in ${mode}`, () => {
      expect(failures('contrast-high', mode, tokens, OVERRIDE_PAIRS['contrast-high'])).toEqual([])
    })
  }

  it('uses pure white and pure black surfaces', () => {
    const hex = (tokens: Record<string, string>, t: string) => toHex(resolveToken(tokens, t))
    for (const s of ['canvas', 'surface', 'raised', 'sunken']) {
      expect(hex(hc.light, s)).toBe('#ffffff')
      expect(hex(hc.dark, s)).toBe('#000000')
    }
    expect(hex(hc.light, 'text')).toBe('#000000')
    expect(hex(hc.dark, 'text')).toBe('#ffffff')
  })

  it('replaces soft tints with the surface', () => {
    for (const [mode, tokens] of [['light', hc.light], ['dark', hc.dark]] as const) {
      const soft = Object.keys(tokens).filter((k) => /-soft$/.test(k) && k !== 'border-soft')
      expect(soft.length, mode).toBeGreaterThan(10)
      for (const k of soft) expect(toHex(resolveToken(tokens, k)), `${mode} ${k}`).toBe(toHex(resolveToken(tokens, 'surface')))
    }
  })

  it('keeps the two dark blocks identical', () => {
    expect(hc.raw.darkMedia).toEqual(hc.raw.darkAttr)
  })

  it('measures text at 7:1 and names a failing pair with the override and the ratio', () => {
    const pairs = OVERRIDE_PAIRS['contrast-high']
    expect(pairs.filter((p) => p.kind === 'text').every((p) => p.min >= 7)).toBe(true)
    expect(pairs.filter((p) => p.kind === 'ui').every((p) => p.min >= 3)).toBe(true)
    // A contributor lowers a text token to about 6:1: the check names it.
    const broken = { ...hc.light, muted: 'oklch(0.53 0 0)' }
    const found = failures('contrast-high', 'light', broken, pairs.filter((p) => p.fg === 'muted' && p.bg === 'surface'))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(/^contrast-high light: muted on surface \(text\) 5\.\d\d:1, needs 7:1$/)
  })
})
