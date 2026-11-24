// OpenSpec change day-manual-order, tasks 1.2 and 1.3: Today's and Upcoming's groups
// under the shared day order, and Due date by part of the day. Pure, without a DOM.
import { describe, expect, it } from 'vitest'
import { addDaysISO, currentDateTime } from './dates'
import { compareDueWithParts } from './dayLists'
import { defaultListDisplay, type ListDisplay } from './listDisplay'
import { dayOrderRows, dayOrderSiblings, keepGroups, listGroups, WAITING_OPEN_KEY, type GroupInput } from './listGroups'
import type { Label, Project, Task } from './types'

const TODAY = '2026-10-14'
const THURSDAY = addDaysISO(TODAY, 2)
let n = 0
function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: over.id ?? `t${n}`, title: over.title ?? `Task ${n}`, notes: '', project_id: null, section_id: null, parent_id: null, position: n,
    priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: n, updated_at: n,
    assignee_id: null, ...over,
  } as Task
}
const work = { id: 'work', name: 'Work', position: 1, archived: false, deleted_at: null } as Project
const errand = { id: 'errand', name: 'errand', color: '#000', position: 1, created_at: 0, deleted_at: null } as Label

function input(over: Partial<GroupInput>): GroupInput {
  return {
    view: 'today', tasks: [], laterTasks: [], tree: null, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked: new Set(),
    taskMap: new Map(), projects: [work], projectMap: new Map([[work.id, work]]), board: false, columns: [], buckets: null, sectionCount: 0,
    collapsedSections: [], logbook: null, labels: [errand], ...over,
  }
}
const titles = (g: { rows: { task: Task }[] }) => g.rows.map((r) => r.task.title)
const shown = (over: Partial<ListDisplay>, kind: 'today' | 'upcoming' = 'today'): ListDisplay => ({ ...defaultListDisplay(kind), ...over })

describe('Manual order of the day', () => {
  const same = { project_id: 'work', labels: ['errand'], priority: 2 as const }
  const a = task({ id: 'a', title: 'A', due: { date: TODAY, time: '09:00' }, ...same })
  const b = task({ id: 'b', title: 'B', due: { date: TODAY }, ...same })
  const c = task({ id: 'c', title: 'C', due: { date: TODAY, time: '08:00' }, ...same })
  const rank = new Map([['b', 0], ['a', 1]])

  it('lists the placed tasks in the stored order under every grouping of Today, the others after them by due date', () => {
    for (const groupBy of ['day', 'project', 'priority', 'label', 'none'] as const) {
      const groups = listGroups(input({ tasks: [c, a, b], display: shown({ groupBy, sortBy: 'position' }), manualOrder: rank }))
      expect(groups.flatMap(titles), groupBy).toEqual(['B', 'A', 'C'])
    }
  })

  it('places within each part of the day, and every day group takes a line (D2)', () => {
    const groups = listGroups(input({ tasks: [c, a, b], display: shown({ sortBy: 'position' }), manualOrder: rank, dayParts: true }))
    expect(groups.map((g) => [g.key, titles(g), g.daySlot])).toEqual([
      ['today', ['B'], { part: null }], ['morning', ['A', 'C'], { part: 'morning' }],
    ])
  })

  it('gives the slots: a part in Time of day, nothing under Priority or None, project drops under Project', () => {
    const byPriority = listGroups(input({ tasks: [a, b], display: shown({ groupBy: 'priority' }) }))
    expect(byPriority.map((g) => g.daySlot)).toEqual([{}])
    const byProject = listGroups(input({ tasks: [a, b], display: shown({ groupBy: 'project' }) }))
    expect(byProject.map((g) => g.daySlot)).toEqual([undefined])
    const off = listGroups(input({ tasks: [a, b, task({ title: 'Eve', due: { date: TODAY }, evening: true })] }))
    expect(off.map((g) => [g.key, g.daySlot])).toEqual([['today', { part: null }], ['evening', { part: 'evening' }]])
  })

  it('keeps Earlier and Blocked in Today\'s default order, outside the day order', () => {
    const late1 = task({ title: 'Late 9', due: { date: addDaysISO(TODAY, -1), time: '09:00' } })
    const late2 = task({ title: 'Late 8', due: { date: addDaysISO(TODAY, -1), time: '08:00' } })
    const groups = listGroups(input({ tasks: [late2, late1, b], display: shown({ sortBy: 'position' }), manualOrder: new Map([[late1.id, 0]]) }))
    expect(groups[0]).toMatchObject({ key: 'earlier' })
    expect(titles(groups[0])).toEqual(['Late 8', 'Late 9'])
    expect(groups[0].daySlot).toBeUndefined()
    expect(dayOrderRows(groups).map((r) => r.task.title)).toEqual(['B'])
  })

  it('orders Upcoming\'s days by the same list, and each day takes a line that writes its date', () => {
    const gym = task({ title: 'Gym', due: { date: THURSDAY, time: '07:00' } })
    const bank = task({ title: 'Call the bank', due: { date: THURSDAY } })
    const friday = task({ title: 'Friday', due: { date: addDaysISO(THURSDAY, 1) } })
    const p = { view: 'upcoming' as const, tasks: [gym, bank, friday] }
    expect(listGroups(input(p)).map(titles)).toEqual([['Gym', 'Call the bank'], ['Friday']])
    const groups = listGroups(input({ ...p, display: shown({ sortBy: 'position' }, 'upcoming'), manualOrder: new Map([[bank.id, 0]]) }))
    expect(groups.map(titles)).toEqual([['Call the bank', 'Gym'], ['Friday']])
    expect(groups[0].daySlot).toEqual({ date: THURSDAY })
  })

  it('keeps an Upcoming day in part order under Manual order while day parts are on, and steps within a part', () => {
    const eve = task({ title: 'Eve', due: { date: THURSDAY }, evening: true })
    const morning = task({ title: 'Morning', due: { date: THURSDAY }, day_part: 'morning' })
    const nine = task({ title: 'Nine', due: { date: THURSDAY, time: '09:00' } })
    const groups = listGroups(input({ view: 'upcoming', tasks: [eve, morning, nine], dayParts: true, display: shown({ sortBy: 'position' }, 'upcoming'), manualOrder: new Map([[eve.id, 0], [morning.id, 1]]) }))
    expect(groups.map(titles)).toEqual([['Morning', 'Nine', 'Eve']])
    expect(groups[0].daySlot).toEqual({ date: THURSDAY, byPart: true })
    expect(dayOrderSiblings(groups, nine.id).map((x) => x.title)).toEqual(['Morning', 'Nine'])
    expect(dayOrderSiblings(groups, eve.id).map((x) => x.title)).toEqual(['Eve'])
  })

  it('slots do not move under Manual order: the slots keep their tasks, Waiting keeps its fill order', () => {
    const one = task({ title: 'One', due: { date: TODAY } })
    const two = task({ title: 'Two', due: { date: TODAY } })
    const three = task({ title: 'Three', due: { date: TODAY } })
    const four = task({ title: 'Four', due: { date: TODAY } })
    // The day order places a waiting task first; it still waits, and the slots show in the day order.
    const rank = new Map([[four.id, 0], [two.id, 1], [one.id, 2]])
    const groups = listGroups(input({ tasks: [one, two, three, four], display: shown({ sortBy: 'position' }), manualOrder: rank, closedList: { limit: 2, waiting: [three, four] } }))
    expect(groups.map((g) => [g.key, titles(g)])).toEqual([['today', ['Two', 'One']], ['waiting', []]])
    const open = listGroups(input({ tasks: [one, two, three, four], display: shown({ sortBy: 'position' }), manualOrder: rank, collapsed: new Set([WAITING_OPEN_KEY]), closedList: { limit: 2, waiting: [three, four] } }))
    expect(titles(open.find((g) => g.key === 'waiting')!)).toEqual(['Three', 'Four'])
    expect(dayOrderRows(open).map((r) => r.task.title)).toEqual(['Two', 'One'])
  })

  it('keeps the groups of an unchanged list, slots included (list-rendering-at-scale D6)', () => {
    const gym = task({ title: 'Gym', due: { date: THURSDAY } })
    const p = input({ view: 'upcoming', tasks: [gym, a], dayParts: true })
    const first = listGroups(p)
    expect(keepGroups(first, listGroups(p))).toBe(first)
    const today = input({ tasks: [a, b], dayParts: true })
    const before = listGroups(today)
    expect(keepGroups(before, listGroups(today))).toBe(before)
  })

  it('a date edited elsewhere keeps the rank: the task is listed on its new day by it', () => {
    const moved = task({ title: 'Moved', due: { date: addDaysISO(THURSDAY, 1) } })
    const there = task({ title: 'There', due: { date: addDaysISO(THURSDAY, 1) } })
    const groups = listGroups(input({ view: 'upcoming', tasks: [there, moved], display: shown({ sortBy: 'position' }, 'upcoming'), manualOrder: new Map([[moved.id, 0]]) }))
    expect(groups.map(titles)).toEqual([['Moved', 'There']])
  })
})

