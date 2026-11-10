import { describe, expect, it } from 'vitest'
import vectors from './urgency.vectors.json'
import { blockedMap } from './dependencies'
import type { Task } from './types'
import { blocksCount, logicalDayIn, ramp, urgency } from './urgency'

type Vector = {
  name: string
  now: string
  zone: string
  day_start: number
  task: Task
  others: Task[]
  running_task_id: string | null
  expect: { score: number; parts: { key: string; value: number }[] } | null
}

describe('urgency score (shared vectors with internal/urgency)', () => {
  for (const v of vectors.cases as unknown as Vector[]) {
    it(v.name, () => {
      const all = [v.task, ...v.others]
      const today = logicalDayIn(Date.parse(v.now), v.zone, v.day_start)
      const got = urgency(v.task, {
        today, zone: v.zone, dayStart: v.day_start,
        blocks: blocksCount(all).get(v.task.id) ?? 0,
        blocked: blockedMap(all).has(v.task.id),
        timer: v.running_task_id === v.task.id,
      })
      expect(got && { score: got.score, parts: got.parts.map(({ key, value }) => ({ key, value })) }).toEqual(v.expect)
    })
  }

  it('ramps from 1 a week late to 0.2 two weeks ahead', () => {
    expect(ramp(-30)).toBe(1)
    expect(ramp(-7)).toBe(1)
    expect(ramp(0)).toBeCloseTo(0.7333, 4)
    expect(ramp(14)).toBe(0.2)
    expect(ramp(40)).toBe(0.2)
  })

  it('names the days and counts its labels use', () => {
    const got = urgency({ priority: 2, due: { date: '2026-11-05' }, created_at: Date.parse('2026-10-03T12:00:00Z'), completed_at: null, deleted_at: null, deadline: null, start: '2026-11-04' },
      { today: '2026-11-02', zone: 'UTC', dayStart: 0, blocks: 3, blocked: false, timer: false })!
    expect(got.parts.map((p) => [p.key, p.n])).toEqual([['due', 3], ['priority', 2], ['blocks', 3], ['age', 30], ['deferred', 2]])
  })
})
