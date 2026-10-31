// OpenSpec change view-manual-order, task 2.1: a page's own order and its planning.
import { describe, expect, it } from 'vitest'
import { compareManual, manualSequence, MAX_VIEW_ORDER, orderRank, planViewOrder, stepAnchor } from './viewOrder'

const task = (id: string, position: number) => ({ id, position, due: null, priority: 4 as const })
const keepAll = () => true

describe('order of a page', () => {
  it('lists placed tasks in the stored order, then the rest by position', () => {
    const tasks = [task('a', 1), task('b', 2), task('c', 3), task('d', 4)]
    expect(manualSequence(tasks, orderRank(['c', 'a']))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('reads a missing or malformed stored value as nothing placed, and lists a task once', () => {
    const tasks = [task('b', 2), task('a', 1), task('a', 1)]
    expect(manualSequence(tasks, orderRank(undefined))).toEqual(['a', 'b'])
    expect(manualSequence(tasks, orderRank('a,b'))).toEqual(['a', 'b'])
    expect(manualSequence(tasks, orderRank([3, 'b']))).toEqual(['b', 'a'])
  })

  it('breaks position ties by due, priority, then id', () => {
    const cmp = compareManual(new Map())
    expect([task('b', 1), task('a', 1)].sort(cmp).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('planViewOrder', () => {
  it('stores the prefix up to the moved task: tasks below stay unplaced', () => {
    // Nothing placed: move d to the top.
    expect(planViewOrder(['a', 'b', 'c', 'd'], [], 'd', { before: 'a' }, keepAll)).toEqual(['d'])
    // Move a below c: b and c above it become placed, d stays unplaced.
    expect(planViewOrder(['a', 'b', 'c', 'd'], [], 'a', { after: 'c' }, keepAll)).toEqual(['b', 'c', 'a'])
  })

  it('keeps placed tasks below the moved one', () => {
    expect(planViewOrder(['c', 'a', 'b', 'd'], ['c', 'a'], 'a', { before: 'c' }, keepAll)).toEqual(['a', 'c'])
    expect(planViewOrder(['c', 'a', 'b', 'd'], ['c', 'a'], 'd', { after: 'c' }, keepAll)).toEqual(['c', 'd', 'a'])
  })

  it('returns null for a move that changes nothing or names an unknown task', () => {
    expect(planViewOrder(['a', 'b'], [], 'a', { before: 'b' }, keepAll)).toBeNull()
    expect(planViewOrder(['a', 'b'], [], 'a', { after: 'a' }, keepAll)).toBeNull()
    expect(planViewOrder(['a', 'b'], [], 'x', { after: 'a' }, keepAll)).toBeNull()
    expect(planViewOrder(['a', 'b'], [], 'a', { after: 'x' }, keepAll)).toBeNull()
  })

  it('keeps an open hidden task after its predecessor and drops a gone one', () => {
    // h is open but not shown now; g is deleted or completed.
    const keep = (id: string) => id === 'h'
    expect(planViewOrder(['a', 'b', 'c'], ['a', 'h', 'g', 'b'], 'c', { before: 'a' }, keep)).toEqual(['c', 'a', 'h', 'b'])
    // A hidden task first in the stored list stays first.
    expect(planViewOrder(['a', 'b'], ['h', 'a'], 'b', { before: 'a' }, keep)).toEqual(['h', 'b', 'a'])
  })

  it('never holds more than the bound: hidden ids go first, then the tail', () => {
    const seq = Array.from({ length: MAX_VIEW_ORDER + 10 }, (_, i) => `t${i}`)
    // Every shown task placed: moving an unplaced one to the top drops the last placed one.
    const out = planViewOrder(seq, seq.slice(0, MAX_VIEW_ORDER), seq[seq.length - 1], { before: 't0' }, keepAll)!
    expect(out).toHaveLength(MAX_VIEW_ORDER)
    expect(out[0]).toBe(seq[seq.length - 1])
    expect(out).not.toContain(`t${MAX_VIEW_ORDER - 1}`)
    const stored = [...Array.from({ length: 5 }, (_, i) => `hidden${i}`), ...seq.slice(0, MAX_VIEW_ORDER - 5)]
    // 5 hidden + 495 placed: placing one more drops the last hidden id, not a shown task.
    const next = planViewOrder(seq, stored, 't499', { before: 't0' }, keepAll)!
    expect(next).toHaveLength(MAX_VIEW_ORDER)
    expect(next.filter((id) => id.startsWith('hidden'))).toEqual(['hidden0', 'hidden1', 'hidden2', 'hidden3'])
    expect(next.slice(4, 6)).toEqual(['t499', 't0'])
  })
})

describe('stepAnchor', () => {
  const group = ['a', 'b', 'c']
  it('names the neighbour in the group, or null at the edge', () => {
    expect(stepAnchor(group, 'b', -1)).toEqual({ before: 'a' })
    expect(stepAnchor(group, 'b', 1)).toEqual({ after: 'c' })
    expect(stepAnchor(group, 'c', 'top')).toEqual({ before: 'a' })
    expect(stepAnchor(group, 'a', 'bottom')).toEqual({ after: 'c' })
    expect(stepAnchor(group, 'a', -1)).toBeNull()
    expect(stepAnchor(group, 'c', 1)).toBeNull()
    expect(stepAnchor(group, 'a', 'top')).toBeNull()
    expect(stepAnchor(group, 'x', 1)).toBeNull()
  })
})
