import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compute, periodFor, type PeriodKind } from './stats'
import type { Membership, Task } from './types'

const local = (s: string) => new Date(s).getTime() // a wall time in the device's zone

function task(p: Partial<Task> & { id: string }): Task {
  return {
    project_id: null, section_id: null, parent_id: null, title: p.id, description: '', priority: 4, due: null, labels: [], position: 0,
    created_at: local('2026-10-01T09:00'), completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, ...p,
  } as Task
}

const shared = (id: string): Membership => ({ projectId: id, role: 'editor', ownerId: 'u9', members: [] })

describe('periods (stats-and-review D1)', () => {
  it('Sunday start: this week from the 11th to now, last week 4–10', () => {
    const now = local('2026-10-14T15:00')
    const tw = periodFor('this-week', '2026-10-14', 0, now)
    expect([tw.start, tw.last, tw.endMs]).toEqual(['2026-10-11', '2026-10-14', now])
    expect(tw.days).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'])
    const lw = periodFor('last-week', '2026-10-14', 0, now)
    expect([lw.start, lw.last, lw.endMs]).toEqual(['2026-10-04', '2026-10-10', local('2026-10-11T00:00')])
  })

  it('twelve weeks: eleven full weeks plus this one, twelve week bars', () => {
    const p = periodFor('12-weeks', '2026-10-14', 1)
    expect(p.weeks).toHaveLength(12)
    expect(p.start).toBe('2026-07-27')
    expect(periodFor('4-weeks', '2026-10-14', 1).weeks).toHaveLength(4)
  })
})

describe('what is counted (stats-and-review D1)', () => {
  const now = local('2026-10-14T15:00')
  const period = periodFor('this-week', '2026-10-14', 1, now)

  it('counts every occurrence record and excludes the trash', () => {
    const occ = ['10-12', '10-13', '10-14'].map((d) => task({ id: d, series_id: 's', due: { date: `2026-${d}` }, completed_at: local(`2026-${d}T08:00`) }))
    const trashed = task({ id: 'x', completed_at: local('2026-10-12T10:00'), deleted_at: local('2026-10-13T10:00') })
    expect(compute([...occ, trashed], [], new Map(), 'u1', period, '2026-10-14', 1).completed).toBe(3)
    expect(compute([...occ, { ...trashed, deleted_at: null }], [], new Map(), 'u1', period, '2026-10-14', 1).completed).toBe(4)
  })

  it('slipped and late, with their tasks', () => {
    const open = task({ id: 'open', due: { date: '2026-10-13' } })
    const late = task({ id: 'late', due: { date: '2026-10-13' }, completed_at: local('2026-10-14T09:00') })
    const s = compute([open, late], [], new Map(), 'u1', period, '2026-10-14', 1)
    expect([s.slipped, s.late, s.overdue]).toEqual([1, 1, 1])
    expect(s.slippedTasks.map((t) => t.id)).toEqual(['open'])
    expect(s.lateTasks.map((t) => t.id)).toEqual(['late'])
  })

  it('shared projects: assigned to someone else is excluded', () => {
    const tasks = [
      task({ id: 'theirs', project_id: 'p', assignee_id: 'u2', completed_at: local('2026-10-13T10:00') }),
      task({ id: 'mine', project_id: 'p', assignee_id: 'u1', completed_at: local('2026-10-13T10:00') }),
      task({ id: 'nobody', project_id: 'p', completed_at: local('2026-10-13T10:00') }),
    ]
    expect(compute(tasks, [{ id: 'p' }], new Map([['p', shared('p')]]), 'u1', period, '2026-10-14', 1).completed).toBe(2)
  })

  it('per project: five named and "other", in descending order', () => {
    const tasks: Task[] = []
    'abcdefg'.split('').forEach((p, i) => {
      for (let n = 0; n <= 7 - i; n++) tasks.push(task({ id: `${p}${n}`, project_id: p, completed_at: local('2026-10-13T10:00') }))
    })
    const s = compute(tasks, 'abcdefg'.split('').map((id) => ({ id })), new Map(), 'u1', period, '2026-10-14', 1)
    expect(s.perProject).toEqual([
      { projectId: 'a', count: 8 }, { projectId: 'b', count: 7 }, { projectId: 'c', count: 6 }, { projectId: 'd', count: 5 }, { projectId: 'e', count: 4 },
      { projectId: 'other', count: 3 + 2 },
    ])
    expect(s.perDay.map((d) => d.count)).toEqual([0, tasks.length, 0])
  })
})

describe('the shared fixture (internal/digest/testdata/stats_fixture.json)', () => {
  interface Fixture {
    me: string; today: string; now: string; weekStart: number
    projects: { id: string }[]; memberships: { projectId: string; role: string }[]
    tasks: { id: string; project_id: string | null; assignee_id?: string; due?: string; created?: string; completed?: string; deleted?: string }[]
    expected: Record<PeriodKind, { completed: number; created: number; late: number; slipped: number; overdue: number }>
  }
  const fx = JSON.parse(readFileSync(resolve(__dirname, '../../../internal/digest/testdata/stats_fixture.json'), 'utf8')) as Fixture

  it('matches the expected counts', () => {
    const tasks = fx.tasks.map((t) => task({
      id: t.id, project_id: t.project_id, assignee_id: t.assignee_id ?? null, due: t.due ? { date: t.due } : null,
      created_at: t.created ? local(t.created) : local('2026-10-01T09:00'), completed_at: t.completed ? local(t.completed) : null,
      deleted_at: t.deleted ? local(t.deleted) : null,
    }))
    const memberships = new Map(fx.memberships.map((m) => [m.projectId, shared(m.projectId)]))
    for (const [kind, want] of Object.entries(fx.expected) as [PeriodKind, Fixture['expected'][PeriodKind]][]) {
      const s = compute(tasks, fx.projects, memberships, fx.me, periodFor(kind, fx.today, fx.weekStart, local(fx.now)), fx.today, fx.weekStart)
      expect({ kind, completed: s.completed, created: s.created, late: s.late, slipped: s.slipped, overdue: s.overdue }).toEqual({ kind, ...want })
    }
  })
})
