// The heatmap ramp (OpenSpec change stats-dashboard, task 3.1): index.css mixes
// five steps from the chart base into the surface with color-mix(in oklab). This
// test reads the accents and surfaces from index.css, mixes them the same way, and
// checks the data-viz rules for a sequential ramp in light and dark: lightness runs
// one way, neighbouring steps are told apart, the "none" step differs from the
// surface, and the strongest step reaches 3:1 against the surface.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

type Lab = [number, number, number]
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function oklab(hex: string): Lab {
  const [r, g, b] = hexRgb(hex).map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function toHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, fromLin(c))) * 255).toString(16).padStart(2, '0')).join('')
}
/** color-mix(in oklab, a p, b). */
const mix = (a: string, p: number, b: string) => { const x = oklab(a); const y = oklab(b); return toHex([0, 1, 2].map((i) => x[i] * p + y[i] * (1 - p)) as Lab) }
const deltaE = (a: string, b: string) => { const x = oklab(a); const y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100 }
const luminance = (hex: string) => { const [r, g, b] = hexRgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** The step percentages of index.css, read back so the test follows the file. */
function steps(): number[] {
  return [2, 3, 4].map((n) => Number(new RegExp(`--ot-chart-seq-${n}: color-mix\\(in oklab, var\\(--ot-chart-base\\) (\\d+)%`).exec(css)![1]) / 100)
}
const faintMix = () => Number(/--ot-chart-seq-1: color-mix\(in oklab, var\(--ot-faint\) (\d+)%/.exec(css)![1]) / 100
const accents = [...css.matchAll(/\[data-accent="([a-z]+)"\] \{([^}]*)\}/g)].map(([, name, body]) => {
  const v = (k: string) => new RegExp(`--ot-${k}: (#[0-9a-f]{6})`).exec(body)![1]
  return { name, light: v('al-accent'), dark: v('ad-accent-text') }
})
const MODES = { light: { surface: '#ffffff', faint: '#5f6e82' }, dark: { surface: '#0f172a', faint: '#8695aa' } } as const

function ramp(base: string, mode: keyof typeof MODES): string[] {
  const { surface, faint } = MODES[mode]
  return [mix(faint, faintMix(), surface), ...steps().map((p) => mix(base, p, surface)), base]
}

describe('chart ramp per accent', () => {
  it('reads every built-in accent', () => {
    expect(accents.map((a) => a.name)).toEqual(['emerald', 'blue', 'indigo', 'violet', 'rose', 'orange', 'teal', 'graphite'])
  })

  for (const a of accents) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${a.name} in ${mode}: ordered, distinguishable, and the top step reaches 3:1`, () => {
        const r = ramp(mode === 'light' ? a.light : a.dark, mode)
        const L = r.map((hex) => oklab(hex)[0])
        // Light: darker means more; dark: lighter means more.
        for (let i = 1; i < 5; i++) expect(mode === 'light' ? L[i] < L[i - 1] : L[i] > L[i - 1]).toBe(true)
        expect(deltaE(r[1], r[0])).toBeGreaterThanOrEqual(8)
        // The coloured steps 2–5 are the magnitude ramp (the dataviz validator's ordinal
        // rules): lightness gaps of at least 0.06 and the light end clears the surface at 2:1.
        for (let i = 2; i < 5; i++) expect(Math.abs(L[i] - L[i - 1])).toBeGreaterThanOrEqual(0.06)
        expect(contrast(r[1], MODES[mode].surface)).toBeGreaterThanOrEqual(2)
        // Step 1 is "none": neutral, but still visible on the surface.
        expect(deltaE(r[0], MODES[mode].surface)).toBeGreaterThanOrEqual(4)
        expect(contrast(r[4], MODES[mode].surface)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
