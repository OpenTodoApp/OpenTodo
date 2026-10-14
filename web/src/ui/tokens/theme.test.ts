import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { parseThemes } from './css'

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
})
