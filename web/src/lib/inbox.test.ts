import { describe, expect, it } from 'vitest'
import vectors from '../../../internal/inbox/testdata/inbox_vectors.json'
import { isInboxTask, isPlannedWithoutProject } from './inbox'
import type { Due } from './types'

type Vector = { name: string; task: { project_id: string | null; due: Due | null; start: string | null; completed_at: number | null; deleted_at: number | null }; inbox: boolean }

describe('Inbox membership (shared vectors with internal/inbox)', () => {
  for (const v of vectors as Vector[]) {
    it(v.name, () => {
      expect(isInboxTask(v.task)).toBe(v.inbox)
    })
  }

  it('the planned line counts open, live, project-less scheduled tasks only', () => {
    const base = { project_id: null, due: null, start: null, completed_at: null, deleted_at: null }
    expect(isPlannedWithoutProject({ ...base, due: { date: '2026-10-23' } })).toBe(true)
    expect(isPlannedWithoutProject({ ...base, start: 'someday' })).toBe(true)
    expect(isPlannedWithoutProject(base)).toBe(false)
    expect(isPlannedWithoutProject({ ...base, project_id: 'p', due: { date: '2026-10-23' } })).toBe(false)
    expect(isPlannedWithoutProject({ ...base, due: { date: '2026-10-23' }, completed_at: 1 })).toBe(false)
  })
})
