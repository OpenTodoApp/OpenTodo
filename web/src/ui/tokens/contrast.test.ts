import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { contrast } from './contrast'
import { ACCENT_TOKENS } from './accents'
import { parseAccents, parseThemes } from './css'
import { GLYPH_PAIRS, PAIRS } from './pairs'

// OpenSpec design-system "Accessible contrast in both themes".
const { light, darkAttr } = parseThemes(css)

describe('token contrast', () => {
  for (const [theme, tokens] of [['light', light], ['dark', darkAttr]] as const) {
    it(`every pair meets its minimum in ${theme}`, () => {
      const failures = [...PAIRS, ...GLYPH_PAIRS].flatMap(({ fg, bg, min, kind }) => {
        if (!(fg in tokens) || !(bg in tokens)) return [`${fg} on ${bg}: token missing in ${theme}`]
        const ratio = contrast(tokens[fg], tokens[bg])
        return ratio + 1e-9 >= min ? [] : [`${fg} on ${bg} (${kind}) in ${theme}: ${ratio.toFixed(2)}:1, needs ${min}:1`]
      })
      expect(failures).toEqual([])
    })
  }

  // theming D5: every accent in both modes meets the pairs that involve an accent token.
  const accentPairs = [...PAIRS, ...GLYPH_PAIRS].filter((p) => (ACCENT_TOKENS as readonly string[]).includes(p.fg) || (ACCENT_TOKENS as readonly string[]).includes(p.bg))
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
