// The Today, Upcoming and project lists shared by the list screen and the display
// (OpenSpec change display-mode, task 1.1): pure functions over task rows.
import { describe, expect, it } from 'vitest'
import { completedOn, groupToday, groupUpcoming, nextDays, projectOpenList, todayList, upcomingList, withoutArchived } from './dayLists'
import type { Task } from './types'

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
const at = (iso: string, h = 12) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, h).getTime()
}

describe('day lists', () => {
  it('Today holds overdue and today, by due then priority; groupToday splits overdue, day, evening and blocked', () => {
    const late = task({ title: 'Late', due: { date: '2026-10-12' } })
    const p1 = task({ title: 'Urgent', due: { date: TODAY }, priority: 1 })
    const p4 = task({ title: 'Plain', due: { date: TODAY } })
    const eve = task({ title: 'Evening', due: { date: TODAY }, evening: true })
    const wait = task({ title: 'Waiting', due: { date: TODAY } })
    const tomorrow = task({ title: 'Tomorrow', due: { date: '2026-10-15' } })
    const done = task({ title: 'Done', due: { date: TODAY }, completed_at: at(TODAY) })
    const list = todayList([tomorrow, p4, eve, done, wait, late, p1], TODAY)
    expect(list.map((t) => t.title)).toEqual(['Late', 'Urgent', 'Plain', 'Evening', 'Waiting'])
    const g = groupToday(list, TODAY, new Set([wait.id]))
    expect(g.overdue.map((t) => t.title)).toEqual(['Late'])
    expect(g.day.map((t) => t.title)).toEqual(['Urgent', 'Plain'])
    expect(g.evening.map((t) => t.title)).toEqual(['Evening'])
    expect(g.blocked.map((t) => t.title)).toEqual(['Waiting'])
  })

  it('next-day columns for days=3 list each of the next three days, empty days included', () => {
    const tasks = [
      task({ title: 'Thu', due: { date: '2026-10-15' } }),
      task({ title: 'Sat', due: { date: '2026-10-17' } }),
      task({ title: 'Sun', due: { date: '2026-10-18' } }),
      task({ title: 'Deadline Fri', deadline: '2026-10-16' }),
      task({ title: 'Today', due: { date: TODAY } }),
    ]
    expect(nextDays(tasks, TODAY, 3).map((d) => [d.date, d.tasks.map((t) => t.title)])).toEqual([
      ['2026-10-15', ['Thu']],
      ['2026-10-16', ['Deadline Fri']],
      ['2026-10-17', ['Sat']],
    ])
    expect(groupUpcoming(upcomingList(tasks, TODAY)).map((g) => g.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
  })

  it('completed today lists tasks completed on the local day, most recent first', () => {
    const early = task({ title: 'Early', completed_at: at(TODAY, 8) })
    const late = task({ title: 'Late', completed_at: at(TODAY, 18) })
    const yesterday = task({ title: 'Yesterday', completed_at: at('2026-10-13', 23) })
    const open = task({ title: 'Open' })
    expect(completedOn([early, yesterday, open, late], TODAY).map((t) => t.title)).toEqual(['Late', 'Early'])
  })

  it('archived projects stay out of the cross-project views, but not their own list', () => {
    const projects = [{ id: 'p1', archived: true }, { id: 'p2', archived: false }]
    const a = task({ title: 'Archived', project_id: 'p1', due: { date: TODAY } })
    const b = task({ title: 'Live', project_id: 'p2', due: { date: TODAY } })
    const c = task({ title: 'Inbox', due: { date: TODAY } })
    expect(todayList(withoutArchived([a, b, c], projects), TODAY).map((t) => t.title)).toEqual(['Live', 'Inbox'])
    expect(projectOpenList(withoutArchived([a, b, c], projects, 'p1'), 'p1').map((t) => t.title)).toEqual(['Archived'])
  })

  // OpenSpec change multi-day-tasks, D5 and the modified start-dates scenarios.
  it('Upcoming lists a span once under its first day, before it; Today lists it during it', () => {
    const trip = task({ title: 'Trip', start: '2026-11-03', due: { date: '2026-11-05' }, span: true })
    const chore = task({ title: 'Chore', start: '2026-11-03', due: { date: '2026-11-05' } })
    const before = '2026-11-01'
    expect(upcomingList([trip, chore], before).map((t) => t.title)).toEqual(['Trip'])
    expect(groupUpcoming(upcomingList([trip, chore], before), before)).toEqual([{ date: '2026-11-03', tasks: [trip] }])
    expect(todayList([trip], before)).toEqual([])
    const during = '2026-11-04'
    expect(todayList([trip], during).map((t) => t.title)).toEqual(['Trip'])
    expect(upcomingList([trip], during)).toEqual([])
    // A started task that is not a span keeps its place under its due date.
    expect(upcomingList([chore], during).map((t) => t.title)).toEqual(['Chore'])
  })

  it('a flag without a valid range lists as a plain task', () => {
    const odd = task({ title: 'Odd', start: '2026-11-05', due: { date: '2026-11-05' }, span: true })
    expect(groupUpcoming(upcomingList([odd], '2026-11-01'), '2026-11-01')).toEqual([])
    expect(todayList([odd], '2026-11-05').map((t) => t.title)).toEqual(['Odd'])
  })
})
