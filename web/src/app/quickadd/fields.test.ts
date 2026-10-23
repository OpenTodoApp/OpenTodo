// The quick-add palette's field rows as a view of the parsed line (OpenSpec change
// palette-quick-add, design D2).
import { describe, expect, it } from 'vitest'
import type { Chip } from '../../lib/nlp'
import { chipRange, fieldOf, fieldRows, startToken } from './fields'

const chip = (kind: Chip['kind'], value: unknown, spans: [number, number, string][], key = `${kind}:${spans[0][0]}`): Chip =>
  ({ kind, value, key, spans: spans.map(([start, end, text]) => ({ start, end, text })) }) as unknown as Chip

describe('fieldRows', () => {
  it('lists the five base fields once each when the line sets nothing', () => {
    expect(fieldRows([]).map((r) => [r.kind, !!r.chip])).toEqual([
      ['when', false], ['project', false], ['label', false], ['priority', false], ['estimate', false],
    ])
  })

  it('fills set fields, one row per label, and adds the set extras after the base fields', () => {
    const chips = [
      chip('priority', 2, [[20, 22, 'p2']]),
      chip('label', 'call', [[10, 15, '@call']]),
      chip('label', 'home', [[16, 21, '@home']]),
      chip('recurrence', 'every monday', [[0, 12, 'every monday']]),
      chip('evening', true, [[23, 35, 'this evening']]),
    ]
    const rows = fieldRows(chips)
    expect(rows.map((r) => [r.kind, r.chipIndex])).toEqual([
      ['when', 4], ['project', undefined], ['label', 1], ['label', 2], ['priority', 0], ['estimate', undefined], ['recurrence', 3],
    ])
  })

  it('due, someday and evening are all When', () => {
    expect(['due', 'someday', 'evening'].map((k) => fieldOf(k as Chip['kind']))).toEqual(['when', 'when', 'when'])
    expect(fieldOf('deadline')).toBe('deadline')
  })
})

describe('startToken', () => {
  it('starts the token at the end after one space', () => {
    expect(startToken('Buy primer', 'project')).toEqual({ value: 'Buy primer #', caret: 12 })
    expect(startToken('Buy primer  ', 'label')).toEqual({ value: 'Buy primer @', caret: 12 })
    expect(startToken('Pay rent', 'priority').value).toBe('Pay rent p')
    expect(startToken('Draft', 'estimate').value).toBe('Draft +')
  })

  it('an empty line gets the bare token; When moves the caret after a space', () => {
    expect(startToken('', 'project')).toEqual({ value: '#', caret: 1 })
    expect(startToken('Pay rent', 'when')).toEqual({ value: 'Pay rent ', caret: 9 })
  })
})

describe('chipRange', () => {
  it('spans from the first word to the last', () => {
    expect(chipRange(chip('reminder', null, [[20, 26, 'remind'], [30, 34, 'at 9']]))).toEqual({ start: 20, end: 34 })
  })
})
