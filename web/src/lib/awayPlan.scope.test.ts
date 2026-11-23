// What "Everything" covers (the security read of #1635): a person's time away
// never moves a teammate's work. A series assigned to someone else is never
// covered, and one in a shared project only when that project is chosen.
import { describe, expect, it } from 'vitest'
import { planAway, type AwayScope } from './awayPlan'
import type { Task } from './types'

const daily = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: id, recurrence: 'every day', due: { date: '2026-12-01' }, completed_at: null, deleted_at: null, labels: [], project_id: null, assignee_id: null, ...extra }) as Task

const tasks = [
  daily('mine'),
  daily('standup', { project_id: 'team', assignee_id: 'alice' }),
  daily('review', { project_id: 'team' }),
  daily('notes', { project_id: 'team', assignee_id: 'bob' }),
]
const whose = { me: 'bob', shared: (p: string) => p === 'team' }

function planned(scope: AwayScope): string[] {
  const plan = planAway(tasks, scope, '2026-12-01', '2026-12-02', (id) => tasks.filter((t) => t.id === id), () => true, 5, '2026-12-01', whose)
  return [...new Set(plan.changes.filter((c) => tasks.some((t) => t.id === c.entityId)).map((c) => c.entityId))]
}

describe('an away period and other people\'s work', () => {
  it('Everything leaves out shared projects and what is assigned to someone else', () => {
    expect(planned({ all: true })).toEqual(['mine'])
  })
  it('choosing the shared project covers its series, never one assigned to someone else', () => {
    expect(planned({ all: false, projects: ['team'], labels: [] })).toEqual(['review', 'notes'])
  })
  it('a label never reaches into a shared project', () => {
    expect(planned({ all: false, projects: [], labels: ['x'] })).toEqual([])
  })
})

// #1901: the details list each series with its skips and its due once they are, time and zone kept.
describe('the rows of the preview', () => {
  it('give each skipped series its count and its next due with its own time and zone, in title order', () => {
    const list = [
      daily('Water', { due: { date: '2026-12-01', time: '23:30', tz: 'Europe/London' } }),
      daily('Bins', { recurrence: 'every week', due: { date: '2026-12-02' } }),
      daily('Later', { due: { date: '2026-12-09' } }),
    ]
    const plan = planAway(list, { all: true }, '2026-12-01', '2026-12-02', (id) => list.filter((t) => t.id === id), () => true, 5, '2026-12-01')
    expect(plan.rows).toEqual([
      { id: 'Bins', title: 'Bins', skipped: 1, next: { date: '2026-12-09' } },
      { id: 'Water', title: 'Water', skipped: 2, next: { date: '2026-12-03', time: '23:30', tz: 'Europe/London' } },
    ])
  })
})
