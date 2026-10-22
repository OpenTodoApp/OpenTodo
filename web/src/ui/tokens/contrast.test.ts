import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { lightness, resolveToken, toHex, tokenContrast } from './resolve'
import { ACCENT_TOKENS } from './accents'
import { parseAccents, parseContrastOverride, parseThemes } from './css'
import { DERIVED_TOKENS, GLYPH_PAIRS, OVERRIDE_PAIRS, PAIRS, TEXT_MIN, type Pair } from './pairs'
import { EXCEPTION_MIN, exceptionFor, registeredMin } from '../a11y/exceptions'

// OpenSpec design-system "Accessible contrast in both themes" (7:1 for text, the
// exceptions register the only way below it; accessibility-aaa D1, D2).
const themes = parseThemes(css)
const light = { ...themes.lightTokens, ...DERIVED_TOKENS }
const darkAttr = { ...themes.darkTokens, ...DERIVED_TOKENS }

/** A pair's minimum in the default look: its own, lowered to 4.5:1 only by a register entry. */
const minOf = ({ fg, bg, min, kind }: Pair) => (kind === 'ui' ? min : registeredMin(fg, bg, min))

describe('token contrast', () => {
  for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
    it(`every pair meets its minimum in ${theme}`, () => {
      const failures = [...PAIRS, ...GLYPH_PAIRS].flatMap((p) => {
        const { fg, bg, kind } = p
        const min = minOf(p)
        if (!(fg in tokens) || !(bg in tokens)) return [`${fg} on ${bg}: token missing in ${theme}`]
        const ratio = tokenContrast(tokens, fg, bg)
        return ratio + 1e-9 >= min ? [] : [`${fg} on ${bg} (${kind}) in ${theme}: ${ratio.toFixed(2)}:1, needs ${min}:1`]
      })
      expect(failures).toEqual([])
    })
  }

  it('never lowers a text or chip minimum in the pair list: the register is the only way below 7:1', () => {
    const lowered = [...PAIRS, ...GLYPH_PAIRS].filter((p) => p.kind !== 'ui' && p.min < TEXT_MIN).map((p) => `${p.fg} on ${p.bg}`)
    expect(lowered).toEqual([])
  })

  it('passes a registered pair at 4.5:1 and names it when it falls below', () => {
    // The faint tone on the canvas is a register entry (faint-tone): 5.3:1 in light passes.
    expect(exceptionFor('faint', 'canvas')?.id).toBe('faint-tone')
    expect(tokenContrast(light, 'faint', 'canvas')).toBeGreaterThanOrEqual(EXCEPTION_MIN)
    expect(tokenContrast(light, 'faint', 'canvas')).toBeLessThan(TEXT_MIN)
    const broken = { ...light, faint: 'oklch(0.62 0.026 262)' }
    const ratio = tokenContrast(broken, 'faint', 'canvas')
    expect(ratio).toBeLessThan(EXCEPTION_MIN)
    expect(`faint on canvas (text) in light: ${ratio.toFixed(2)}:1, needs ${minOf({ fg: 'faint', bg: 'canvas', min: TEXT_MIN, kind: 'text' })}:1`).toMatch(/needs 4.5:1$/)
  })

  it('keeps the three text tones visibly distinct (at least 0.04 apart in lightness)', () => {
    for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
      const L = (t: string) => lightness(resolveToken(tokens, t))
      expect(Math.abs(L('text') - L('muted')), `${theme}: text vs muted`).toBeGreaterThanOrEqual(0.04)
      expect(Math.abs(L('muted') - L('faint')), `${theme}: muted vs faint`).toBeGreaterThanOrEqual(0.04)
    }
  })

  it('reaches 7:1 with the muted tone on every plain surface', () => {
    for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
      for (const bg of ['canvas', 'surface', 'raised', 'sunken']) expect(tokenContrast(tokens, 'muted', bg), `${theme}: muted on ${bg}`).toBeGreaterThanOrEqual(TEXT_MIN)
    }
  })

  // theming D5: every accent in both modes meets the pairs that involve an accent token.
  // The sidebar surface mixes the accent in (sidebar-v2 D8), so its pairs count as accent pairs.
  const accentDerived: readonly string[] = [...ACCENT_TOKENS, 'sidebar']
  const accentPairs = [...PAIRS, ...GLYPH_PAIRS].filter((p) => accentDerived.includes(p.fg) || accentDerived.includes(p.bg))
  for (const [name, a] of Object.entries(parseAccents(css))) {
    for (const [mode, tokens] of [['light', a.light], ['dark', a.dark]] as const) {
      it(`the ${name} accent meets every accent pair in ${mode}`, () => {
        const failures = accentPairs.flatMap((p) => {
          const { fg, bg, kind } = p
          const min = minOf(p)
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
      expect(failures('contrast-high', mode, { ...tokens, ...DERIVED_TOKENS }, OVERRIDE_PAIRS['contrast-high'])).toEqual([])
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

  it('draws the primary button at 7:1 for every accent (design-system "Primary button in high contrast")', () => {
    for (const [mode, tokens] of [['light', hc.light], ['dark', hc.dark]] as const) {
      for (const bg of ['accent', 'accent-hover']) expect(tokenContrast(tokens, 'on-accent', bg), `${mode}: on-accent on ${bg}`).toBeGreaterThanOrEqual(7)
      for (const t of ['accent-text', 'danger', 'warning', 'success', 'info', 'faint']) expect(tokenContrast(tokens, t, 'surface'), `${mode}: ${t} on surface`).toBeGreaterThanOrEqual(7)
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
