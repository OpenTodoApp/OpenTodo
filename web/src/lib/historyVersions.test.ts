// toVersions and summarizeVersion (task-detail-redesign D7).
import { describe, expect, it } from 'vitest'
import { summarizeVersion, toVersions, VERSION_WINDOW_MS } from './historyVersions'
import type { ChangeSet } from './types'

const MIN = 60_000
let n = 0
const set = (ts: number, changes: { field: string; from?: unknown; to?: unknown; lost?: boolean }[], device = 'phone', userId = 'me'): ChangeSet =>
  ({ ts, device, userId, changes: changes.map((c) => ({ opId: `op${++n}`, from: null, to: null, ...c })) })

describe('toVersions', () => {
  it('merges one user and device within 5 minutes, newest first', () => {
    const v = toVersions([set(0, [{ field: 'title', from: 'a', to: 'b' }]), set(2 * MIN, [{ field: 'priority', from: 4, to: 1 }]), set(30 * MIN, [{ field: 'due' }])])
    expect(v).toHaveLength(2)
    expect(v[1].changes.map((c) => c.field)).toEqual(['title', 'priority'])
    expect(v[0].changes.map((c) => c.field)).toEqual(['due'])
  })
  it('accepts change sets newest first as the server pages them', () => {
    const v = toVersions([set(2 * MIN, [{ field: 'priority' }]), set(0, [{ field: 'title' }])])
    expect(v).toHaveLength(1)
    expect(v[0].firstTs).toBe(0)
    expect(v[0].ts).toBe(2 * MIN)
  })
  it('does not merge across devices or users, nor beyond the window', () => {
    expect(toVersions([set(0, [{ field: 'title' }], 'laptop'), set(MIN, [{ field: 'priority' }], 'phone')])).toHaveLength(2)
    expect(toVersions([set(0, [{ field: 'title' }], 'phone', 'me'), set(MIN, [{ field: 'priority' }], 'phone', 'ana')])).toHaveLength(2)
    expect(toVersions([set(0, [{ field: 'title' }]), set(VERSION_WINDOW_MS + 1, [{ field: 'priority' }])])).toHaveLength(2)
    expect(toVersions([set(0, [{ field: 'title' }]), set(VERSION_WINDOW_MS, [{ field: 'priority' }])])).toHaveLength(1)
  })
  it('a field changed twice collapses to its first from and last to, keeping both ops', () => {
    const [v] = toVersions([set(0, [{ field: 'title', from: 'a', to: 'b' }]), set(MIN, [{ field: 'title', from: 'b', to: 'c' }])])
    expect(v.changes).toHaveLength(1)
    expect(v.changes[0]).toMatchObject({ field: 'title', from: 'a', to: 'c' })
    expect(v.changes[0].opIds).toHaveLength(2)
  })
  it('lost changes keep their marker and are not collapsed with applied ones', () => {
    const [v] = toVersions([set(0, [{ field: 'title', from: 'a', to: 'b' }]), set(MIN, [{ field: 'title', from: 'b', to: 'x', lost: true }])])
    expect(v.changes.map((c) => [c.to, c.lost])).toEqual([['b', false], ['x', true]])
  })
})

describe('summarizeVersion', () => {
  const v = (...fields: [string, unknown?][]) => ({ changes: fields.map(([field, to = 'x']) => ({ field, from: null, to, opIds: [], lost: false })) })
  it('reads the spec examples', () => {
    expect(summarizeVersion(v(['due'], ['title']))).toBe('Renamed and rescheduled')
    expect(summarizeVersion(v(['completed_at', 1]))).toBe('Completed')
    expect(summarizeVersion(v(['completed_at', null]))).toBe('Reopened')
  })
  it('reads the creating version as Created', () => {
    expect(summarizeVersion(v(['title'], ['priority'], ['created_at', 1]))).toBe('Created')
  })
  it('uses an Oxford comma beyond two verbs and names other fields', () => {
    expect(summarizeVersion(v(['project_id'], ['title'], ['due']))).toBe('Renamed, rescheduled, and moved')
    expect(summarizeVersion(v(['labels']))).toBe('Edited the labels')
    expect(summarizeVersion(v(['assignee_id', 'u2'], ['title']))).toBe('Renamed and reassigned')
    expect(summarizeVersion(v(['assignee_id', null]))).toBe('Unassigned')
    expect(summarizeVersion(v(['description'], ['notes_doc']))).toBe('Edited the notes')
  })
})
