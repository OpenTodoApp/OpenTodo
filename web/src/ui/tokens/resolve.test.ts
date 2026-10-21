import { describe, expect, it } from 'vitest'
import { composite, hexToOklch, parseRgba, ratioOf, resolveToken, substitute, toHex, tokenContrast } from './resolve'

// OpenSpec change tokens-v2, task 1.1: the resolver the contrast check relies on.
/** Equal within one 8-bit step per channel (a .5 value may round either way after the OKLab round trip). */
const near = (hex: string, want: string) => {
  const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [ch(hex), ch(want)]
  expect(a.every((v, i) => Math.abs(v - b[i]) <= 1), `${hex} vs ${want}`).toBe(true)
}

describe('colour resolver', () => {
  it('reads OKLCH white, black and a known colour', () => {
    expect(toHex(parseRgba('oklch(1 0 0)'))).toBe('#ffffff')
    expect(toHex(parseRgba('oklch(0 0 0)'))).toBe('#000000')
    // #047857 (emerald 700) round-trips through its OKLCH value.
    expect(toHex(parseRgba(hexToOklch('#047857')))).toBe('#047857')
    expect(toHex(parseRgba('oklch(62.8% 0.2577 29.23)'))).toBe('#ff0000')
  })

  it('mixes 50/50 in OKLab and in sRGB like the browser', () => {
    near(toHex(parseRgba('color-mix(in srgb, #ff0000, #0000ff)')), '#800080')
    // Black and white mixed in OKLab land at L 0.5 (#636363).
    expect(toHex(parseRgba('color-mix(in oklab, #000000 50%, #ffffff)'))).toBe('#636363')
  })

  it('keeps the hue when mixing toward white or black in OKLCH', () => {
    const tint = parseRgba('color-mix(in oklch, #047857 10%, oklch(1 0 0))')
    const shade = parseRgba('color-mix(in oklch, #047857 86%, oklch(0 0 0))')
    expect(hexToOklch(toHex(tint), 1)).toMatch(/ 1[56]\d(\.\d)?\)$/)
    expect(hexToOklch(toHex(shade), 1)).toMatch(/ 1[56]\d(\.\d)?\)$/)
  })

  it('composites alpha over black and over white', () => {
    const half = parseRgba('oklch(1 0 0 / 0.5)')
    near(toHex(composite(half, parseRgba('#000000'))), '#808080')
    const quarterBlack = parseRgba('rgb(0 0 0 / 0.25)')
    expect(toHex(composite(quarterBlack, parseRgba('#ffffff')))).toBe('#bfbfbf')
  })

  it('follows var() chains and fallbacks', () => {
    const tokens: Record<string, string> = { a: 'var(--ot-b)', b: 'oklch(1 0 0)', c: 'var(--ot-missing, #000000)' }
    expect(substitute('var(--ot-a)', (n) => tokens[n])).toBe('oklch(1 0 0)')
    expect(toHex(resolveToken(tokens, 'c'))).toBe('#000000')
  })

  it('measures a translucent token over its background', () => {
    const tokens = { surface: 'oklch(0.22 0.018 262)', border: 'oklch(1 0 0 / 0.1)', text: 'oklch(1 0 0)' }
    expect(tokenContrast(tokens, 'border', 'surface')).toBeGreaterThan(1.1)
    expect(ratioOf(parseRgba('#ffffff'), parseRgba('#000000'))).toBeCloseTo(21, 5)
  })
})
