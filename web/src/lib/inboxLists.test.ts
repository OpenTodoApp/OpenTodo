// OpenSpec change inbox-means-unplaced: the Inbox lists open tasks without a
// project that are not scheduled; deferred project-less tasks show in Upcoming.
import { describe, expect, it } from 'vitest'
import { groupUpcoming, upcomingList } from './dayLists'
import { tasksForView } from './listGroups'
import { qualifies } from './triage'
import type { Task } from './types'
import { inLater } from './views'

const TODAY = '2026-10-14'
let n = 0
function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: over.id ?? `t${n}`, title: over.title ?? `Task ${n}`, notes: '', project_id: null, section_id: null, parent_id: null, position: n,
    priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: n, updated_at: n,
    assignee_id: null, ...over,
  } as Task
}
const inbox = (all: Task[]) => tasksForView({ view: 'inbox' }, all, [], TODAY).map((x) => x.title)

describe('Inbox is the default container (project-organization)', () => {
  it('Task without project: an undated task without a project is in the Inbox', () => {
    expect(inbox([task({ title: 'Call the plumber' })])).toEqual(['Call the plumber'])
  })

  it('Scheduling takes a task out of the Inbox', () => {
    const t = task({ title: 'Renew passport' })
    expect(inbox([t])).toEqual(['Renew passport'])
    expect(inbox([{ ...t, due: { date: '2026-10-16' } }])).toEqual([])
  })

  it('Clearing the date brings it back', () => {
    const t = task({ title: 'Renew passport', due: { date: '2026-10-16' } })
    expect(inbox([t])).toEqual([])
    expect(inbox([{ ...t, due: null }])).toEqual(['Renew passport'])
  })

  it('A deadline alone does not schedule', () => {
    expect(inbox([task({ title: 'Tax return', deadline: '2026-11-06' })])).toEqual(['Tax return'])
  })

  it('Someday is a decision; a start date too, past or future', () => {
    expect(inbox([task({ start: 'someday' }), task({ start: '2026-10-01' }), task({ start: '2026-10-21' })])).toEqual([])
  })

  it('Inbox count follows scheduling: triage counts only unscheduled top-level tasks', () => {
    const undated = task({ title: 'Undated' })
    const dated = task({ title: 'Dated', due: { date: '2026-10-15' } })
    const child = task({ title: 'Child', parent_id: undated.id })
    expect([undated, dated, child].filter(qualifies).map((x) => x.title)).toEqual(['Undated'])
  })
})

describe('Deferred tasks (start-dates)', () => {
  it('Deferred until next week: absent from the Inbox, listed in Upcoming under its start date', () => {
    const t = task({ title: 'Book flights', start: '2026-10-21' })
    expect(inbox([t])).toEqual([])
    const groups = groupUpcoming(upcomingList([t], TODAY), TODAY)
    expect(groups.map((g) => [g.date, g.tasks.map((x) => x.title)])).toEqual([['2026-10-21', ['Book flights']]])
  })

  it('Deferred with a later due date: Upcoming does not list it, its project view shows it under Later', () => {
    const t = task({ title: 'Quote', project_id: 'p1', due: { date: '2026-10-24' }, start: '2026-10-21' })
    expect(upcomingList([t], TODAY)).toEqual([])
    expect(inLater(t, TODAY)).toBe(true)
  })

  it('a deferred task without a project but with a due date keeps today\'s rule (not in Upcoming while deferred)', () => {
    expect(upcomingList([task({ due: { date: '2026-10-24' }, start: '2026-10-21' })], TODAY)).toEqual([])
  })

  it('a deferred task in a project stays out of Upcoming (its project keeps the Later group)', () => {
    const t = task({ project_id: 'p1', start: '2026-10-21' })
    expect(upcomingList([t], TODAY)).toEqual([])
    expect(inLater(t, TODAY)).toBe(true)
  })

  it('a parked task without a project is in neither the Inbox nor Upcoming', () => {
    const t = task({ start: 'someday' })
    expect(inbox([t])).toEqual([])
    expect(upcomingList([t], TODAY)).toEqual([])
  })
})
