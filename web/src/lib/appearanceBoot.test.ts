// @vitest-environment happy-dom
// The boot script public/appearance.js (theming D7, accent-colour D4, task 3.2): it
// applies the cached appearance before the app module runs, a custom accent from
// its cached derived values without deriving, and ignores a malformed cache.
import { beforeEach, describe, expect, it } from 'vitest'
import script from '../../public/appearance.js?raw'

const boot = () => new Function(script)()
const root = () => document.documentElement
const prop = (n: string) => root().style.getPropertyValue(n)
const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])

beforeEach(() => {
  for (const a of ['data-theme', 'data-accent', 'style']) root().removeAttribute(a)
  for (const m of [...document.head.querySelectorAll('meta')]) m.remove()
  localStorage.clear()
})

describe('appearance.js', () => {
  it('applies a built-in theme and its bar', () => {
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'teal', bar: '#0f766e' }))
    boot()
    expect(root().getAttribute('data-theme')).toBe('light')
    expect(root().getAttribute('data-accent')).toBe('teal')
    expect(metas()).toEqual([['#0f766e', '']])
  })

  it('applies a cached custom accent before the app runs: the inline inputs, data-accent and the derived bar', () => {
    const custom = { input: '#000080', light: '#011f94', dark: '#5085fd', on: '#ffffff', button: '#2857cb' }
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'custom', bar: custom.light, custom }))
    boot()
    expect(root().getAttribute('data-accent')).toBe('custom')
    expect(prop('--ot-al-accent')).toBe('#011f94')
    expect(prop('--ot-ad-accent-text')).toBe('#5085fd')
    expect(prop('--ot-a-on-accent')).toBe('#ffffff')
    expect(prop('--ot-ad-accent')).toBe('#2857cb')
    expect(metas()).toEqual([['#011f94', '']])
  })

  it('ignores a malformed custom cache: the default accent and bar', () => {
    const custom = { input: '#000080', light: 'url(x)', dark: '#5085fd', on: '#ffffff' }
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'custom', bar: '#011f94', custom }))
    boot()
    expect(root().hasAttribute('data-accent')).toBe(false)
    expect(prop('--ot-al-accent')).toBe('')
    expect(metas()).toEqual([['#0f172a', '']])
  })

  it('survives bad JSON', () => {
    localStorage.setItem('ot.appearance', '{')
    boot()
    expect(root().hasAttribute('data-accent')).toBe(false)
  })
})