describe('Part of the day in the due order', () => {
  it('lists Thursday as Time of day would: no part, then Morning by time then untimed, then Evening', () => {
    const eve = task({ title: 'Evening', due: { date: THURSDAY }, evening: true })
    const none = task({ title: 'Untimed', due: { date: THURSDAY } })
    const morning = task({ title: 'Morning', due: { date: THURSDAY }, day_part: 'morning' })
    const nine = task({ title: '09:00', due: { date: THURSDAY, time: '09:00' } })
    const on = listGroups(input({ view: 'upcoming', tasks: [eve, none, morning, nine], dayParts: true }))
    expect(on.map(titles)).toEqual([['Untimed', '09:00', 'Morning', 'Evening']])
    // Day parts off: Due date as before (the time, then the rest by position).
    const off = listGroups(input({ view: 'upcoming', tasks: [eve, none, morning, nine] }))
    expect(off.map(titles)).toEqual([['Evening', 'Untimed', 'Morning', '09:00']])
  })

  it('keeps the shape of the day in Today grouped by Project', () => {
    const late = task({ title: '19:00', due: { date: TODAY, time: '19:00' }, project_id: 'work' })
    const morning = task({ title: 'Morning', due: { date: TODAY }, day_part: 'morning', project_id: 'work' })
    const groups = listGroups(input({ tasks: [late, morning], dayParts: true, display: shown({ groupBy: 'project' }) }))
    expect(groups.map(titles)).toEqual([['Morning', '19:00']])
  })

  it('compares the date first, so Earlier stays in day order, and reverses with Due date descending', () => {
    const yesterdayEve = task({ title: 'y-eve', due: { date: addDaysISO(TODAY, -1) }, evening: true })
    const todayMorning = task({ title: 't-morning', due: { date: TODAY }, day_part: 'morning' })
    const todayNone = task({ title: 't-none', due: { date: TODAY } })
    const none = task({ title: 'undated' })
    const sorted = (desc: boolean) => [none, todayMorning, yesterdayEve, todayNone].sort(compareDueWithParts(desc)).map((x) => x.title)
    expect(sorted(false)).toEqual(['y-eve', 't-none', 't-morning', 'undated'])
    expect(sorted(true)).toEqual(['t-morning', 't-none', 'y-eve', 'undated'])
  })
})
