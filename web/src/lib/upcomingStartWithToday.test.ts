// Upcoming's Start with Today (OpenSpec change upcoming-start-with-today): Today's own
// groups, from the same selection and grouping as Today, then Tomorrow onwards.
import { describe, expect, it } from 'vitest'
import { currentDateTime } from './dates'
import { listGroups, tasksForView, type GroupInput, type ListGroup } from './listGroups'
import type { Task } from './types'
import { upcomingStartsWithToday } from './userPrefs'
import { withProjectedDays } from '../app/task-list/upcomingCompute'

const TODAY = '2026-10-14'
const TOMORROW = '2026-10-15'
let n = 0
function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: over.id ?? `t${n}`, title: over.title ?? `Task ${n}`, notes: '', project_id: null, section_id: null, parent_id: null, position: n,
    priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: n, updated_at: n,
    assignee_id: null, ...over,
  } as Task
}

function input(over: Partial<GroupInput>): GroupInput {
  return {
    view: 'upcoming', tasks: [], laterTasks: [], tree: null, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked: new Set(),
    taskMap: new Map(), projects: [], projectMap: new Map(), board: false, columns: [], buckets: null, sectionCount: 0, collapsedSections: [], logbook: null,
    ...over,
  }
}
const shape = (gs: ListGroup[]) => gs.map((g) => [g.key, g.heading, g.rows.map((r) => r.task.title), g.count ?? null])

const late = task({ title: 'Late', due: { date: '2026-10-12' } })
const now = task({ title: 'Now', due: { date: TODAY } })
const evening = task({ title: 'Evening', due: { date: TODAY }, evening: true })
const started = task({ title: 'Started', start: '2026-10-10' })
const tomorrow = task({ title: 'Tomorrow', due: { date: TOMORROW } })
// Due tomorrow with a deadline that has passed: Today holds it, so it is listed once, there.
const both = task({ title: 'Both', due: { date: TOMORROW }, deadline: '2026-10-13' })
const later = task({ title: 'Later', due: { date: '2026-10-20' } })
const all = [late, now, evening, started, tomorrow, both, later]

describe('Start with Today', () => {
  it('is off unless the account chose "on"', () => {
    expect(upcomingStartsWithToday(undefined)).toBe(false)
    expect(upcomingStartsWithToday({ upcoming_today: '' })).toBe(false)
    expect(upcomingStartsWithToday({ upcoming_today: 'off' })).toBe(false)
    expect(upcomingStartsWithToday({ upcoming_today: 'yes' })).toBe(false)
    expect(upcomingStartsWithToday({ upcoming_today: 'on' })).toBe(true)
  })

  it('leaves Upcoming as it was while off', () => {
    const tasks = tasksForView({ view: 'upcoming' }, all, [], TODAY)
    expect(tasks.map((x) => x.title)).toEqual(['Tomorrow', 'Both', 'Later'])
    expect(listGroups(input({ tasks })).map((g) => g.key)).toEqual([TOMORROW, '2026-10-20'])
  })

  it('holds Today’s tasks first, each task once', () => {
    const upcoming = tasksForView({ view: 'upcoming' }, all, [], TODAY, undefined, true).map((x) => x.title)
    const today = tasksForView({ view: 'today' }, all, [], TODAY).map((x) => x.title)
    expect(upcoming.slice(0, today.length)).toEqual(today)
    expect(upcoming.slice(today.length)).toEqual(['Tomorrow', 'Later'])
    expect(new Set(upcoming).size).toBe(upcoming.length)
  })

  it('opens with Today’s own groups, as Today shows them, then Tomorrow onwards', () => {
    const blocked = new Set([started.id])
    const todayGroups = listGroups(input({ view: 'today', tasks: tasksForView({ view: 'today' }, all, [], TODAY), blocked }))
    const groups = listGroups(input({ tasks: tasksForView({ view: 'upcoming' }, all, [], TODAY, undefined, true), blocked, upcomingToday: true }))
    expect(shape(groups.slice(0, todayGroups.length))).toEqual(shape(todayGroups))
    expect(groups.map((g) => g.key)).toEqual(['earlier', 'today', 'evening', 'blocked', TOMORROW, '2026-10-20'])
    expect(groups.find((g) => g.key === TOMORROW)!.rows.map((r) => r.task.title)).toEqual(['Tomorrow'])
  })

  it('names the Today group and leaves it out when empty', () => {
    const only = listGroups(input({ tasks: [now, tomorrow], upcomingToday: true }))
    expect(only.map((g) => [g.key, g.heading])).toEqual([['today', 'Today'], [TOMORROW, 'Tomorrow']])
    const none = listGroups(input({ tasks: [evening, tomorrow], upcomingToday: true }))
    expect(none.map((g) => g.key)).toEqual(['evening', TOMORROW])
  })

  it('keeps the parts of the day, without drops on their headings', () => {
    const morning = task({ title: 'Morning', due: { date: TODAY }, day_part: 'morning' } as Partial<Task>)
    const today = listGroups(input({ view: 'today', tasks: [morning, now], dayParts: true }))
    const groups = listGroups(input({ tasks: [morning, now, tomorrow], dayParts: true, upcomingToday: true }))
    expect(groups.map((g) => g.key)).toEqual([...today.map((g) => g.key), TOMORROW])
    expect(today.find((g) => g.key === 'morning')!.dropPart).toBe('morning')
    expect(groups.some((g) => g.dropPart)).toBe(false)
  })

  it('lists the Today limit’s waiting tasks in the same folded group, and no Done today', () => {
    const closedList = { limit: 1, waiting: [evening] }
    const doneToday = [task({ title: 'Done', completed_at: 1 })]
    const today = listGroups(input({ view: 'today', tasks: [now, evening], closedList, doneToday }))
    const groups = listGroups(input({ tasks: [now, evening, tomorrow], closedList, upcomingToday: true }))
    // Today leaves its only day group unnamed; Upcoming names it, since Tomorrow follows.
    expect(shape(today).map((g) => g[0])).toEqual(['today', 'waiting', 'done'])
    expect(shape(groups)).toEqual([['today', 'Today', ['Now'], null], shape(today)[1], [TOMORROW, 'Tomorrow', ['Tomorrow'], null]])
    expect(groups.find((g) => g.key === 'waiting')).toMatchObject({ folded: true, count: 1 })
  })

  it('keeps Today’s groups ahead of the projected days', () => {
    const groups = listGroups(input({ tasks: [late, now, later], upcomingToday: true }))
    const projection = { date: TOMORROW, series: later } as unknown as Parameters<typeof withProjectedDays>[1][number]
    const out = withProjectedDays(groups, [projection], (d) => d, '2026-10-28')
    expect(out.map((g) => g.key)).toEqual(['earlier', 'today', TOMORROW, '2026-10-20'])
  })
})
