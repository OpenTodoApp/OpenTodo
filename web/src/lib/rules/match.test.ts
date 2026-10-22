import { describe, expect, it } from 'vitest'
import type { RuleCondition } from '../types'
import { logicalDate, matchesCondition, type MatchTask } from './match'
import vectors from './match.vectors.json'

interface Vector {
  name: string
  now: number
  offset_minutes: number
  day_start: string
  condition: RuleCondition | null
  task: Omit<MatchTask, 'id' | 'dueDate'> & { due: { date: string } | null }
  projects?: Record<string, string>
  open?: string[]
  tracked?: Record<string, number>
  match: boolean
}

describe('rule conditions (shared vectors with internal/ruleval)', () => {
  it('has a vector per predicate', () => expect((vectors as Vector[]).length).toBeGreaterThanOrEqual(40))
  for (const v of vectors as Vector[]) {
    it(v.name, () => {
      const task: MatchTask = { ...v.task, id: 't', dueDate: v.task.due?.date ?? null }
      const got = matchesCondition(v.condition, task, {
        userId: 'me',
        today: logicalDate(v.now, v.offset_minutes, v.day_start),
        parent: (id) => v.projects?.[id] || null,
        open: (id) => (v.open ?? []).includes(id),
        tracked: (id) => v.tracked?.[id] ?? 0,
      })
      expect(got).toBe(v.match)
    })
  }

  it('reads the day start like the server', () => {
    expect(logicalDate(1792459800000, 0, '03:00')).toBe('2026-10-19')
    expect(logicalDate(1792459800000, 0, 'garbage')).toBe('2026-10-20')
    expect(logicalDate(1792623600000, 120, '00:00')).toBe('2026-10-22')
  })
})
