import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { contrast } from './contrast'
import { ACCENT_TOKENS } from './accents'
import { parseAccents, parseThemes } from './css'
import { PAIRS } from './pairs'

// OpenSpec design-system "Accessible contrast in both themes".
const { light, darkAttr } = parseThemes(css)

describe('token contrast', () => {
  for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
    it(`every pair meets its minimum in ${theme}`, () => {
      const failures = PAIRS.flatMap(({ fg, bg, min, kind }) => {
        if (!(fg in tokens) || !(bg in tokens)) return [`${fg} on ${bg}: token missing in ${theme}`]
        const ratio = contrast(tokens[fg], tokens[bg])
        return ratio + 1e-9 >= min ? [] : [`${fg} on ${bg} (${kind}) in ${theme}: ${ratio.toFixed(2)}:1, needs ${min}:1`]
      })
      expect(failures).toEqual([])
    })
  }

  // theming D5: every accent in both modes meets the pairs that involve an accent token.
  const accentPairs = PAIRS.filter((p) => (ACCENT_TOKENS as readonly string[]).includes(p.fg) || (ACCENT_TOKENS as readonly string[]).includes(p.bg))
  for (const [name, a] of Object.entries(parseAccents(css))) {
    for (const [mode, tokens] of [['light', a.light], ['dark', a.dark]] as const) {
      it(`the ${name} accent meets every accent pair in ${mode}`, () => {
        const failures = accentPairs.flatMap(({ fg, bg, min, kind }) => {
          const ratio = contrast(tokens[fg], tokens[bg])
          return ratio + 1e-9 >= min ? [] : [`${name} ${mode}: ${fg} on ${bg} (${kind}) ${ratio.toFixed(2)}:1, needs ${min}:1`]
        })
        expect(failures).toEqual([])
      })
    }
  }

  it('checks all 12 chip pairs', () => {
    expect(PAIRS.filter((p) => p.kind === 'chip')).toHaveLength(12)
  })
})

// display-mode D4: the high-contrast override on top of each mode reaches 7:1 for
// text (3:1 for marks and borders stays the floor).
function overrideBlock(source: string, selector: string): Record<string, string> {
  const at = source.indexOf(`${selector} {`)
  if (at < 0) return {}
  const body = source.slice(at, source.indexOf('}', at))
  return Object.fromEntries([...body.matchAll(/--ot-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}
describe('high contrast override', () => {
  for (const [mode, base, selector] of [
    ['light', light, ':root[data-contrast="high"]'],
    ['dark', darkAttr, ':root[data-contrast="high"][data-theme="dark"]'],
  ] as const) {
    it(`every pair meets 7:1 for text in ${mode}`, () => {
      const over = overrideBlock(css, selector)
      expect(Object.keys(over).length).toBeGreaterThan(40)
      const tokens = { ...base, ...over }
      const failures = PAIRS.flatMap(({ fg, bg, min, kind }) => {
        const need = kind === 'ui' ? Math.max(3, min) : 7
        const ratio = contrast(tokens[fg], tokens[bg])
        return ratio + 1e-9 >= need ? [] : [`${fg} on ${bg} (${kind}) high ${mode}: ${ratio.toFixed(2)}:1, needs ${need}:1`]
      })
      expect(failures).toEqual([])
    })
  }
})
