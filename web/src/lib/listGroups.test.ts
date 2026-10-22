// The task list's rows and groups as pure functions (OpenSpec change
// web-component-structure): what TaskListView renders, tested without a DOM.
import { describe, expect, it } from 'vitest'
import { currentDateTime } from './dates'
import { BLOCKED_OPEN_KEY, EARLIER_KEY, EARLIER_OPEN_KEY, earlierCollapsed, boardColumns, completedBySection, flatRow, listGroups, sectionBuckets, sectionOfRows, siblingPositions, tasksForView, type GroupInput } from './listGroups'
import { buildTaskTree } from './subtasks'
import type { Project, Section, Task } from './types'

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
const project = (id: string, position: number, over: Partial<Project> = {}) => ({ id, name: id.toUpperCase(), position, archived: false, deleted_at: null, ...over }) as Project
const section = (id: string, projectId: string, position: number) => ({ id, project_id: projectId, name: id, position, deleted_at: null }) as Section

function input(over: Partial<GroupInput>): GroupInput {
  return {
    view: 'inbox', tasks: [], laterTasks: [], tree: null, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked: new Set(),
    taskMap: new Map(), projects: [], projectMap: new Map(), board: false, columns: [], buckets: null, sectionCount: 0, collapsedSections: [], logbook: null,
    ...over,
  }
}
const titles = (g: { rows: { task: Task }[] }) => g.rows.map((r) => r.task.title)

describe('tasksForView', () => {
  it('keeps archived projects out of cross-project views but shows the project itself', () => {
    const archived = project('a', 1, { archived: true })
    const inArchived = task({ title: 'Archived', project_id: 'a', labels: ['l1'] })
    const inbox = task({ title: 'Inbox', labels: ['l1'] })
    const all = [inArchived, inbox]
    expect(tasksForView({ view: 'label', id: 'l1' }, all, [archived], TODAY).map((t) => t.title)).toEqual(['Inbox'])
    expect(tasksForView({ view: 'project', id: 'a' }, all, [archived], TODAY).map((t) => t.title)).toEqual(['Archived'])
    expect(tasksForView({ view: 'inbox' }, all, [archived], TODAY).map((t) => t.title)).toEqual(['Inbox'])
  })

  it('Completed is newest first and leaves out skipped habit occurrences; Assigned needs a user', () => {
    const older = task({ title: 'Older', completed_at: 1 })
    const newer = task({ title: 'Newer', completed_at: 2 })
    const skipped = task({ title: 'Skipped', completed_at: 3, skipped: true })
    const mine = task({ title: 'Mine', assignee_id: 'u1' })
    expect(tasksForView({ view: 'completed' }, [older, skipped, newer], [], TODAY).map((t) => t.title)).toEqual(['Newer', 'Older'])
    expect(tasksForView({ view: 'assigned' }, [mine], [], TODAY, 'u1').map((t) => t.title)).toEqual(['Mine'])
    expect(tasksForView({ view: 'assigned' }, [mine], [], TODAY)).toEqual([])
  })
})

