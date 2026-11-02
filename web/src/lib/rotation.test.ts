import { describe, expect, it } from 'vitest'
import vectors from './rotation.vectors.json'
import { activeRotation, canRotate, nextAssignee, turnAfterCompletion, validRotation } from './rotation'
import type { Task } from './types'

describe('rotation vectors (shared with internal/sync/rotation_test.go)', () => {
  for (const v of vectors.next) {
    it(`next: ${v.name}`, () => {
      expect(nextAssignee(v.rotation, v.current, (id) => v.members.includes(id))).toBe(v.next)
    })
  }
  for (const v of vectors.valid) {
    it(`valid: ${v.name}`, () => {
      expect(validRotation(v.rotation)).toBe(v.valid)
    })
  }
})

describe('rotation in effect', () => {
  const two = new Set(['alice', 'bob'])
  const series = { id: 's', recurrence: 'every monday', parent_id: null, rotation: ['alice', 'bob'], assignee_id: 'alice' } as unknown as Task
  it('needs a rule, a top-level task and two members', () => {
    expect(canRotate(series, two)).toBe(true)
    expect(canRotate({ ...series, recurrence: null }, two)).toBe(false)
    expect(canRotate({ ...series, parent_id: 'p' }, two)).toBe(false)
    expect(canRotate(series, new Set(['alice']))).toBe(false)
    expect(canRotate(series, undefined)).toBe(false)
    expect(activeRotation({ ...series, recurrence: null }, two)).toEqual([])
  })
  it('passes the turn only when it changes', () => {
    expect(turnAfterCompletion(series, two)).toBe('bob')
    expect(turnAfterCompletion({ ...series, rotation: ['alice'] } as Task, two)).toBeUndefined()
    expect(turnAfterCompletion({ ...series, rotation: [] } as Task, two)).toBeUndefined()
  })
})
