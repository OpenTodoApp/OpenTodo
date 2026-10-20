import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logicalToday, setDayStart } from '../dates'
import { compute, periodFor } from '../stats'
import type { Task } from '../types'
import { decided, inboxAge, lastDays, nextMove } from './pulse'

const TODAY = '2026-10-19'
const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 19 - daysAgo, hour).getTime()

let n = 0
function task(p: Partial<Task> & { created_at: number }): Task {
  return { id: `t${++n}`, title: 't', project_id: null, parent_id: null, completed_at: null, deleted_at: null, due: null, series_id: null, assignee_id: null, labels: [], priority: 4, position: n, ...p } as unknown as Task
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 19, 12)) })
afterEach(() => vi.useRealTimers())

describe('day start (day-boundary D4)', () => {
  afterEach(() => setDayStart(0))

  it('a completion at 01:30 before a 04:00 day start counts for the previous day in the strip', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 2, 0))
    setDayStart(240)
    const today = logicalToday()
    expect(today).toBe('2026-10-18')
    const tasks = [task({ created_at: at(20), completed_at: new Date(2026, 9, 19, 1, 30).getTime() })]
    const strip = compute({ tasks, projects: [], shared: new Set<string>(), me: null, today }, lastDays(today))
    expect(strip.perDay[13]).toEqual({ date: '2026-10-18', count: 1 })
    // Captured at 01:00 on the 19th: created "today" (the 18th), so it is in the window and decided once filed.
    expect(decided([task({ created_at: new Date(2026, 9, 19, 1).getTime(), project_id: 'p' })], today)).toEqual({ decided: 1, caught: 1 })
    expect(inboxAge([task({ created_at: new Date(2026, 9, 19, 1).getTime() })], today)).toBe(0)
  })
})

describe('lastDays', () => {
  it('covers 14 local days ending today', () => {
    expect(lastDays(TODAY)).toEqual({ start: '2026-10-06', end: TODAY })
  })

  it('agrees with the statistics module', () => {
    const tasks = [task({ created_at: at(20), completed_at: at(3) }), task({ created_at: at(20), completed_at: at(0) }), task({ created_at: at(20), completed_at: at(16) })]
    const input = { tasks, projects: [], shared: new Set<string>(), me: null, today: TODAY }
    const strip = compute(input, lastDays(TODAY))
    expect(strip.perDay).toHaveLength(14)
    expect(strip.perDay[13].date).toBe(TODAY)
    expect(strip.perDay.map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1])
    // Monday-start week: 19 Oct 2026 is a Monday, so "this week" is today alone.
    expect(compute(input, periodFor('this-week', TODAY, 1), 1).completed).toBe(1)
    expect(compute(input, periodFor('last-week', TODAY, 1), 1).completed).toBe(1)
  })
})

describe('decided', () => {
  it('Caught and decided: deleted tasks count in neither number', () => {
    const tasks = [
      ...Array.from({ length: 11 }, (_, i) => task({ created_at: at(i % 13), project_id: i % 2 ? 'p1' : null, completed_at: i % 2 ? null : at(0) })),
      ...Array.from({ length: 7 }, (_, i) => task({ created_at: at(i) })),
      task({ created_at: at(2), deleted_at: at(1) }),
      task({ created_at: at(30) }), // older than the window
    ]
    expect(decided(tasks, TODAY)).toEqual({ decided: 11, caught: 18 })
  })

  it('counts a subtask as decided', () => {
    expect(decided([task({ created_at: at(1), parent_id: 'x' })], TODAY)).toEqual({ decided: 1, caught: 1 })
  })
})

describe('inboxAge', () => {
  it('Inbox age: the oldest open Inbox task, in whole local days', () => {
    const tasks = [task({ created_at: at(9, 23) }), task({ created_at: at(2) }), task({ created_at: at(40), project_id: 'p1' }), task({ created_at: at(50), completed_at: at(1) })]
    expect(inboxAge(tasks, TODAY)).toBe(9)
  })

  it('is null when the Inbox is empty', () => {
    expect(inboxAge([task({ created_at: at(3), project_id: 'p1' })], TODAY)).toBeNull()
    expect(inboxAge([], TODAY)).toBeNull()
  })
})

describe('nextMove', () => {
  it('follows method order', () => {
    expect(nextMove({ inbox: 3, withoutNext: 2, rhythmDue: true, nextCount: 4 })).toBe('clarify')
    expect(nextMove({ inbox: 0, withoutNext: 2, rhythmDue: true, nextCount: 4 })).toBe('place')
    expect(nextMove({ inbox: 0, withoutNext: 0, rhythmDue: true, nextCount: 4 })).toBe('review')
    expect(nextMove({ inbox: 0, withoutNext: 0, rhythmDue: false, nextCount: 4 })).toBe('do')
    expect(nextMove({ inbox: 0, withoutNext: 0, rhythmDue: false, nextCount: 0 })).toBe('catch')
  })
})
