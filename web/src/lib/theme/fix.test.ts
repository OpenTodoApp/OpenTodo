// Fix to AA (OpenSpec change theme-editor, task 4.5, design D8).
import { describe, expect, it } from 'vitest'
import light from './builtin/opentodo-light.json'
import { checkTheme } from './check'
import { deriveTheme } from './derive'
import { fixAll, fixPair, pairRatio, pairsOf, withToken } from './fix'
import type { ThemeDocument } from './format'
import { parseOklch } from './oklch'

const LIGHT = { opentodoTheme: 1, id: 'fix', name: 'Fix', author: '', licence: 'CC0-1.0', kind: 'light', seeds: (light as unknown as ThemeDocument).seeds } as ThemeDocument

const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('fixPair', () => {
  it('moves Muted text at its hue until every pair it is in passes', () => {
    const doc = withToken(LIGHT, 'muted', 'oklch(0.72 0.05 250)')
    const failing = checkTheme(deriveTheme(doc)).filter((f) => f.fg === 'muted')
    expect(failing.length).toBeGreaterThan(0)
    const fix = fixPair(doc, failing[0])!
    expect(fix).toMatchObject({ token: 'muted', movedOther: false })
    expect(hueGap(parseOklch(fix.value)!.H, 250)).toBeLessThanOrEqual(1)
    const after = deriveTheme(withToken(doc, 'muted', fix.value))
    expect(checkTheme(after, pairsOf('muted'))).toEqual([])
    expect(pairRatio(after, 'muted', 'canvas')).toBeGreaterThanOrEqual(4.5)
  })

  it('moves the background only when no lightness of the foreground can pass, and says so', () => {
    // Muted is set and must read on the light canvas and on a dark surface at once: no lightness can.
    let doc = withToken(LIGHT, 'muted', 'oklch(0.5 0.08 250)')
    doc = withToken(doc, 'surface', 'oklch(0.3 0 0)')
    const resolved = deriveTheme(doc)
    const f = checkTheme(resolved).find((x) => x.fg === 'muted' && x.bg === 'surface')!
    const fix = fixPair(doc, f, resolved)!
    expect(fix.token).toBe('surface')
    expect(fix.movedOther).toBe(true)
    expect(checkTheme({ ...resolved, tokens: { ...resolved.tokens, surface: fix.value } }, pairsOf('surface'))).toEqual([])
  })

  it('Fix all leaves no pair it can reach failing', () => {
    let doc = withToken(LIGHT, 'muted', 'oklch(0.8 0.05 250)')
    doc = withToken(doc, 'faint', 'oklch(0.85 0.02 250)')
    const { doc: fixed, fixes } = fixAll(doc)
    expect(fixes.map((f) => f.token).sort()).toEqual(['faint', 'muted'])
    expect(checkTheme(deriveTheme(fixed))).toEqual([])
  })
})
