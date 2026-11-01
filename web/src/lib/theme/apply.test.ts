// @vitest-environment happy-dom
// Applying a theme (theme-engine D4, task 5.1): one generated rule on the root, the
// high-contrast presentation winning over it, the theme's kind on data-theme, shape
// and type applied, nothing written for the OpenTodo themes, and no way for a
// document to add a declaration.
import { beforeEach, describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { block, SELECTORS } from '../../ui/tokens/css'
import { applyTheme, readThemeCache, themeCss, themeHash, THEME_CACHE_KEY, validApplied, writeThemeCache, type AppliedTheme } from './apply'
import { resolveDocument, toApplied } from './load'
import { deriveTheme } from './derive'
import { parseTheme, type ThemeDocument } from './format'
import { CSS_TOKENS } from './tokens'

const root = () => document.documentElement
const value = (n: string) => getComputedStyle(root()).getPropertyValue(`--ot-${n}`).trim()

const NORD: ThemeDocument = {
  opentodoTheme: 1, id: 'nord-like', name: 'Nord-like', author: 'Example', licence: 'MIT', kind: 'dark',
  seeds: { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' },
  shape: { radius: { card: 4 } }, type: { family: 'system', list: 14 },
}
const nord = (): AppliedTheme => toApplied(deriveTheme(NORD), 'h1')

beforeEach(() => {
  for (const a of ['data-theme', 'data-ot-theme', 'data-contrast']) root().removeAttribute(a)
  document.head.innerHTML = ''
  localStorage.clear()
})

describe('applyTheme', () => {
  it("sets the theme's tokens on the root, with its kind on data-theme", () => {
    const t = nord()
    applyTheme(t)
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(root().getAttribute('data-ot-theme')).toBe('nord-like')
    expect(document.querySelectorAll('style#ot-theme')).toHaveLength(1)
    expect(value('canvas')).toBe(t.tokens.canvas)
    expect(value('radius-card')).toBe('4px')
    expect(value('text-list')).toBe('0.875rem')
    expect(value('font')).toMatch(/^ui-sans-serif/)
  })

  it('lets the high-contrast override win over the theme, and keeps shape and type', () => {
    const style = document.createElement('style')
    style.textContent = `${SELECTORS.hcLight.slice(0, -1)}{${block(css, SELECTORS.hcLight).body}} ${SELECTORS.hcDarkAttr.slice(0, -1)}{${block(css, SELECTORS.hcDarkAttr).body}}`
    document.head.append(style)
    applyTheme(nord())
    root().setAttribute('data-contrast', 'high')
    expect(value('canvas')).toBe('oklch(0 0 0)')
    expect(value('text')).toBe('oklch(1 0 0)')
    expect(value('radius-card')).toBe('4px')
    root().removeAttribute('data-contrast')
    expect(value('canvas')).toBe(nord().tokens.canvas)
  })

  it('removes the sheet for an OpenTodo theme', () => {
    applyTheme(nord())
    applyTheme(null)
    expect(document.getElementById('ot-theme')).toBeNull()
    expect(root().hasAttribute('data-ot-theme')).toBe(false)
  })

  it('writes only known token names and formatted values: a hostile cache adds no declaration', () => {
    const t = nord()
    const hostile = { ...t, tokens: { ...t.tokens, canvas: 'red;background:url(https://example.com/x)', 'x}body{display:none': 'oklch(0 0 0)' }, font: 'x;}body{display:none' }
    const sheet = themeCss(hostile as AppliedTheme)
    expect(sheet).not.toContain('url(')
    expect(sheet).not.toContain('display')
    expect(sheet).not.toContain('--ot-canvas')
    expect(validApplied(hostile)).toBe(false)
  })

  it('cannot be reached from a document that carries CSS: the validator refuses it first', () => {
    const r = parseTheme(JSON.stringify({ ...NORD, seeds: { ...NORD.seeds, canvas: 'url(https://example.com/x.png)' } }))
    expect(r.ok).toBe(false)
    expect(resolveDocument({ ...NORD, tokens: { muted: 'var(--ot-text)' } })).toBeNull()
  })

  it('serialises every token of the closed list', () => {
    const sheet = themeCss(nord())
    for (const n of CSS_TOKENS) expect(sheet, n).toContain(`--ot-${n}:`)
  })
})

describe('the ot.theme cache', () => {
  it('round-trips both sides and drops a malformed one', () => {
    const t = nord()
    writeThemeCache({ dark: t })
    expect(readThemeCache()).toEqual({ dark: t })
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ dark: { ...t, tokens: { canvas: 'url(x)' } }, light: t }))
    expect(readThemeCache()).toEqual({})
    writeThemeCache({})
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull()
  })

  it('hashes the document and the derivation version', () => {
    expect(themeHash('{"a":1}', 1)).toBe(themeHash('{"a":1}', 1))
    expect(themeHash('{"a":1}', 1)).not.toBe(themeHash('{"a":1}', 2))
    expect(themeHash('{"a":1}', 1)).not.toBe(themeHash('{"a":2}', 1))
  })

  it('keeps a cached result whose hash still matches, and re-derives otherwise', () => {
    const first = resolveDocument(NORD)!
    expect(resolveDocument(NORD, first)).toBe(first)
    expect(resolveDocument({ ...NORD, seeds: { ...NORD.seeds, accent: '#bf616a' } }, first)).not.toBe(first)
  })

  it('reads a newer format as nothing to apply', () => {
    expect(resolveDocument({ ...NORD, opentodoTheme: 2 })).toBeNull()
  })
})
