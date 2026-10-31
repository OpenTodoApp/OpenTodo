import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { parseRgba, resolveToken, toHex, tokenContrast } from './resolve'
import { ACCENT_TOKENS } from './accents'
import { parseAccents, parseContrastOverride, parseThemes } from './css'
import { DERIVED_TOKENS, GLYPH_PAIRS, OVERRIDE_PAIRS, PAIRS, type Pair } from './pairs'
import { deriveAccent, RED_GUARD, redDistance, type DerivedAccent } from '../../lib/accentDerive'

// OpenSpec design-system "Accessible contrast in both themes".
const themes = parseThemes(css)
const light = { ...themes.lightTokens, ...DERIVED_TOKENS }
const darkAttr = { ...themes.darkTokens, ...DERIVED_TOKENS }

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

  // accent-colour D8, design-system "Custom accent meets every accent contrast pair": a
  // fixed sweep of picked colours, each derived and measured through the real resolver
  // on the stylesheet's own tokens, exactly as a built-in accent above.
  const SWEEP: string[] = [
    ...Array.from({ length: 36 }, (_, i) => i * 10).flatMap((h) =>
      [0.3, 0.5, 0.7, 0.9].flatMap((l) => [0.05, 0.12, 0.25].map((c) => toHex(parseRgba(`oklch(${l} ${c} ${h})`))))),
    '#000000', '#ffffff', '#111111', '#333333', '#555555', '#777777', '#808080', '#999999', '#bbbbbb', '#dddddd',
  ]

  /** The token maps of a derived custom accent in each mode, as [data-accent="custom"] with the inline values would resolve. */
  function customTokens(d: DerivedAccent) {
    const declared: Record<string, string> = { 'al-accent': d.light, 'ad-accent-text': d.dark, 'a-on-accent': d.on, ...(d.button ? { 'ad-accent': d.button } : {}) }
    return { light: { ...light, ...declared }, dark: { ...darkAttr, ...declared } }
  }

  /** Every failing accent pair of a custom accent in a mode, naming the input, the mode, the pair and the ratio. */
  function customFailures(input: string, mode: string, tokens: Record<string, string>): string[] {
    return accentPairs.flatMap(({ fg, bg, min, kind }) => {
      const ratio = tokenContrast(tokens, fg, bg)
      return ratio + 1e-9 >= min ? [] : [`custom ${input} ${mode}: ${fg} on ${bg} (${kind}) ${ratio.toFixed(2)}:1, needs ${min}:1`]
    })
  }

  it(`a custom accent meets every accent pair in both modes, over ${SWEEP.length} picked colours`, () => {
    const failures = SWEEP.flatMap((input) => {
      const d = deriveAccent(input)
      const t = customTokens(d)
      return [...customFailures(input, 'light', t.light), ...customFailures(input, 'dark', t.dark)]
    })
    expect(failures).toEqual([])
  })

  it('a custom accent keeps at least the distance of Rose from the danger and priority-1 colours', () => {
    const near = SWEEP.flatMap((input) => {
      const d = deriveAccent(input)
      return [
        ...(redDistance('light', d.light) >= RED_GUARD.light ? [] : [`custom ${input} light: ${d.light} ΔE ${redDistance('light', d.light).toFixed(2)}`]),
        ...(redDistance('dark', d.dark) >= RED_GUARD.dark ? [] : [`custom ${input} dark: ${d.dark} ΔE ${redDistance('dark', d.dark).toFixed(2)}`]),
      ]
    })
    expect(near).toEqual([])
  })

  it('the eight built-in accents pass the red guard unchanged', () => {
    for (const [name, a] of Object.entries(parseAccents(css))) {
      expect(redDistance('light', toHex(resolveToken(a.light, 'accent'))), `${name} light`).toBeGreaterThanOrEqual(RED_GUARD.light)
      expect(redDistance('dark', toHex(resolveToken(a.dark, 'accent-text'))), `${name} dark`).toBeGreaterThanOrEqual(RED_GUARD.dark)
    }
  })

  it('names the input, the mode, the pair and the ratio when a mix ratio is lowered', () => {
    // A contributor strengthens the dark soft step: text on a custom accent's soft surface falls below 4.5:1.
    const d = deriveAccent('#1f6feb')
    const broken = { ...customTokens(d).dark, 'mix-accent-soft-dark': '40%' }
    const found = customFailures('#1f6feb', 'dark', broken)
    expect(found.length).toBeGreaterThan(0)
    expect(found[0]).toMatch(/^custom #1f6feb dark: [a-z-]+ on accent-soft \(text\) \d\.\d\d:1, needs 4\.5:1$/)
  })

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

  it('a custom accent is black or white there, as every theme (accent-colour D3: only its inputs are set)', () => {
    const d = deriveAccent('#ffe066')
    const declared: Record<string, string> = { 'al-accent': d.light, 'ad-accent-text': d.dark, 'a-on-accent': d.on, 'ad-accent': d.button ?? d.light }
    for (const t of ['accent', 'accent-text', 'focus']) {
      expect(toHex(resolveToken({ ...hc.light, ...declared }, t)), `light ${t}`).toBe('#000000')
      expect(toHex(resolveToken({ ...hc.dark, ...declared }, t)), `dark ${t}`).toBe('#ffffff')
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
