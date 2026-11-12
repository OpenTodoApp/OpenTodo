// @vitest-environment happy-dom
// The names of the priority levels (OpenSpec change priority-names, design D2, D3).
import { describe, expect, it } from 'vitest'
import { applyLanguagePreference } from './i18n'
import {
  customPriorityName, defaultPriorityName, PRIORITY_NAME_MAX, priorityAccessibleName, priorityKeysText, priorityName,
  priorityShort, readPriorityNames, setPriorityNames,
} from './priority'
import { priorityNameValue } from './priorityWrites'

describe('reading the names', () => {
  it('an empty or missing name is the default; a stored one is trimmed to one line', () => {
    expect(readPriorityNames(null)).toEqual(['', '', '', ''])
    expect(readPriorityNames({ priority_name_1: '  Must ', priority_name_2: 'Should\nnow', priority_name_3: '' })).toEqual(['Must', 'Should now', '', ''])
  })

  it('a longer stored value (from a newer client) shows cut with an ellipsis, without changing the row', () => {
    const row = { priority_name_4: 'x'.repeat(30) }
    expect(readPriorityNames(row)[3]).toBe(`${'x'.repeat(PRIORITY_NAME_MAX)}…`)
    expect(row.priority_name_4).toHaveLength(30)
  })

  it('a value this device cannot decrypt, and every value while locked, reads as the default (D7)', () => {
    expect(readPriorityNames({ priority_name_1: '[Cannot decrypt]', _e2ee: { raw: { priority_name_1: 'v1.x' } } })[0]).toBe('')
    expect(readPriorityNames({ priority_name_1: 'Must' }, true)).toEqual(['', '', '', ''])
  })
})

describe('showing a level', () => {
  it('names a renamed level and keeps the default for the others', () => {
    setPriorityNames(['Must', 'Should', '', ''])
    expect(priorityName(1)).toBe('Must')
    expect(priorityName(3)).toBe('Priority 3')
    expect(priorityShort(2)).toBe('Should')
    expect(priorityShort(4)).toBe('None')
    expect(customPriorityName(3)).toBe('')
  })

  it('the accessible name keeps the number after the name', () => {
    setPriorityNames(['Must', '', '', ''])
    expect(priorityAccessibleName(1)).toBe('Must, priority 1')
    expect(priorityAccessibleName(2)).toBe('Priority 2')
  })

  it('the shortcut sheet names the levels on the priority keys only, once one has a name', () => {
    expect(priorityKeysText('list.priority')).toBe('')
    setPriorityNames(['Must', '', '', ''])
    expect(priorityKeysText('list.priority')).toBe(' — 1 Must, 2 Priority 2, 3 Priority 3, 4 No priority')
    expect(priorityKeysText('list.complete')).toBe('')
  })

  it('the default follows the interface language', async () => {
    await applyLanguagePreference('de', ['en-US'])
    expect(defaultPriorityName(1)).toBe('Priorität 1')
    expect(priorityName(4)).toBe('Keine Priorität')
  })
})

describe('writing a name', () => {
  it('stores one trimmed line of at most 24 characters; empty is the default', () => {
    expect(priorityNameValue('  Must  ')).toBe('Must')
    expect(priorityNameValue('a\nb')).toBe('a b')
    expect(priorityNameValue('y'.repeat(30))).toBe('y'.repeat(24))
    expect(priorityNameValue('   ')).toBe('')
  })
})