describe('listGroups', () => {
  it('Today: Earlier, the day, This Evening, then a Blocked group that is folded until opened', () => {
    const late = task({ title: 'Late', due: { date: '2026-10-12' } })
    const day = task({ title: 'Day', due: { date: TODAY } })
    const eve = task({ title: 'Eve', due: { date: TODAY }, evening: true })
    const wait = task({ title: 'Wait', due: { date: TODAY } })
    const base = input({ view: 'today', tasks: [late, day, eve, wait], blocked: new Set([wait.id]) })
    const folded = listGroups(base)
    expect(folded.map((g) => g.key)).toEqual(['earlier', 'today', 'evening', 'blocked'])
    expect(folded[0].heading).toBe('Earlier')
    expect(folded.map(titles)).toEqual([['Late'], ['Day'], ['Eve'], []])
    expect(folded[3]).toMatchObject({ folded: true, count: 1 })
    const open = listGroups({ ...base, collapsed: new Set([BLOCKED_OPEN_KEY]) })
    expect(open[3]).toMatchObject({ folded: false, count: 1 })
    expect(titles(open[3])).toEqual(['Wait'])
  })

  it('a today without overdue or evening tasks has no heading', () => {
    const g = listGroups(input({ view: 'today', tasks: [task({ due: { date: TODAY } })] }))
    expect(g).toHaveLength(1)
    expect(g[0].heading).toBeNull()
  })

  it('label views group by project: Inbox first, then projects in sidebar order', () => {
    const b = project('b', 2), a = project('a', 1)
    const inB = task({ title: 'In B', project_id: 'b' })
    const inA = task({ title: 'In A', project_id: 'a' })
    const inbox = task({ title: 'In Inbox' })
    const g = listGroups(input({ view: 'label', tasks: [inB, inA, inbox], projects: [b, a], projectMap: new Map([[a.id, a], [b.id, b]]) }))
    expect(g.map((x) => x.key)).toEqual(['inbox', 'a', 'b'])
    expect(g.map((x) => x.heading)).toEqual(['Inbox', 'A', 'B'])
  })

  it('a tree view flattens the tree, skips collapsed children and puts Later last', () => {
    const parent = task({ title: 'Parent' })
    const child = task({ title: 'Child', parent_id: parent.id })
    const later = task({ title: 'Later', start: 'someday' })
    const tree = buildTaskTree([parent, child])
    const open = listGroups(input({ tree, laterTasks: [later] }))
    expect(open.map((g) => g.key)).toEqual(['all', 'later'])
    expect(titles(open[0])).toEqual(['Parent', 'Child'])
    expect(open[0].rows.map((r) => [r.depth, r.parent, r.hasChildren])).toEqual([[0, null, true], [1, parent.id, false]])
    const closed = listGroups(input({ tree, collapsed: new Set([parent.id]) }))
    expect(titles(closed[0])).toEqual(['Parent'])
    expect(closed[0].rows[0].collapsed).toBe(true)
  })

  it('a sectioned project lists "No section" first, then sections by position; a folded section keeps its count', () => {
    const s1 = section('s1', 'p', 1), s2 = section('s2', 'p', 2)
    const loose = task({ title: 'Loose', project_id: 'p' })
    const one = task({ title: 'One', project_id: 'p', section_id: 's1' })
    const two = task({ title: 'Two', project_id: 'p', section_id: 's2' })
    const tree = buildTaskTree([loose, one, two])
    const buckets = sectionBuckets('p', tree, [s2, s1])
    const g = listGroups(input({ view: 'project', tree, buckets, sectionCount: 2, collapsedSections: ['s2'] }))
    expect(g.map((x) => x.key)).toEqual(['section:', 'section:s1', 'section:s2'])
    expect(g.map(titles)).toEqual([['Loose'], ['One'], []])
    expect(g[2]).toMatchObject({ sectionCollapsed: true, count: 1 })
    expect(sectionOfRows(false, [], g)).toEqual(new Map([[loose.id, ''], [one.id, 's1']]))
  })

  it('the board has a column per section and "No section" only while it has cards', () => {
    const s1 = section('s1', 'p', 1)
    const one = task({ title: 'One', project_id: 'p', section_id: 's1' })
    const columns = boardColumns(sectionBuckets('p', buildTaskTree([one]), [s1]))
    expect(columns.map((c) => c.key)).toEqual(['s1'])
    const g = listGroups(input({ view: 'project', board: true, columns }))
    expect(g).toEqual([{ key: 's1', heading: null, rows: [flatRow(one)] }])
    expect(sectionOfRows(true, columns, g)).toEqual(new Map([[one.id, 's1']]))
  })

  it('the logbook has one group per day with a "done" note', () => {
    const done = task({ title: 'Done', completed_at: 1 })
    const g = listGroups(input({ view: 'completed', tasks: [done], logbook: { groups: [{ date: TODAY, tasks: [done] }] } }))
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ key: TODAY, note: '1 done' })
    expect(titles(g[0])).toEqual(['Done'])
  })

  it('a flat row whose parent is elsewhere names it in the breadcrumb', () => {
    const parent = task({ title: 'Parent' })
    const child = task({ title: 'Child', parent_id: parent.id, labels: ['l'] })
    const g = listGroups(input({ view: 'assigned', tasks: [child], taskMap: new Map([[parent.id, parent], [child.id, child]]) }))
    expect(g[0].rows[0].breadcrumb).toContain('Parent')
  })
})

