// The link scanner's offsets: indices into the text it was given (noteLinkGrammar.ts).
import { describe, expect, it } from 'vitest'
import { linksIn } from './noteLinkGrammar'

describe('linksIn offsets', () => {
  it('index the text as given, also when its lines end with CRLF or CR', () => {
    for (const eol of ['\n', '\r\n', '\r']) {
      const text = `first line${eol}see [the note](?note=n-1) here${eol}last line`
      const [link] = linksIn(text)
      expect(text.slice(link.at, link.end)).toBe('[the note](?note=n-1)')
    }
  })
})
