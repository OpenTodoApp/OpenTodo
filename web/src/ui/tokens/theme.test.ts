import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { ACCENT_TOKENS, ACCENTS } from './accents'
import { parseAccents, parseThemes } from './css'

// OpenSpec design-system "Semantic design tokens": both themes define every token,
// and the dark values are the same whether they come from the system preference or
// from data-theme="dark" (the workbench, or a future theme setting).
describe('theme blocks', () => {
  const { light, darkMedia, darkAttr } = parseThemes(css)

  it('data-theme="dark" resolves the dark surface', () => {
    expect(darkAttr.surface).toBe('#0f172a')
    expect(light.surface).toBe('#ffffff')
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

  // theming D5, D6
  const accents = parseAccents(css)

  it('the CSS defines exactly the accents of accents.ts, in order, emerald first and no red', () => {
    expect(Object.keys(accents)).toEqual(ACCENTS.map((a) => a.id))
    expect(ACCENTS).toHaveLength(8)
    expect(ACCENTS[0].id).toBe('emerald')
    expect(ACCENTS.map((a) => a.id as string)).not.toContain('red')
  })

  it('every accent defines all seven tokens in both modes, and its bar colour is its light accent', () => {
    for (const a of ACCENTS) {
      expect(Object.keys(accents[a.id].rawLight).sort()).toEqual([...ACCENT_TOKENS].sort())
      expect(Object.keys(accents[a.id].rawDark).sort()).toEqual([...ACCENT_TOKENS].sort())
      expect(a.bar).toBe(accents[a.id].rawLight.accent)
    }
  })

  it('emerald is the base theme unchanged', () => {
    for (const t of ACCENT_TOKENS) {
      expect(accents.emerald.rawLight[t]).toBe(light[t])
      expect(accents.emerald.rawDark[t]).toBe(darkAttr[t])
    }
  })

  it('the mapping blocks fall back to emerald for every token in both modes', () => {
    for (const t of ACCENT_TOKENS) {
      expect(css).toContain(`--ot-${t}: var(--ot-al-${t}, ${light[t]});`)
      expect(css).toContain(`--ot-${t}: var(--ot-ad-${t}, ${darkAttr[t]});`)
    }
  })
})
