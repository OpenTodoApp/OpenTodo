// The heatmap ramp (OpenSpec change stats-dashboard, task 3.1): index.css mixes
// five steps from the chart base into the surface with color-mix(in oklab). This
// test resolves the real steps for every accent in light and dark with the token
// resolver (tokens-v2 D2) and checks the data-viz rules for a sequential ramp:
// lightness runs one way, neighbouring steps are told apart, the "none" step
// differs from the surface, and the strongest step reaches 3:1 against the surface.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { block, declarations, parseAccents } from '../ui/tokens/css'
import { deltaE, lightness, ratioOf, resolveToken } from '../ui/tokens/resolve'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const ramp = declarations(block(css, ':root, [data-theme], [data-accent] {').body)
const accents = parseAccents(css)

function steps(tokens: Record<string, string>) {
  const all = { ...tokens, ...ramp }
  return { r: [1, 2, 3, 4, 5].map((n) => resolveToken(all, `chart-seq-${n}`)), surface: resolveToken(all, 'surface') }
}

describe('chart ramp per accent', () => {
  it('reads every built-in accent', () => {
    expect(Object.keys(accents)).toEqual(['emerald', 'blue', 'indigo', 'violet', 'rose', 'orange', 'teal', 'graphite'])
  })

  for (const [name, a] of Object.entries(accents)) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${name} in ${mode}: ordered, distinguishable, and the top step reaches 3:1`, () => {
        const { r, surface } = steps(a[mode])
        const L = r.map(lightness)
        // Light: darker means more; dark: lighter means more.
        for (let i = 1; i < 5; i++) expect(mode === 'light' ? L[i] < L[i - 1] : L[i] > L[i - 1]).toBe(true)
        expect(deltaE(r[1], r[0])).toBeGreaterThanOrEqual(8)
        // The coloured steps 2–5 are the magnitude ramp (the dataviz validator's ordinal
        // rules): lightness gaps of at least 0.06 and the light end clears the surface at 2:1.
        for (let i = 2; i < 5; i++) expect(Math.abs(L[i] - L[i - 1])).toBeGreaterThanOrEqual(0.06)
        expect(ratioOf(r[1], surface)).toBeGreaterThanOrEqual(2)
        // Step 1 is "none": neutral, but still visible on the surface.
        expect(deltaE(r[0], surface)).toBeGreaterThanOrEqual(4)
        expect(ratioOf(r[4], surface)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
