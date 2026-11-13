import { describe, expect, it } from 'vitest'
import { nestGroup } from './viewNest'
import type { Task } from './types'

const tk = (id: string, parent_id: string | null = null, position = 0) => ({ id, parent_id, position, title: id, deleted_at: null, completed_at: null }) as unknown as Task

describe('nestGroup (GitHub issue 1108)', () => {
  // The view's order: c, a, b2, b1; b1 and b2 are subtasks of a, x's parent is not in the group.
  const group = [tk('c'), tk('a'), tk('b2', 'a', 2), tk('b1', 'a', 1), tk('x', 'missing')]

  it('puts subtasks under their parent, top-level rows in the view order, subtasks in manual order', () => {
    const { tasks, rows } = nestGroup(group, () => false)
    expect(tasks.map((t) => t.id)).toEqual(['c', 'a', 'b1', 'b2', 'x'])
    expect(rows.get('a')).toEqual({ depth: 0, hasChildren: true, collapsed: false })
    expect(rows.get('b1')?.depth).toBe(1)
    expect(rows.get('x')).toEqual({ depth: 0, hasChildren: false, collapsed: false })
  })

  it('leaves out the subtasks of a folded row', () => {
    const { tasks, rows } = nestGroup(group, (id) => id === 'a')
    expect(tasks.map((t) => t.id)).toEqual(['c', 'a', 'x'])
    expect(rows.get('a')?.collapsed).toBe(true)
  })
})
