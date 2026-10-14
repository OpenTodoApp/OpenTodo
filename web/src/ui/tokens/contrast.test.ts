import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'
import { contrast } from './contrast'
import { parseThemes } from './css'
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

  it('checks all 12 chip pairs', () => {
    expect(PAIRS.filter((p) => p.kind === 'chip')).toHaveLength(12)
  })
})