// What a heading implies (task-list-presentation "Metadata language", calm-rows D3):
// one assertion per row of the spec's table that listGroups decides; the project
// chip rules are showProject in rowRenderer and the label rule is omitLabel.
describe('implied metadata', () => {
  const implied = (g: { rows: { implied?: unknown }[] }) => g.rows.map((r) => r.implied ?? null)
  const tomorrow = '2026-10-15'

  it('Today: the day and This Evening imply the date (and evening); Earlier and Blocked imply nothing', () => {
    const late = task({ due: { date: '2026-10-12' } })
    const day = task({ due: { date: TODAY, time: '10:00' } })
    const eve = task({ due: { date: TODAY }, evening: true })
    const wait = task({ due: { date: TODAY } })
    const g = listGroups(input({ view: 'today', tasks: [late, day, eve, wait], blocked: new Set([wait.id]), collapsed: new Set([BLOCKED_OPEN_KEY]) }))
    expect(g.map((x) => [x.key, implied(x)])).toEqual([
      ['earlier', [null]],
      ['today', [{ date: TODAY }]],
      ['evening', [{ date: TODAY, evening: true }]],
      ['blocked', [null]],
    ])
  })

  it('Upcoming: each date group implies its own day', () => {
    const a = task({ due: { date: tomorrow, time: '09:30' } })
    const b = task({ due: { date: '2026-10-20' } })
    const g = listGroups(input({ view: 'upcoming', tasks: [a, b] }))
    expect(g.map((x) => [x.key, implied(x)])).toEqual([[tomorrow, [{ date: tomorrow }]], ['2026-10-20', [{ date: '2026-10-20' }]]])
  })

  it('Someday implies Someday in every project group; label, Anytime and Assigned groups imply nothing', () => {
    const p1 = project('p1', 1)
    const rows = [task({ start: 'someday' }), task({ start: 'someday', project_id: 'p1' })]
    const someday = listGroups(input({ view: 'someday', tasks: rows, projects: [p1], projectMap: new Map([[p1.id, p1]]) }))
    expect(someday.map(implied)).toEqual([[{ someday: true }], [{ someday: true }]])
    for (const view of ['label', 'anytime', 'assigned'] as const) {
      expect(listGroups(input({ view, tasks: rows, projects: [p1], projectMap: new Map([[p1.id, p1]]) })).map(implied)).toEqual([[null], [null]])
    }
  })

  it('projects, sections, Later, trees, boards, the logbook and flat views imply nothing', () => {
    const s1 = section('s1', 'p', 1)
    const one = task({ project_id: 'p', section_id: 's1', due: { date: TODAY } })
    const later = task({ start: 'someday' })
    const tree = buildTaskTree([one])
    const buckets = sectionBuckets('p', tree, [s1])
    const sectioned = listGroups(input({ view: 'project', tree, buckets, sectionCount: 1, laterTasks: [later] }))
    expect(sectioned.map(implied)).toEqual([[null], [null]])
    expect(listGroups(input({ view: 'inbox', tree: buildTaskTree([later]) })).map(implied)).toEqual([[null]])
    const board = listGroups(input({ view: 'project', board: true, columns: boardColumns(buckets) }))
    expect(board.map(implied)).toEqual([[null]])
    const done = task({ completed_at: 1 })
    expect(listGroups(input({ view: 'completed', tasks: [done], logbook: { groups: [{ date: TODAY, tasks: [done] }] } })).map(implied)).toEqual([[null]])
  })
})

describe('row positions and section counts', () => {
  it('siblingPositions numbers each row among its visible siblings', () => {
    const parent = task({ title: 'Parent' })
    const a = task({ title: 'A', parent_id: parent.id })
    const b = task({ title: 'B', parent_id: parent.id })
    const other = task({ title: 'Other' })
    const g = listGroups(input({ tree: buildTaskTree([parent, a, b, other]) }))
    const pos = siblingPositions(g)
    expect(pos.get(parent.id)).toEqual({ pos: 1, size: 2 })
    expect(pos.get(other.id)).toEqual({ pos: 2, size: 2 })
    expect(pos.get(b.id)).toEqual({ pos: 2, size: 2 })
  })

  it('completedBySection buckets completed tasks of the project, not skipped occurrences', () => {
    const s1 = section('s1', 'p', 1)
    const done = task({ project_id: 'p', section_id: 's1', completed_at: 1 })
    const skipped = task({ project_id: 'p', section_id: 's1', completed_at: 1, skipped: true })
    const elsewhere = task({ project_id: 'q', completed_at: 1 })
    const m = completedBySection([done, skipped, elsewhere], 'p', new Map([[s1.id, s1]]))
    expect([...m.keys()]).toEqual(['s1'])
    expect(m.get('s1')).toEqual([done])
    expect(completedBySection([done], null, new Map()).size).toBe(0)
  })
})

// Today's Earlier group starts folded above five tasks on a device that never
// touched it (page-rhythm D5, task-list-presentation "Group headers").
describe('Earlier default collapse', () => {
  it('six tasks fold, five stay open, with no stored state', () => {
    expect(earlierCollapsed(new Set(), 6)).toBe(true)
    expect(earlierCollapsed(new Set(), 5)).toBe(false)
    expect(earlierCollapsed(new Set(), 2)).toBe(false)
  })
  it('what this device chose wins over the default', () => {
    expect(earlierCollapsed(new Set([EARLIER_OPEN_KEY]), 8)).toBe(false)
    expect(earlierCollapsed(new Set([EARLIER_KEY]), 2)).toBe(true)
  })
  it('keeps its own key, so the old Overdue collapse state does not carry over', () => {
    expect(EARLIER_KEY).toBe('today:earlier')
    expect(earlierCollapsed(new Set(['today:overdue']), 2)).toBe(false)
  })
})
