// @vitest-environment happy-dom
// Contrast and motion presentation (OpenSpec accessibility-aaa D3; appearance-preferences
// "Appearance preferences"; design-system "High-contrast and no-motion presentation").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPresentation, currentPresentation, readPresentation, restorePresentation, systemWantsContrast } from './presentation'

type Listener = () => void

/** A fake `matchMedia` for the more-contrast query whose answer tests can flip. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  const mql = {
    get matches() { return matches },
    media: '(prefers-contrast: more)',
    addEventListener: (_: string, l: Listener) => { listeners.add(l) },
    removeEventListener: (_: string, l: Listener) => { listeners.delete(l) },
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return { set(v: boolean) { matches = v; for (const l of listeners) l() }, listeners }
}

const root = () => document.documentElement

beforeEach(() => { root().removeAttribute('data-contrast'); root().removeAttribute('data-motion') })
afterEach(() => { vi.unstubAllGlobals() })

describe('readPresentation', () => {
  it('reads the two values and treats anything else as the default without changing it', () => {
    expect(readPresentation('high', 'none')).toEqual({ contrast: 'high', motion: 'none' })
    expect(readPresentation(undefined, undefined)).toEqual({ contrast: 'auto', motion: 'system' })
    expect(readPresentation('', '')).toEqual({ contrast: 'auto', motion: 'system' })
    expect(readPresentation('maximum', 'reduced')).toEqual({ contrast: 'auto', motion: 'system' })
  })
})

describe('applyPresentation', () => {
  it('sets the attributes for high contrast and no motion and clears them for the defaults', () => {
    fakeMatchMedia(false)
    applyPresentation({ contrast: 'high', motion: 'none' })
    expect(root().getAttribute('data-contrast')).toBe('high')
    expect(root().getAttribute('data-motion')).toBe('none')
    applyPresentation({ contrast: 'auto', motion: 'system' })
    expect(root().hasAttribute('data-contrast')).toBe(false)
    expect(root().hasAttribute('data-motion')).toBe(false)
  })

  it('under auto follows the system request for more contrast, also when it changes later', () => {
    const system = fakeMatchMedia(true)
    expect(systemWantsContrast()).toBe(true)
    applyPresentation({ contrast: 'auto', motion: 'system' })
    expect(root().getAttribute('data-contrast')).toBe('high')
    system.set(false)
    expect(root().hasAttribute('data-contrast')).toBe(false)
    system.set(true)
    expect(root().getAttribute('data-contrast')).toBe('high')
    // One listener, however often the presentation is applied.
    applyPresentation({ contrast: 'auto', motion: 'none' })
    expect(system.listeners.size).toBe(1)
  })

  it('restores the preference after a display route removed the attributes', () => {
    fakeMatchMedia(false)
    applyPresentation({ contrast: 'high', motion: 'none' })
    root().removeAttribute('data-contrast')
    root().removeAttribute('data-motion')
    restorePresentation()
    expect(root().getAttribute('data-contrast')).toBe('high')
    expect(root().getAttribute('data-motion')).toBe('none')
    expect(currentPresentation()).toEqual({ contrast: 'high', motion: 'none' })
  })

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    applyPresentation({ contrast: 'auto', motion: 'system' })
    expect(root().hasAttribute('data-contrast')).toBe(false)
    applyPresentation({ contrast: 'high', motion: 'system' })
    expect(root().getAttribute('data-contrast')).toBe('high')
  })
})

describe('the pre-paint script (public/appearance.js)', () => {
  it('applies the cached contrast and motion before the app loads, and the system request under auto', async () => {
    const { readFileSync } = await import('node:fs')
    const script = readFileSync('public/appearance.js', 'utf8')
    const run = () => new Function(script)()
    fakeMatchMedia(false)
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'emerald', bar: '#0f172a', contrast: 'high', motion: 'none' }))
    run()
    expect(root().getAttribute('data-contrast')).toBe('high')
    expect(root().getAttribute('data-motion')).toBe('none')
    root().removeAttribute('data-contrast'); root().removeAttribute('data-motion')
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'light', accent: 'emerald', bar: '#0f172a', contrast: 'auto', motion: 'system' }))
    run()
    expect(root().hasAttribute('data-contrast')).toBe(false)
    expect(root().hasAttribute('data-motion')).toBe(false)
    fakeMatchMedia(true)
    run()
    expect(root().getAttribute('data-contrast')).toBe('high')
    localStorage.clear()
  })
})
