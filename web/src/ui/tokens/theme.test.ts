import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { ACCENTS, DARK_BAR } from './accents'
import { parseAccentMapping, parseAccents, parseConstants, parseThemes } from './css'
import { HUE_NAMES } from './pairs'
import { resolveToken, toHex } from './resolve'

// OpenSpec design-system "Semantic design tokens": both themes define every token,
// and the dark values are the same whether they come from the system preference or
// from data-theme="dark" (the workbench, or a future theme setting).
describe('theme blocks', () => {
  const { light, darkMedia, darkAttr, lightTokens, darkTokens } = parseThemes(css)

  it('data-theme="dark" resolves the dark surface', () => {
    expect(darkAttr.surface).toBe('oklch(0.1959 0.0062 271.09)')
    expect(toHex(resolveToken(lightTokens, 'surface'))).toBe('#ffffff')
  })

  it('the two dark blocks are identical', () => {
    expect(darkMedia).toEqual(darkAttr)
  })

  it('every light token has a dark value', () => {
    expect(Object.keys(darkAttr).sort()).toEqual(Object.keys(light).sort())
  })

  it('the dark variant matches both conditions', () => {
    const variant = css.slice(css.indexOf('@custom-variant dark'), css.indexOf('@theme inline {'))
    expect(variant).toContain('[data-theme="dark"] *')
    expect(variant).toContain('prefers-color-scheme: dark')
    expect(variant).toContain(':not([data-theme="light"], [data-theme="light"] *)')
  })

  // theming D5, D6; tokens-v2 D4
  const accents = parseAccents(css)
  const DECLARED = ['al-accent', 'ad-accent-text', 'a-on-accent']
  /**
   * Derived accent steps replaced by an explicit value (tokens-v2 D4), each next to a
   * comment in index.css naming the pair: graphite's dark buttons. Raise this only
   * together with that comment.
   */
  const ACCENT_OVERRIDES = ['graphite ad-accent']

  it('the CSS defines exactly the accents of accents.ts, in order, emerald first and no red', () => {
    expect(Object.keys(accents)).toEqual(ACCENTS.map((a) => a.id))
    expect(ACCENTS).toHaveLength(8)
    expect(ACCENTS[0].id).toBe('emerald')
    expect(ACCENTS.map((a) => a.id as string)).not.toContain('red')
  })

  it('every accent declares its three values, and the overrides are the counted ones', () => {
    const overrides: string[] = []
    for (const a of ACCENTS) {
      const keys = Object.keys(accents[a.id].declared)
      for (const k of DECLARED) expect(keys, `${a.id} ${k}`).toContain(k)
      overrides.push(...keys.filter((k) => !DECLARED.includes(k)).map((k) => `${a.id} ${k}`))
    }
    expect(overrides).toEqual(ACCENT_OVERRIDES)
  })

  it('each override sits next to a comment naming why', () => {
    for (const o of ACCENT_OVERRIDES) {
      const [id, token] = o.split(' ')
      const line = css.split('\n').find((l) => l.startsWith(`[data-accent="${id}"]`))!
      expect(line).toMatch(new RegExp(`/\\* override: [^*]+\\*/ --ot-${token}:`))
    }
  })

  it('the bar colour of each accent is its resolved light accent, and the dark bar is the dark canvas', () => {
    for (const a of ACCENTS) expect(a.bar, a.id).toBe(toHex(resolveToken(accents[a.id].light, 'accent')))
    expect(DARK_BAR).toBe(toHex(resolveToken(darkTokens, 'canvas')))
  })

  it('emerald is the base theme unchanged', () => {
    for (const t of ['accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-soft', 'accent-soft-text', 'focus']) {
      expect(toHex(resolveToken(accents.emerald.light, t)), `light ${t}`).toBe(toHex(resolveToken(lightTokens, t)))
      expect(toHex(resolveToken(accents.emerald.dark, t)), `dark ${t}`).toBe(toHex(resolveToken(darkTokens, t)))
    }
  })

  it('the mapping blocks on [data-accent] derive exactly as the mode blocks do', () => {
    const map = parseAccentMapping(css)
    const accentKeys = Object.keys(map.light)
    expect(accentKeys.length).toBeGreaterThanOrEqual(7)
    for (const k of accentKeys) {
      expect(map.light[k], k).toBe(light[k])
      expect(map.darkAttr[k], k).toBe(darkAttr[k])
    }
    expect(map.darkMedia).toEqual(map.darkAttr)
  })

  // tokens-v2 D5: one solid per hue and mode, the rest derived (no overrides today).
  it('every hue declares one solid per mode and derives its soft and text steps', () => {
    for (const [mode, tokens] of [['light', light], ['dark', darkAttr]] as const) {
      for (const h of HUE_NAMES) {
        expect(tokens[`hue-${h}-solid`], `${mode} ${h}`).toMatch(/^oklch\(/)
        expect(tokens[`hue-${h}-soft`], `${mode} ${h}`).toMatch(new RegExp(`^color-mix\\(in oklab, var\\(--ot-hue-${h}-solid\\) var\\(--ot-mix-hue-soft-${mode}\\)`))
        expect(tokens[`hue-${h}-text`], `${mode} ${h}`).toMatch(new RegExp(`^color-mix\\(in oklch, var\\(--ot-hue-${h}-solid\\) var\\(--ot-mix-hue-text-${mode}\\)`))
      }
    }
  })

  it('the derivation ratios are declared once, as percentages', () => {
    const constants = parseConstants(css)
    const ratios = Object.entries(constants).filter(([k]) => k.startsWith('mix-'))
    expect(ratios.length).toBe(10) // ten accent and hue steps; the sidebar tint is retired (precision-tokens D1)
    for (const [k, v] of ratios) expect(v, k).toMatch(/^\d{1,3}%$/)
  })

  // appearance-preferences "A theme changes only the accent": neutrals never follow the theme.
  it('neutrals keep their values in every accent', () => {
    const neutrals = ['canvas', 'surface', 'raised', 'sunken', 'text-strong', 'text', 'muted', 'faint', 'border', 'border-soft', 'border-input']
    for (const a of ACCENTS) {
      for (const n of neutrals) {
        expect(toHex(resolveToken(accents[a.id].dark, n)), `${a.id} dark ${n}`).toBe(toHex(resolveToken(darkTokens, n)))
        expect(toHex(resolveToken(accents[a.id].light, n)), `${a.id} light ${n}`).toBe(toHex(resolveToken(lightTokens, n)))
      }
    }
  })
})
