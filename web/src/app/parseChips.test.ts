// The quick-add priority chip with a renamed level (OpenSpec change priority-names,
// scenario "Quick add with a renamed level"): p1 still sets priority 1, and the
// chip reads the level's name.
import { describe, expect, it } from 'vitest'
import { parse } from '../lib/nlp/parse'
import { setPriorityNames } from '../lib/priority'
import { chipText } from './ParseChips'

const ctx = { today: '2026-10-09', now: '10:00', languages: ['en'], projects: [] }

describe('the priority chip', () => {
  it('reads "Must" for p1 once level 1 is named, "P1" before', () => {
    const line = parse('Pay rent p1', ctx)
    const chip = line.chips.find((c) => c.kind === 'priority')!
    expect(line.priority).toBe(1)
    expect(line.title).toBe('Pay rent')
    expect(chipText(chip, [], [])).toBe('P1')
    setPriorityNames(['Must', '', '', ''])
    expect(chipText(chip, [], [])).toBe('Must')
  })
})
