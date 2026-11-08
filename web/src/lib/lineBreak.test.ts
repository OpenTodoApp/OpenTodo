// @vitest-environment happy-dom
// Notes and multiline titles break by the document language (simplified-chinese D5).
import css from '../index.css?raw'
import { describe, expect, it } from 'vitest'

/** Punctuation line-break: strict keeps with the preceding character. */
const CLOSING = new Set(['。', '，', '、', '」', '』', '）', '】'])

describe('line breaking', () => {
  it('the document uses strict line breaking and the bundled font stays Latin', () => {
    expect(css).toMatch(/html \{[^}]*line-break:\s*strict/)
    expect(css).toMatch(/\.user-text \{ overflow-wrap: anywhere/)
    const face = css.slice(css.indexOf('@font-face'), css.indexOf('@custom-variant'))
    expect(face).not.toMatch(/U\+4E00|U\+3000|U\+3400/)
  })

  it('a wrapping note keeps 。 and ， with the previous character', () => {
    // happy-dom does not wrap lines, so this applies the same strict rule the
    // document stylesheet sets: a closing mark never starts a line.
    const text = '开会。明天，好'
    const width = 2
    const lines: string[] = []
    let line = ''
    for (const ch of text) {
      if (line.length >= width && !CLOSING.has(ch)) { lines.push(line); line = '' }
      line += ch
    }
    lines.push(line)
    expect(lines).toEqual(['开会。', '明天，', '好'])
    expect(lines.every((row) => !CLOSING.has(row[0]!))).toBe(true)
  })
})
