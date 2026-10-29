import { describe, expect, it } from 'vitest'
import { nameKey } from './filter/evaluate'
import { fieldSortBy, fieldSortName, isFieldSortBy, type FieldDef } from './types'
import { fieldSortOptions } from './fieldSortOptions'

const field = (id: string, name: string, type: string, deleted_at: number | null = null): FieldDef => ({ id, name, type, deleted_at, project_id: 'p', options: '', position: 0, created_at: 0, _clock: {} })

describe('field sort names and choices', () => {
  it('uses filter normalization and keeps client parsing tolerant of sync values', () => {
    expect(fieldSortName(fieldSortBy(' Score '))).toBe(nameKey(' Score '))
    expect(fieldSortName('field: padded ')).toBe('padded')
    expect(isFieldSortBy('field:' + 'a'.repeat(101))).toBe(true)
    for (const value of [null, 7, 'title', 'field:', 'field:  ']) expect(fieldSortName(value)).toBeNull()
  })
  it('offers only live sortable fields once and preserves the selected stored value', () => {
    const fields = [field('a', 'Score', 'number'), field('b', 'score', 'date'), field('c', 'Words', 'text'), field('d', 'Gone', 'number', 1)]
    expect(fieldSortOptions(fields, 'field:SCORE')).toEqual([{ label: 'Score', value: 'field:SCORE' }])
    expect(fieldSortOptions(fields, 'field:Old')).toEqual([{ label: 'Score', value: 'field:Score' }, { label: 'old', value: 'field:Old' }])
    expect(fieldSortOptions([], 'title')).toEqual([])
  })
})
