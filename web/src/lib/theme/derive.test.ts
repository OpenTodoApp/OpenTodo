// The derivation (theme-engine D3, task 2.2): OpenTodo's own seeds reproduce every
// default token of index.css in both modes; a theme of four seeds is complete and
// passes its pairs; explicit values are kept; the result is pinned by
// derive.vectors.json (UPDATE_THEME_VECTORS=1 rewrites it).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { parseRgba, toHex } from '../../ui/tokens/resolve'
import { composite } from '../colourMath'
import { deriveTheme, radiusScale, type ResolvedTheme } from './derive'
import { checkTheme } from './check'
import { modeTokens } from './generate'
import { CSS_TOKENS } from './tokens'
import type { ThemeDocument, ThemeKind } from './format'
import { SWEEP, sweepDocument } from './sweep'

const seedsOnly = (kind: ThemeKind): ThemeDocument => {
  const doc = JSON.parse(readFileSync(join(__dirname, `builtin/opentodo-${kind}.json`), 'utf8')) as ThemeDocument
  const { tokens: _t, ...rest } = doc
  return rest as ThemeDocument
}

/** The colour a token draws: translucent values over the surface, as #rrggbb with the alpha appended. */
function drawn(tokens: Record<string, string>, name: string): string {
  const lookup = (n: string) => tokens[n]
  const c = parseRgba(tokens[name], lookup)
  return c.a >= 1 ? toHex(c) : `${toHex(composite(c, parseRgba(tokens.surface, lookup)))}@${c.a.toFixed(2)}`
}

describe('derivation from seeds', () => {
  for (const kind of ['light', 'dark'] as const) {
    it(`OpenTodo's ${kind} seeds reproduce every default token of index.css`, () => {
      const got = deriveTheme(seedsOnly(kind))
      const sheet = modeTokens(css, kind)
      const diff = CSS_TOKENS.filter((n) => drawn(got.tokens, n) !== drawn(sheet, n)).map((n) => `${n}: derived ${drawn(got.tokens, n)} (${got.tokens[n]}), stylesheet ${drawn(sheet, n)}`)
      expect(diff).toEqual([])
      expect(got.adjusted).toEqual([])
    })
  }

  it('a light theme of four seeds with a pale yellow accent is complete and passes every pair', () => {
    const doc: ThemeDocument = { opentodoTheme: 1, id: 'pale', name: 'Pale', author: '', licence: '', kind: 'light',
      seeds: { canvas: '#f6f4ee', surface: '#ffffff', text: '#22201c', accent: '#f6e27a' } }
    const t = deriveTheme(doc)
    expect(Object.keys(t.tokens).sort()).toEqual([...CSS_TOKENS].sort())
    expect(checkTheme(t)).toEqual([])
    // The accent keeps its yellow hue at a lightness that reads.
    const h = Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(t.tokens.accent)![1])
    expect(h).toBeGreaterThan(80)
    expect(h).toBeLessThan(110)
    expect(t.adjusted).toContain('accent')
  })

  it('keeps an explicit value as written, even when it fails a pair', () => {
    const doc: ThemeDocument = { ...sweepDocument(SWEEP[0]), tokens: { muted: '#9a9a9a' } }
    const t = deriveTheme(doc)
    expect(toHex(parseRgba(t.tokens.muted))).toBe('#9a9a9a')
    expect(checkTheme(t).some((f) => f.fg === 'muted')).toBe(true)
  })

  it('ignores an unknown token', () => {
    const doc: ThemeDocument = { ...sweepDocument(SWEEP[3]), tokens: { 'hue-amber': '#ffbf00' } }
    expect(Object.keys(deriveTheme(doc).tokens)).not.toContain('hue-amber')
  })

  it('fills a partial radius scale in proportion to the nearest given step', () => {
    expect(radiusScale({ card: 4 })).toEqual({ chip: 3, control: 4, card: 4, surface: 5, popover: 6 })
    expect(radiusScale({ chip: 0, popover: 20 })).toEqual({ chip: 0, control: 0, card: 0, surface: 17, popover: 20 })
  })

  it('maps type to a font stack and a list size, never a remote font', () => {
    const base = sweepDocument(SWEEP[1])
    expect(deriveTheme({ ...base, type: { family: { local: 'JetBrains Mono' }, list: 14 } })).toMatchObject({ font: expect.stringMatching(/^"JetBrains Mono", ui-sans-serif/), list: 14 })
    expect(deriveTheme({ ...base, type: { family: 'inter', list: 13 } })).not.toHaveProperty('font')
  })

  it('the sweep exercises the searches: pale accents and middle-band tones move', () => {
    const moved = SWEEP.map((s) => deriveTheme(sweepDocument(s)).adjusted)
    expect(moved.filter((a) => a.includes('accent')).length).toBeGreaterThan(50)
    expect(moved.filter((a) => a.some((n) => n !== 'accent')).length).toBeGreaterThan(20)
  })

  // Task 2.4: the derivation runs when a theme is chosen or edited, on the device; the
  // budget is 5 ms a theme, measured over the sweep after a warm-up (the CI runner is
  // no faster than a mid-range phone for this single-threaded work). Each theme's cost
  // is the fastest of five runs, so a garbage collection or the other test workers
  // taking the CPU for a moment (which once failed this under load) do not count as the
  // derivation's own time; the average of those costs must stay under 5 ms. (A bound on
  // the slowest theme was tried and dropped: one preemption longer than five runs of a
  // theme is common on a loaded runner.)
  it('derives a theme in under 5 ms', () => {
    const docs = SWEEP.map(sweepDocument)
    for (const d of docs.slice(0, 20)) deriveTheme(d)
    const costs = docs.map((d) => {
      let best = Infinity
      for (let run = 0; run < 5; run++) {
        const t0 = performance.now()
        deriveTheme(d)
        best = Math.min(best, performance.now() - t0)
      }
      return best
    })
    const each = costs.reduce((a, b) => a + b, 0) / costs.length
    expect(each, `${each.toFixed(2)} ms a theme`).toBeLessThan(5)
  })

  it('is deterministic', () => {
    const doc = sweepDocument(SWEEP[7])
    expect(deriveTheme(doc)).toEqual(deriveTheme(JSON.parse(JSON.stringify(doc))))
  })
})

describe('derive.vectors.json', () => {
  const file = join(__dirname, 'derive.vectors.json')
  const vectors: Record<string, ResolvedTheme> = {}
  for (const kind of ['light', 'dark'] as const) vectors[`opentodo-${kind} seeds`] = deriveTheme(seedsOnly(kind))
  for (const i of [0, 1, 2, 3, 50, 99, 100, 150, 199]) vectors[`sweep ${i}`] = deriveTheme(sweepDocument(SWEEP[i]))
  const body = JSON.stringify(vectors, null, 1) + '\n'
  it('pins the derived values', () => {
    if (process.env.UPDATE_THEME_VECTORS === '1') writeFileSync(file, body)
    expect(existsSync(file) ? readFileSync(file, 'utf8') : '(missing)', 'derive.vectors.json is stale: UPDATE_THEME_VECTORS=1 npx vitest run src/lib/theme/derive.test.ts').toBe(body)
  })
})
