import { describe, expect, it } from 'vitest'
import { completedToday, groupToday, groupUpcoming, nextDays, todayGroups, todayTasks, unarchivedTasks, upcomingTasks } from './dayLists'
import type { Task } from './types'

// display-mode 1.1: the list and the display share these selections.

const T = '2026-10-15'
let n = 0
function task(over: Partial<Task>): Task {
  n++
  return {
    id: over.id ?? `t${n}`, title: over.title ?? `Task ${n}`, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: n, created_at: n, completed_at: null, deleted_at: null, deadline: null, start: null, evening: false, blocked_by: [], ...over,
  } as Task
}

describe('dayLists', () => {
  it('selects Today with overdue, evening and blocked groups', () => {
    const late = task({ id: 'late', due: { date: '2026-10-13' } })
    const now = task({ id: 'now', due: { date: T }, priority: 1 })
    const eve = task({ id: 'eve', due: { date: T }, evening: true })
    const wait = task({ id: 'wait', due: { date: T }, blocked_by: ['now'] })
    const later = task({ id: 'later', due: { date: '2026-10-16' } })
    const all = [late, now, eve, wait, later]
    const g = todayGroups(all, [], T)
    expect(g.overdue.map((t) => t.id)).toEqual(['late'])
    expect(g.day.map((t) => t.id)).toEqual(['now'])
    expect(g.evening.map((t) => t.id)).toEqual(['eve'])
    expect(g.blocked.map((t) => t.id)).toEqual(['wait'])
    expect(groupToday(todayTasks(all, T), T, new Map()).blocked).toEqual([])
  })

  it('keeps archived projects out except in their own view', () => {
    const kept = task({ project_id: 'p1', due: { date: T } })
    const archived = task({ project_id: 'old', due: { date: T } })
    const projects = [{ id: 'p1', archived: false }, { id: 'old', archived: true }]
    expect(unarchivedTasks([kept, archived], projects)).toEqual([kept])
    expect(unarchivedTasks([kept, archived], projects, 'old')).toEqual([kept, archived])
  })

  it('groups Upcoming by day and builds next-day columns', () => {
    const a = task({ due: { date: '2026-10-17' } })
    const b = task({ due: { date: '2026-10-16' } })
    const c = task({ deadline: '2026-10-16' })
    const far = task({ due: { date: '2026-10-30' } })
    const all = [a, b, c, far]
    expect(groupUpcoming(upcomingTasks(all, T)).map((g) => [g.date, g.tasks.length])).toEqual([['2026-10-16', 2], ['2026-10-17', 1], ['2026-10-30', 1]])
    const cols = nextDays(all, T, 3)
    // display-mode "Today display": `days` columns after today (Wednesday, 3 → Thu, Fri, Sat).
    expect(cols.map((c) => c.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18'])
    expect(cols[0].tasks).toHaveLength(2)
    expect(cols[2].tasks).toEqual([])
    expect(nextDays(all, T, 1).map((c) => c.date)).toEqual(['2026-10-16'])
    expect(nextDays(all, T, 99)).toHaveLength(7)
  })

  it('lists tasks completed today, most recent first', () => {
    const noon = new Date(2026, 9, 15, 12).getTime()
    const a = task({ completed_at: noon })
    const b = task({ completed_at: noon + 1000 })
    const old = task({ completed_at: new Date(2026, 9, 14, 12).getTime() })
    expect(completedToday([a, b, old], T).map((t) => t.id)).toEqual([b.id, a.id])
  })
})
