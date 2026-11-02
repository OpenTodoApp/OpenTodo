// The planning list's Time sectors groups (OpenSpec change time-sectors, tasks 1.3 and 3.4).
import { describe, expect, it } from 'vitest'
import { availability } from './flow'
import { sectorPlan } from './sectorPlan'
import type { Project, Section, Task } from './types'

const task = (id: string, over: Partial<Task>): Task => ({
  id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

const seq = { id: 'p-seq', flow_mode: 'sequential' } as Project
const today = '2026-10-28' // Wednesday of 2026-W44, Monday weeks

describe('sectorPlan', () => {
  it('groups by own sector in the design order and leaves empty groups out', () => {
    const tasks = [
      task('quarter', { sector: '2026-Q4' }),
      task('carried', { sector: '2026-W42' }),
      task('week', { sector: '2026-W44', estimate_minutes: 30 }),
      task('week2', { sector: '2026-W44', estimate_minutes: 45, position: 1 }),
      task('next', { sector: '2026-W45' }),
      task('later', { sector: '2027-Q3' }),
      task('dated', { sector: '2026-W44', due: { date: today } }),
      task('done', { sector: '2026-W44', completed_at: 1 }),
      task('plain', {}),
    ]
    const groups = sectorPlan({ tasks, projects: [], sections: [], today, weekStart: 1 })
    expect(groups.map((g) => [g.group, g.tasks.map((t) => t.id)])).toEqual([
      ['carried', ['carried']], ['this-week', ['week', 'week2']], ['next-week', ['next']], ['this-quarter', ['quarter']], ['later', ['later']],
    ])
    expect(groups[1].minutes).toBe(75)
  })

  it('lists only available tasks and counts the waiting ones (spec "Waiting tasks are counted")', () => {
    const tasks = [
      task('free', { sector: '2026-W44' }),
      task('blocker', {}),
      task('blocked', { sector: '2026-W44', blocked_by: ['blocker'] }),
      task('first', { project_id: 'p-seq', position: 0 }),
      task('second', { project_id: 'p-seq', position: 1, sector: '2026-W44' }),
      task('also', { sector: '2026-W44', position: 2 }),
    ]
    const [week] = sectorPlan({ tasks, projects: [seq], sections: [] as Section[], today, weekStart: 1 })
    expect(week.tasks.map((t) => t.id)).toEqual(['free', 'also'])
    expect(week.waiting.map((t) => t.id).sort()).toEqual(['blocked', 'second'])
  })

  it('uses the one availability rule Next and Today use (no second predicate)', () => {
    const tasks = [task('a', { sector: '2026-W44' }), task('b', { sector: '2026-W44', start: '2026-12-01' }), task('c', { sector: '2026-W44', blocked_by: ['a'] })]
    const flow = availability({ tasks, projects: [], sections: [], today })
    const [week] = sectorPlan({ tasks, projects: [], sections: [], today, weekStart: 1 })
    for (const t of tasks) expect(week.tasks.includes(t)).toBe(flow.available(t.id))
  })
})
