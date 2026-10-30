// OpenSpec change paste-to-tasks, task 1.1: a pasted list as task titles.
import { describe, expect, it } from 'vitest'
import { cleanPastedLine, joinPastedLines, MAX_PASTED_LINES, splitPastedLines } from './pasteLines'

describe('splitPastedLines', () => {
  it.each([
    ['- Milk', 'Milk'],
    ['* Milk', 'Milk'],
    ['+ Milk', 'Milk'],
    ['• Milk', 'Milk'],
    ['‣ Milk', 'Milk'],
    ['◦ Milk', 'Milk'],
    ['1. Milk', 'Milk'],
    ['12) Milk', 'Milk'],
    ['a) Milk', 'Milk'],
    ['B. Milk', 'Milk'],
    ['[ ] Milk', 'Milk'],
    ['[x] Milk', 'Milk'],
    ['- [ ] Milk', 'Milk'],
    ['- [x] Milk', 'Milk'],
    ['* [X] Milk', 'Milk'],
    ['☐ Milk', 'Milk'],
    ['☑ Milk', 'Milk'],
  ])('removes the marker of %j', (line, title) => {
    expect(cleanPastedLine(line)).toBe(title)
  })

  it('removes one marker only and keeps text that merely starts like one', () => {
    expect(cleanPastedLine('- - Milk')).toBe('- Milk')
    expect(cleanPastedLine('-5 degrees outside')).toBe('-5 degrees outside')
    expect(cleanPastedLine('1.5 kg flour')).toBe('1.5 kg flour')
    expect(cleanPastedLine('[link] text')).toBe('[link] text')
  })

  it('a checked box gives an open task: only the title is kept', () => {
    expect(splitPastedLines('- [x] Done already\n- [ ] Still to do')).toEqual(['Done already', 'Still to do'])
  })

  it('splits on CRLF, LF and CR, trims, skips blank and marker-only lines, collapses whitespace', () => {
    expect(splitPastedLines('  Milk  \r\nEggs\rBread\n\n   \n-\n[ ]\n1.\nOlive    oil\tand\tsalt')).toEqual(['Milk', 'Eggs', 'Bread', 'Olive oil and salt'])
  })

  it('counts 0, 1, 2 and 101 lines', () => {
    expect(splitPastedLines('')).toEqual([])
    expect(splitPastedLines('\n \n')).toEqual([])
    expect(splitPastedLines('Only one')).toEqual(['Only one'])
    expect(splitPastedLines('One\nTwo')).toEqual(['One', 'Two'])
    const many = Array.from({ length: 101 }, (_, i) => `- Item ${i + 1}`).join('\n')
    const lines = splitPastedLines(many)
    expect(lines).toHaveLength(101)
    expect(lines.length > MAX_PASTED_LINES).toBe(true)
    expect(lines[100]).toBe('Item 101')
  })

  it('pastes as one line as the browser would: lines joined by spaces, markers kept', () => {
    expect(joinPastedLines('- Milk\r\n\n- Eggs\n')).toBe('- Milk - Eggs')
  })
})
