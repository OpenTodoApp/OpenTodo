import { describe, expect, it } from 'vitest'
import { dropTarget, dropZone, sameDrop } from './listDrop'

describe('drop placement (manual-ordering)', () => {
  it('quarters with nesting, halves without', () => {
    expect(dropZone(102, 100, 40, true)).toBe('before')
    expect(dropZone(120, 100, 40, true)).toBe('inside')
    expect(dropZone(138, 100, 40, true)).toBe('after')
    expect(dropZone(115, 100, 40, false)).toBe('before')
    expect(dropZone(125, 100, 40, false)).toBe('after')
  })

  it('maps a zone to a container and place', () => {
    const row = { id: 'x', parent: 'p', expanded: false }
    expect(dropTarget(row, 'before')).toEqual({ parent_id: 'p', at: { before: 'x' } })
    expect(dropTarget(row, 'after')).toEqual({ parent_id: 'p', at: { after: 'x' } })
    expect(dropTarget(row, 'inside')).toEqual({ parent_id: 'x', at: 'bottom' })
    // Below an expanded parent the item becomes its first child.
    expect(dropTarget({ ...row, expanded: true }, 'after')).toEqual({ parent_id: 'x', at: 'top' })
  })

  it('compares indicators', () => {
    expect(sameDrop(null, null)).toBe(true)
    expect(sameDrop({ id: 'a', zone: 'before' }, { id: 'a', zone: 'before' })).toBe(true)
    expect(sameDrop({ id: 'a', zone: 'before' }, { id: 'a', zone: 'after' })).toBe(false)
  })
})
