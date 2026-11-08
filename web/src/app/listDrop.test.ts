import { describe, expect, it } from 'vitest'
import { dragFeedback, dropIndent, dropTarget, dropZone, sameDrop } from './listDrop'
import { gapDepths, gapTarget, pointedDepth } from './task-list/dropDepth'

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
    expect(sameDrop({ id: 'a', zone: 'after', depth: 0 }, { id: 'a', zone: 'after', depth: 1 })).toBe(false)
  })
})

describe('drop depth in a tree list (drop-depth)', () => {
  // D, A > B > C, E: the issue's tree, D being dragged.
  const rows = {
    a: { id: 'a', parent: null, depth: 0 },
    b: { id: 'b', parent: 'a', depth: 1 },
    c: { id: 'c', parent: 'b', depth: 2 },
    e: { id: 'e', parent: null, depth: 0 },
  }
  const rowOf = (id: string) => rows[id as keyof typeof rows]

  it('a gap reaches from the row below to one deeper than the row above', () => {
    expect(gapDepths(rows.c, rows.e)).toEqual({ min: 0, max: 3 })
    expect(gapDepths(rows.a, rows.b)).toEqual({ min: 1, max: 1 })
    expect(gapDepths(rows.c, null)).toEqual({ min: 0, max: 3 })
    expect(gapDepths(null, rows.a)).toEqual({ min: 0, max: 0 })
  })

  it('moving straight down keeps the level; sideways steps one level per indent', () => {
    const range = gapDepths(rows.c, rows.e)
    expect(pointedDepth(0, 0, 24, range)).toBe(0)
    expect(pointedDepth(0, 20, 24, range)).toBe(0)
    expect(pointedDepth(0, 30, 24, range)).toBe(1)
    expect(pointedDepth(0, 48, 24, range)).toBe(2)
    expect(pointedDepth(0, 400, 24, range)).toBe(3)
    expect(pointedDepth(2, -100, 24, range)).toBe(0)
  })

  it('places after the ancestor at the depth, or inside the row above one level deeper', () => {
    expect(gapTarget(rows.c, rows.e, 0, rowOf)).toEqual({ parent_id: null, at: { after: 'a' } })
    expect(gapTarget(rows.c, rows.e, 1, rowOf)).toEqual({ parent_id: 'a', at: { after: 'b' } })
    expect(gapTarget(rows.c, rows.e, 2, rowOf)).toEqual({ parent_id: 'b', at: { after: 'c' } })
    expect(gapTarget(rows.c, rows.e, 3, rowOf)).toEqual({ parent_id: 'c', at: 'bottom' })
    // Right under a parent whose subtasks show: first among them.
    expect(gapTarget(rows.a, rows.b, 1, rowOf)).toEqual({ parent_id: 'a', at: { before: 'b' } })
    // At the top of a group: before the first row.
    expect(gapTarget(null, rows.a, 0, rowOf)).toEqual({ parent_id: null, at: { before: 'a' } })
  })

  it('the line starts at the checkbox of a row at the depth, capped like the row indent', () => {
    expect(dropIndent(0, 3)).toBe('2rem')
    expect(dropIndent(2, 3)).toBe('5rem')
    expect(dropIndent(5, 3)).toBe('6.5rem')
  })
})

describe('drag feedback (ux-overhaul)', () => {
  it('lifts with elevation and scale, an opacity change only under reduced motion; the line has a dot at its start', () => {
    expect(dragFeedback(false).lift).toContain('shadow-2')
    expect(dragFeedback(false).lift).toContain('scale-')
    expect(dragFeedback(true).lift).toBe('opacity-60')
    expect(dragFeedback(true).lift).not.toContain('scale-')
    expect(dragFeedback(false).line).toContain('before:rounded-full')
    expect(dragFeedback(false).line).toContain('bg-accent')
    expect(dragFeedback(false).inside).toBe('ring-2 ring-accent')
  })
})
