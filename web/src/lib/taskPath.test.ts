import { describe, expect, it } from 'vitest'
import { parentChain, splitParents } from './taskPath'
import type { Task } from './types'

function task(id: string, parent: string | null, extra: Partial<Task> = {}): Task {
  return { id, parent_id: parent, title: id, deleted_at: null, ...extra } as Task
}

describe('parentChain', () => {
  const rows = [task('budget', null), task('gather', 'budget'), task('ask', 'gather')]
  const byId = new Map(rows.map((t) => [t.id, t]))

  it('lists parents from the project down to the nearest', () => {
    expect(parentChain('ask', 'gather', (id) => byId.get(id)).map((t) => t.id)).toEqual(['budget', 'gather'])
  })

  it('is empty when the task has no parent', () => {
    expect(parentChain('budget', null, (id) => byId.get(id))).toEqual([])
  })

  it('stops at a deleted parent and does not show it', () => {
    const gone = task('gather', 'budget', { deleted_at: 1 })
    const map = new Map<string, Task>([['budget', rows[0]], ['gather', gone]])
    expect(parentChain('ask', 'gather', (id) => map.get(id))).toEqual([])
  })

  it('stops when a parent is missing', () => {
    expect(parentChain('ask', 'missing', (id) => byId.get(id))).toEqual([])
  })

  it('stops on a cycle', () => {
    const loop = new Map<string, Task>([['a', task('a', 'b')], ['b', task('b', 'a')]])
    expect(parentChain('ask', 'a', (id) => loop.get(id)).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('keeps a completed parent', () => {
    const done = task('budget', null, { completed_at: 1 } as Partial<Task>)
    expect(parentChain('gather', 'budget', () => done).map((t) => t.id)).toEqual(['budget'])
  })
})

describe('splitParents', () => {
  it('shows a single parent and folds nothing', () => {
    expect(splitParents(['budget'])).toEqual({ hidden: [], shown: ['budget'] })
  })

  it('folds every parent but the nearest', () => {
    expect(splitParents(['budget', 'gather', 'review'])).toEqual({ hidden: ['budget', 'gather'], shown: ['review'] })
  })

  it('folds nothing when there is no parent', () => {
    expect(splitParents([])).toEqual({ hidden: [], shown: [] })
  })
})
