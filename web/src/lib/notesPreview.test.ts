import { describe, expect, it } from 'vitest'
import { cardNotesPreview, notesPreview, PREVIEW_MAX } from './notesPreview'

// board-polish D6: every block and mark the note editor writes into `description`.
describe('notesPreview', () => {
  const cases: [string, string, string][] = [
    ['empty', '', ''],
    ['plain paragraph', 'Waiting on the quote from Marco', 'Waiting on the quote from Marco'],
    ['heading', '# Plan\n\nCall the bank', 'Plan · Call the bank'],
    ['deep heading', '### Step two', 'Step two'],
    ['bold and italic', 'call **Marco** about _the_ *quote*', 'call Marco about the quote'],
    ['intraword italic', 'un*believ*able', 'unbelievable'],
    ['snake case stays', 'rename user_id later', 'rename user_id later'],
    ['strike', 'the ~~old~~ new plan', 'the old new plan'],
    ['code span', 'run `make check` first', 'run make check first'],
    ['double backtick code', 'type ``a ` b`` here', 'type a ` b here'],
    ['fenced code', '```js\nconst a = 1\n```', 'const a = 1'],
    ['quote', '> ship it\n> today', 'ship it · today'],
    ['link', 'see [the quote](https://example.com/q?a=1) now', 'see the quote now'],
    ['autolink', 'at <https://example.com>', 'at https://example.com'],
    ['image', 'before\n\n![floor plan](attachment:abc123)\n\nafter', 'before · after'],
    ['inline image', 'a ![x](attachment:z) b', 'a b'],
    ['table', 'Costs\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nDone', 'Costs · Done'],
    ['rule', 'one\n\n---\n\ntwo', 'one · two'],
    ['bullets', '- milk\n- eggs\n* bread', 'milk · eggs · bread'],
    ['ordered', '1. first\n2) second', 'first · second'],
    ['checklist', '- [ ] open item\n- [x] done item', 'open item · done item'],
    ['nested list', '- outer\n  - inner', 'outer · inner'],
    ['mention keeps its name', 'ask @Ana about it', 'ask @Ana about it'],
    ['escapes', 'price \\*not\\* bold \\[x\\]', 'price *not* bold [x]'],
    ['whitespace', '  lots    of\tspace  \n\n\n  here ', 'lots of space · here'],
    ['ciphertext', 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ''],
    ['only an image', '![x](attachment:a)', ''],
  ]
  it.each(cases)('%s', (_, input, want) => {
    expect(notesPreview(input)).toBe(want)
  })

  it('reads the spec example', () => {
    const md = '# Plan\n\n- [ ] call **Marco** about the [quote](https://example.com)\n- [x] measure the wall\n\n![wall](attachment:img1)'
    expect(notesPreview(md)).toBe('Plan · call Marco about the quote · measure the wall')
  })

  it('keeps at most 280 characters, on a character boundary', () => {
    const long = '😀'.repeat(400)
    const out = notesPreview(long)
    expect(Array.from(out).length).toBe(PREVIEW_MAX)
    expect(out.endsWith('😀')).toBe(true)
  })

  it('treats null and undefined as no notes', () => {
    expect(notesPreview(null)).toBe('')
    expect(notesPreview(undefined)).toBe('')
  })

  it('memoises per task and description', () => {
    expect(cardNotesPreview('t1', '**a**')).toBe('a')
    expect(cardNotesPreview('t1', '**a**')).toBe('a')
    expect(cardNotesPreview('t1', '_b_')).toBe('b')
    expect(cardNotesPreview('t2', null)).toBe('')
  })
})
