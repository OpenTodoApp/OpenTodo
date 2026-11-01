// The custom accent derivation (OpenSpec change accent-colour, design D2, D8): the
// pinned vectors, the stylesheet values it reads, the red guard's constant and the
// hex field's normalisation. The sweep over many inputs, measured through the real
// resolver, is in ui/tokens/contrast.test.ts.
import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'
import { parseAccents, parseConstants, parseThemes } from '../ui/tokens/css'
import { resolveToken, toHex } from '../ui/tokens/resolve'
import { ACCENT_PAIRS, BASE_TOKENS, deriveAccent, MIX, normalizeHex, RED_GUARD, redDistance } from './accentDerive'
import vectors from './accent.vectors.json'
import { ACCENT_SWATCHES } from '../ui/tokens/accentSwatches'

describe('deriveAccent vectors', () => {
  for (const v of vectors.vectors) {
    it(`${v.input} (${v.note})`, () => {
      const d = deriveAccent(v.input)
      expect({ light: d.light, dark: d.dark, on: d.on, button: d.button ?? null, adjusted: d.adjusted }).toEqual({ light: v.light, dark: v.dark, on: v.on, button: v.button, adjusted: v.adjusted })
    })
  }

  it('covers the inputs of design D8', () => {
    const inputs = vectors.vectors.map((v) => v.input)
    for (const a of ['#047857', '#1d4ed8', '#4338ca', '#6d28d9', '#be123c', '#c2410c', '#0f766e', '#334155', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#000080', '#000000', '#ffffff', '#808080', '#ffc0cb', '#d93025', '#ffe066']) {
      expect(inputs).toContain(a)
    }
  })

  it('keeps a pick that already passes, and says when it moved', () => {
    expect(deriveAccent('#047857')).toMatchObject({ light: '#047857', adjusted: { lightness: false, hue: false } })
    expect(deriveAccent('#ffe066').adjusted).toEqual({ lightness: true, hue: false })
    expect(deriveAccent('#d93025').adjusted.hue).toBe(true)
  })

  it('is deterministic and the same for every spelling of a colour', () => {
    expect(deriveAccent('#1F6FEB')).toEqual(deriveAccent('#1f6feb'))
    expect(deriveAccent('#fff')).toEqual(deriveAccent('#ffffff'))
  })

  it('refuses what is not a colour', () => {
    expect(() => deriveAccent('blue')).toThrow()
  })
})

describe('the stylesheet values the derivation uses', () => {
  const themes = parseThemes(css)

  it('BASE_TOKENS are the mode tokens of index.css', () => {
    for (const [mode, tokens] of [['light', themes.light], ['dark', themes.darkAttr]] as const) {
      for (const [name, [L, C, H]] of Object.entries(BASE_TOKENS[mode])) {
        expect(tokens[name], `${mode} ${name}`).toBe(`oklch(${L} ${C} ${H})`)
      }
    }
  })

  it('MIX holds the --ot-mix-* ratios', () => {
    const c = parseConstants(css)
    const pct = (k: string) => Number(c[k].replace('%', '')) / 100
    expect(MIX).toEqual({
      hover: pct('mix-accent-hover'), softLight: pct('mix-accent-soft-light'), softTextLight: pct('mix-accent-soft-text-light'),
      focusLight: pct('mix-accent-focus-light'), softDark: pct('mix-accent-soft-dark'), softTextDark: pct('mix-accent-soft-text-dark'),
    })
  })

  it('the accent steps are derived as the derivation models them', () => {
    // A change to a formula here must change accentTokens() in accentDerive.ts too.
    expect(themes.light).toMatchObject({
      'accent-hover': 'color-mix(in oklch, var(--ot-accent) var(--ot-mix-accent-hover), oklch(0 0 0))',
      'accent-text': 'var(--ot-accent)',
      'accent-soft': 'color-mix(in oklab, var(--ot-accent) var(--ot-mix-accent-soft-light), var(--ot-surface))',
      'accent-soft-text': 'color-mix(in oklch, var(--ot-accent) var(--ot-mix-accent-soft-text-light), oklch(0 0 0))',
      focus: 'color-mix(in oklch, var(--ot-accent) var(--ot-mix-accent-focus-light), oklch(1 0 0))',
      sidebar: 'var(--ot-canvas)',
    })
    expect(themes.darkAttr).toMatchObject({
      accent: 'var(--ot-ad-accent, var(--ot-al-accent, oklch(0.5081 0.1049 165.61)))',
      'accent-text': 'var(--ot-ad-accent-text, oklch(0.7729 0.1535 163.22))',
      'accent-soft': 'color-mix(in oklab, var(--ot-accent-text) var(--ot-mix-accent-soft-dark), var(--ot-surface))',
      'accent-soft-text': 'color-mix(in oklch, var(--ot-accent-text) var(--ot-mix-accent-soft-text-dark), oklch(1 0 0))',
      focus: 'var(--ot-accent-text)',
      sidebar: 'var(--ot-canvas)',
    })
  })

  it('measures every accent pair, and only base tokens it knows', () => {
    expect(ACCENT_PAIRS.length).toBeGreaterThan(20)
    const known = new Set([...Object.keys(BASE_TOKENS.light), 'accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-soft', 'accent-soft-text', 'focus', 'sidebar'])
    for (const p of ACCENT_PAIRS) {
      expect(known.has(p.fg), p.fg).toBe(true)
      expect(known.has(p.bg), p.bg).toBe(true)
    }
  })

  it('the red guard is Rose\'s own smallest distance, rounded down', () => {
    const rose = parseAccents(css).rose
    const light = redDistance('light', toHex(resolveToken(rose.light, 'accent')))
    const dark = redDistance('dark', toHex(resolveToken(rose.dark, 'accent-text')))
    expect(RED_GUARD.light).toBe(Math.floor(light * 100) / 100)
    expect(RED_GUARD.dark).toBe(Math.floor(dark * 100) / 100)
  })
})

describe('the picker swatches', () => {
  it('are 18 distinct colours, each applied as shown', () => {
    expect(new Set(ACCENT_SWATCHES).size).toBe(18)
    for (const s of ACCENT_SWATCHES) {
      const d = deriveAccent(s)
      expect(d.light, s).toBe(s)
      expect(d.adjusted, s).toEqual({ lightness: false, hue: false })
    }
  })
})

describe('normalizeHex', () => {
  it('accepts rgb and rrggbb with or without #, in any case', () => {
    expect(normalizeHex('#1F6FEB')).toBe('#1f6feb')
    expect(normalizeHex('1f6feb')).toBe('#1f6feb')
    expect(normalizeHex(' #abc ')).toBe('#aabbcc')
    expect(normalizeHex('ABC')).toBe('#aabbcc')
  })

  it('refuses anything else', () => {
    for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', 'red', '#ggg', 'rgb(0,0,0)']) expect(normalizeHex(bad), bad).toBeNull()
  })
})

// theme-engine task 2.1: the search's base tokens are a parameter; the default is OpenTodo's.
describe('base tokens as a parameter', () => {
  it('gives the vectors with the default base and another answer on other surfaces', () => {
    expect(deriveAccent('#1f6feb', BASE_TOKENS)).toEqual(deriveAccent('#1f6feb'))
    const grey = { light: { ...BASE_TOKENS.light, canvas: [0.9, 0, 0] as [number, number, number], muted: [0.38, 0, 0] as [number, number, number], faint: [0.4, 0, 0] as [number, number, number] }, dark: BASE_TOKENS.dark }
    expect(deriveAccent('#1f6feb', grey).light).not.toBe(deriveAccent('#1f6feb').light)
  })
})
