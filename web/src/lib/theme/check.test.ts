// The runtime contrast check of a theme (theme-engine D10, task 2.3): the pairs of
// pairs.ts on a resolved theme, naming the pair and both ratios. contrast.test.ts
// asserts it agrees with the CI gate on every shipped theme and the sweep.
import { describe, expect, it } from 'vitest'
import { checkTheme, describeFailure } from './check'
import { deriveTheme } from './derive'
import type { ThemeDocument } from './format'

const DOC: ThemeDocument = {
  opentodoTheme: 1, id: 'paper', name: 'Paper', author: '', licence: '', kind: 'light',
  seeds: { canvas: '#f4f1ea', surface: '#fffdf8', text: '#26231e', accent: '#2f6fb0' },
}

describe('checkTheme', () => {
  it('finds nothing on a derived theme', () => {
    expect(checkTheme(deriveTheme(DOC))).toEqual([])
  })

  it('reports faint on canvas with the measured and the required ratio', () => {
    const t = deriveTheme({ ...DOC, tokens: { faint: '#9a958c' } })
    const f = checkTheme(t).find((x) => x.fg === 'faint' && x.bg === 'canvas')!
    expect(f).toMatchObject({ theme: 'paper', fg: 'faint', bg: 'canvas', kind: 'text', min: 4.5 })
    expect(f.ratio).toBeLessThan(4.5)
    expect(describeFailure(f)).toMatch(/^paper: faint on canvas \(text\) \d\.\d\d:1, needs 4\.5:1$/)
  })

  it('composites a translucent token over the surface before measuring', () => {
    const t = deriveTheme(DOC)
    const glassy = { ...t, tokens: { ...t.tokens, 'accent-soft': 'oklch(0.5 0.1 250 / 0.1)' } }
    expect(checkTheme(glassy).filter((f) => f.bg === 'accent-soft')).toEqual([])
  })
})
