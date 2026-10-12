import { describe, expect, it } from 'vitest'
import { autoApplicable } from './assistant'
import type { ProposedChange } from './assistantTypes'

const due = (date: string) => ({ date })

describe('autoApplicable', () => {
  const small = (n: number, patch: Record<string, unknown> = { completed_at: 1 }) => Array.from({ length: n }, (_, i): ProposedChange => ({ entity: 'task', entityId: `t${i}`, patch }))
  it('allows at most 3 existing tasks and only small, reversible fields', () => {
    expect(autoApplicable(small(2))).toBe(true)
    expect(autoApplicable(small(3, { due: due('2026-10-16'), priority: 1, labels: [] }))).toBe(true)
    expect(autoApplicable(small(1, { project_id: 'p-shared' }))).toBe(false)
    expect(autoApplicable(small(1, { section_id: 's1' }))).toBe(false)
    expect(autoApplicable(small(4))).toBe(false)
    expect(autoApplicable(small(1, { title: 'x' }))).toBe(false)
    expect(autoApplicable(small(1, { deleted_at: 1 }))).toBe(false)
    expect(autoApplicable([{ entity: 'task', entityId: 'n', create: true, patch: { title: 'x' } }])).toBe(false)
    expect(autoApplicable([{ entity: 'comment', entityId: 'c', patch: { body: 'x' } }])).toBe(false)
    expect(autoApplicable([])).toBe(false)
  })
})
