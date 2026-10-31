import { describe, expect, it } from 'vitest'
import { deriveActivity, type ActivityOp } from './activity'

// notes-overview: a standalone note is never an activity event, and neither is
// a pending append (appends.<id>) on a task or a note. Mirrors
// internal/activity/notes_test.go.
describe('activity leaves notes out', () => {
  it('derives no event from note ops or appends', () => {
    const fields: [string, unknown][] = [
      ['title', 'Meeting'], ['notes_doc', 'AAEC'], ['description', 'text'], ['project_id', 'p1'], ['labels', ['x']],
      ['position', 1], ['created_at', 1], ['workspace_id', 'w'], ['deleted_at', 2],
    ]
    const ops = fields.map(([field, value], i) => (
      { id: `n${field}`, actor: 'a', entity: 'note', entityId: 'n1', field, value, ts: i + 1, device: 'd' }
    )) as ActivityOp[]
    ops.push(
      { id: 'ta', actor: 'a', entity: 'task', entityId: 't1', field: 'appends.ap1', value: { text: 'more' }, ts: 20, device: 'd' } as ActivityOp,
      { id: 'na', actor: 'a', entity: 'note', entityId: 'n1', field: 'appends.ap2', value: { text: 'more' }, ts: 21, device: 'd' } as ActivityOp,
    )
    expect(deriveActivity(ops)).toEqual([])
  })
})
