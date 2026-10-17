// Grouping is linear (OpenSpec change large-list-performance, UI-7): the list
// views group 10,000 tasks by project without copying a group per insert.
import { describe, expect, it } from 'vitest'
import { appendTo, groupBy } from './collections'

describe('groupBy', () => {
  it('keeps input order within a group and first-seen order between groups', () => {
    const m = groupBy(['b1', 'a1', 'b2', 'c1', 'a2'], (s) => s[0])
    expect([...m.keys()]).toEqual(['b', 'a', 'c'])
    expect(m.get('a')).toEqual(['a1', 'a2'])
    expect(m.get('b')).toEqual(['b1', 'b2'])
  })

  it('appendTo creates the list on first use and appends in place after', () => {
    const m = new Map<string, number[]>()
    appendTo(m, 'x', 1)
    const list = m.get('x')
    appendTo(m, 'x', 2)
    expect(m.get('x')).toBe(list)
    expect(list).toEqual([1, 2])
  })

  it('groups 20,000 items in one group in linear time', () => {
    const items = Array.from({ length: 20_000 }, (_, i) => ({ id: `t${i}`, project_id: 'p' }))
    groupBy(items, (x) => x.project_id) // warm up
    const t0 = performance.now()
    const m = groupBy(items, (x) => x.project_id)
    const ms = performance.now() - t0
    console.info(`[large-list-performance] groupBy 20,000 items into one group: ${ms.toFixed(2)} ms`)
    expect(m.get('p')).toHaveLength(20_000)
    // Copying the group on each insert takes seconds here (quadratic); appending takes about a millisecond.
    expect(ms).toBeLessThan(150)
  })
})
