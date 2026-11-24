// @vitest-environment happy-dom
// The boot script public/appearance.js (theming D7, accent-colour D4, task 3.2): it
// applies the cached appearance before the app module runs, a custom accent from
// its cached derived values without deriving, and ignores a malformed cache.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import script from '../../public/appearance.js?raw'
import { themeCss, type AppliedTheme } from './theme/apply'
import { deriveTheme } from './theme/derive'
import { loadInstanceAppliedTheme, toApplied } from './theme/load'
import { readThemeChoices } from './theme/choice'
import { setInstanceThemes } from './theme/choice'

const boot = () => new Function(script)()
const root = () => document.documentElement
const prop = (n: string) => root().style.getPropertyValue(n)
const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])

beforeEach(() => {
  for (const a of ['data-theme', 'data-accent', 'data-ot-theme', 'style']) root().removeAttribute(a)
  for (const m of [...document.head.querySelectorAll('meta, style')]) m.remove()
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
    expect(metas()).toEqual([['#047857', '']])
  })

  it('survives bad JSON', () => {
    localStorage.setItem('ot.appearance', '{')
    boot()
    expect(root().hasAttribute('data-accent')).toBe(false)
  })

  it('leaves the page alone without a cache', () => {
    const m = document.createElement('meta')
    m.name = 'theme-color'
    m.content = '#0f172a'
    document.head.append(m)
    boot()
    expect(metas()).toEqual([['#0f172a', '']])
    expect(root().hasAttribute('data-theme')).toBe(false)
  })
})

// text-size D2, task 1.2: the text size is on the root before the app module runs.
describe('appearance.js text size', () => {
  const setShell = (s: unknown) => { (window as unknown as { opentodoShell?: unknown }).opentodoShell = s }
  beforeEach(() => setShell(undefined))

  it('applies a stored step without an appearance cache', () => {
    localStorage.setItem('opentodo.textSize', 'largest')
    boot()
    expect(prop('--ot-text-scale')).toBe('1.5')
  })

  it('leaves Default and unknown values at the browser size', () => {
    localStorage.setItem('opentodo.textSize', 'huge')
    boot()
    expect(prop('--ot-text-scale')).toBe('')
  })

  it("follows the Android shell's font scale under Default, clamped, and a step overrides it", () => {
    setShell({ platform: 'android', textScale: 3 })
    boot()
    expect(prop('--ot-text-scale')).toBe('2')
    localStorage.setItem('opentodo.textSize', 'large')
    root().removeAttribute('style')
    boot()
    expect(prop('--ot-text-scale')).toBe('1.125')
  })

  it('tells the Android shell the page applies the scale, so its web view stops its own text zoom', () => {
    let applied = 0
    setShell({ platform: 'android', textScale: 1.3, textScaleApplied: () => { applied++ } })
    boot()
    expect(applied).toBe(1)
    expect(prop('--ot-text-scale')).toBe('1.3')
  })

  it("reads the iOS shell's Dynamic Type body size from a probe it removes again", () => {
    setShell({ platform: 'ios' })
    const real = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, p?: string | null) =>
      (el as HTMLElement).style?.cssText?.includes('-apple-system-body') ? ({ fontSize: '21.25px' } as CSSStyleDeclaration) : real(el, p))
    try {
      boot()
      expect(prop('--ot-text-scale')).toBe('1.25')
      expect(document.documentElement.querySelector(':scope > span')).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})

// theme-engine D5, task 5.3: a cached theme is on the root before the app module runs.
describe('appearance.js with a cached theme', () => {
  const palette = (kind: 'light' | 'dark'): AppliedTheme => toApplied(deriveTheme({
    opentodoTheme: 1, id: `test-${kind}`, name: 'Test', author: '', licence: '', kind,
    seeds: kind === 'dark' ? { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' } : { canvas: '#fdf6e3', surface: '#fffdf5', text: '#30363d', accent: '#268bd2' },
    bar: kind === 'dark' ? '#2e3440' : '#268bd2', shape: { radius: { card: 3 } }, type: { family: 'mono', list: 15 }, titleWeight: 600,
  }), 'h')
  const style = () => document.getElementById('ot-theme')?.textContent ?? null

  it('applies the dark side in dark mode: the same rule the app writes, the kind and the bar', () => {
    const dark = palette('dark')
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'teal', bar: '#0f766e' }))
    localStorage.setItem('ot.theme', JSON.stringify({ dark, light: palette('light') }))
    boot()
    expect(style()).toBe(themeCss(dark))
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(root().getAttribute('data-ot-theme')).toBe('test-dark')
    expect(metas()).toEqual([['#2e3440', '']])
  })

  it('under system, picks the side of the system scheme and gives each side its bar', () => {
    const light = palette('light')
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'system', accent: 'emerald', bar: '#047857' }))
    localStorage.setItem('ot.theme', JSON.stringify({ light }))
    boot()
    // happy-dom reports a light scheme.
    expect(style()).toBe(themeCss(light))
    expect(root().getAttribute('data-theme')).toBe('light')
    expect(metas()).toEqual([['#268bd2', '(prefers-color-scheme: light)'], ['#0d0e10', '(prefers-color-scheme: dark)']])
  })

  it('shows the default for a malformed cache, never a partial theme', () => {
    const dark = palette('dark')
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'emerald' }))
    localStorage.setItem('ot.theme', JSON.stringify({ dark: { ...dark, tokens: { ...dark.tokens, surface: 'url(https://example.com/x)' } } }))
    boot()
    expect(style()).toBeNull()
    expect(root().hasAttribute('data-ot-theme')).toBe(false)
    expect(metas()).toEqual([['#0d0e10', '']])
  })

  it('ignores a theme cached for the other side', () => {
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'emerald', bar: '#047857' }))
    localStorage.setItem('ot.theme', JSON.stringify({ light: palette('dark') }))
    boot()
    expect(style()).toBeNull()
  })

  it('survives a broken theme cache', () => {
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'emerald' }))
    localStorage.setItem('ot.theme', '{')
    boot()
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(style()).toBeNull()
  })

  // theme-instance-default D3, task 2.2: an offline start in the house theme.
  it('starts offline in the server default the device resolved before, without reading the server', async () => {
    setInstanceThemes({ version: 2, default: { light: '', dark: 'instance:house1' }, themes: [{ id: 'house1', kind: 'dark', doc: {
      opentodoTheme: 1, id: 'x', name: 'House', author: 'Owner', licence: 'MIT', kind: 'dark',
      seeds: { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' }, bar: '#2e3440',
    } }] })
    // The app resolves the member's empty side through the server default and caches the result.
    const choice = readThemeChoices({ theme_dark: '' } as never).dark
    expect(choice).toMatchObject({ id: 'house1', instance: true, fromDefault: true })
    const applied = (await loadInstanceAppliedTheme(choice.id, undefined, 'dark'))!
    localStorage.setItem('ot.theme', JSON.stringify({ dark: applied }))
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'emerald' }))
    // The next start, offline: the boot script alone puts the house theme on the first frame.
    root().removeAttribute('data-ot-theme')
    boot()
    expect(root().getAttribute('data-ot-theme')).toBe('house1')
    expect(style()).toBe(themeCss(applied))
    expect(metas()).toEqual([['#2e3440', '']])
  })
})
