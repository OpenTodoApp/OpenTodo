// The task list's rows and groups as pure functions (OpenSpec change
// web-component-structure): what TaskListView renders, tested without a DOM.
import { describe, expect, it } from 'vitest'
import { currentDateTime } from './dates'
import { BLOCKED_OPEN_KEY, DONE_OPEN_KEY, WAITING_OPEN_KEY, EARLIER_KEY, EARLIER_OPEN_KEY, earlierCollapsed, boardColumns, completedBySection, flatRow, keepGroups, laterOpenKey, listGroups, sectionBuckets, sectionOfRows, siblingPositions, splitLater, tasksForView, type GroupInput, type ListGroup } from './listGroups'
import { defaultListDisplay, type ListDisplay } from './listDisplay'
import { setPriorityNames } from './priority'
import { buildTaskTree } from './subtasks'
import type { Label, Project, Section, Task } from './types'

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

  it('Today with day parts (day-parts D3): Today, Morning, Afternoon, This Evening; the time places a task without a part', () => {
    const untimed = task({ title: 'Untimed', due: { date: TODAY } })
    const habit = task({ title: 'Habit', due: { date: TODAY }, habit: true, recurrence: 'every day', day_part: 'morning' })
    const two = task({ title: 'Two', due: { date: TODAY, time: '14:00' } })
    const eve = task({ title: 'Eve', due: { date: TODAY }, evening: true })
    const late = task({ title: 'Twenty', due: { date: TODAY, time: '20:00' }, day_part: 'morning' })
    const night = task({ title: 'Night', due: { date: TODAY, time: '18:00' } })
    const tasks = [untimed, habit, two, eve, late, night]
    const on = listGroups(input({ view: 'today', tasks, dayParts: true }))
    expect(on.map((g) => [g.key, g.heading, g.dropPart])).toEqual([
      ['today', 'Today', 'none'], ['morning', 'Morning', 'morning'], ['afternoon', 'Afternoon', 'afternoon'], ['evening', 'This Evening', 'evening'],
    ])
    expect(on.map(titles)).toEqual([['Untimed'], ['Habit', 'Twenty'], ['Two'], ['Eve', 'Night']])
    expect(on[1].rows[0].implied).toEqual({ date: TODAY, part: 'morning' })
    // Off: exactly as before, the 14:00 task back in the day group, nothing to drop on.
    const off = listGroups(input({ view: 'today', tasks }))
    expect(off.map((g) => g.key)).toEqual(['today', 'evening'])
    expect(off.map(titles)).toEqual([['Untimed', 'Habit', 'Two', 'Twenty', 'Night'], ['Eve']])
    expect(off.every((g) => g.dropPart === undefined)).toBe(true)
  })

  it('Today with a limit (today-closed-list D1): waiting tasks leave the day groups for a folded group after Blocked, in fill order', () => {
    const a = task({ title: 'A', due: { date: TODAY } })
    const b = task({ title: 'B', due: { date: TODAY }, day_part: 'morning' })
    const f = task({ title: 'F', due: { date: TODAY }, day_part: 'morning' })
    const g = task({ title: 'G', due: { date: TODAY } })
    const wait = task({ title: 'Wait', due: { date: TODAY } })
    const base = input({ view: 'today', tasks: [a, b, f, g, wait], blocked: new Set([wait.id]), closedList: { limit: 2, waiting: [g, f] } })
    const folded = listGroups(base)
    expect(folded.map((x) => x.key)).toEqual(['today', 'blocked', 'waiting'])
    expect(folded.map(titles)).toEqual([['A', 'B'], [], []])
    expect(folded[2]).toMatchObject({ heading: 'Waiting for a slot', folded: true, count: 2, openKey: WAITING_OPEN_KEY })
    const open = listGroups({ ...base, collapsed: new Set([WAITING_OPEN_KEY]) })
    expect(titles(open[2])).toEqual(['G', 'F'])
    expect(open[2].hint).toBe('Today holds 2. The next one comes in when you finish one.')
    // With day parts on the slots keep their parts; the waiting ones still wait.
    const parts = listGroups({ ...base, dayParts: true })
    expect(parts.map((x) => x.key)).toEqual(['today', 'morning', 'blocked', 'waiting'])
    expect(parts.map(titles)).toEqual([['A'], ['B'], [], []])
  })

  it('folded Waiting keeps the tasks with a time today in sight, soonest first (today-waiting-time-sensitive D2)', () => {
    const a = task({ title: 'A', due: { date: TODAY } })
    const form = task({ title: 'Send the form', due: { date: TODAY, time: '16:00' } })
    const plain = task({ title: 'Plain', due: { date: TODAY } })
    const taxes = task({ title: 'File the taxes', deadline: TODAY })
    const resolved = { ...currentDateTime(), time: '12h' as const }
    const base = input({ view: 'today', tasks: [a, form, plain, taxes], resolved, closedList: { limit: 1, waiting: [form, plain, taxes] } })
    const folded = listGroups(base).find((x) => x.key === 'waiting')!
    expect(folded.soon!.map((s) => [s.task.title, s.time])).toEqual([['Send the form', '16:00'], ['File the taxes', null]])
    expect(folded.detail).toBe('next: Send the form, 4:00 PM')
    // Opened, the group is as before.
    const open = listGroups({ ...base, collapsed: new Set([WAITING_OPEN_KEY]) }).find((x) => x.key === 'waiting')!
    expect(open.soon).toBeUndefined()
    expect(titles(open)).toEqual(['Send the form', 'Plain', 'File the taxes'])
    // Only a deadline: named as such.
    const deadline = listGroups(input({ view: 'today', tasks: [a, taxes], closedList: { limit: 1, waiting: [taxes] } })).find((x) => x.key === 'waiting')!
    expect(deadline.detail).toBe('next: File the taxes, deadline today')
    // Upcoming's Start with Today draws the same folded group (upcoming-start-with-today D2).
    const tomorrow = task({ title: 'Tomorrow', due: { date: '2026-10-15' } })
    const upcoming = listGroups({ ...base, view: 'upcoming', tasks: [a, form, plain, taxes, tomorrow], upcomingToday: true }).find((x) => x.key === 'waiting')!
    expect(upcoming.soon!.map((s) => s.task.title)).toEqual(['Send the form', 'File the taxes'])
    expect(upcoming.detail).toBe('next: Send the form, 4:00 PM')
    // No time today: a plain heading.
    expect(listGroups(input({ view: 'today', tasks: [a, plain], closedList: { limit: 1, waiting: [plain] } })).find((x) => x.key === 'waiting')!.detail).toBeUndefined()
  })

  it('a time that has passed is marked and never named next (today-waiting-time-passed D2)', () => {
    const a = task({ title: 'A', due: { date: TODAY } })
    const call = task({ title: 'Call the school', due: { date: TODAY, time: '09:00' } })
    const form = task({ title: 'Send the form', due: { date: TODAY, time: '16:00' } })
    const taxes = task({ title: 'File the taxes', deadline: TODAY })
    const resolved = { ...currentDateTime(), time: '12h' as const }
    const waiting = (list: Task[], now: string) => listGroups(input({ view: 'today', tasks: [a, ...list], resolved, closedList: { limit: 1, waiting: list, now } })).find((x) => x.key === 'waiting')!
    const some = waiting([form, call, taxes], '12:00')
    expect(some.soon!.map((s) => [s.task.title, s.passed])).toEqual([['Call the school', true], ['Send the form', false], ['File the taxes', false]])
    expect(some.detail).toBe('next: Send the form, 4:00 PM')
    // Only a deadline left to come: it is next.
    expect(waiting([call, taxes], '12:00').detail).toBe('next: File the taxes, deadline today')
    // Every time passed: one by name, more by count.
    expect(waiting([call], '12:00').detail).toBe('time passed: Call the school, 9:00 AM')
    expect(waiting([form, call], '16:01').detail).toBe('2 past their time')
    // At the minute itself the time has not passed yet.
    expect(waiting([form], '16:00').detail).toBe('next: Send the form, 4:00 PM')
  })

  it('Today ends with a folded Done today group, newest first (today-closed-list D6)', () => {
    const open = task({ title: 'Open', due: { date: TODAY } })
    const done1 = task({ title: 'Done 1', completed_at: 5 })
    const done2 = task({ title: 'Done 2', completed_at: 9 })
    const base = input({ view: 'today', tasks: [open], doneToday: [done2, done1] })
    const folded = listGroups(base)
    expect(folded.map((x) => x.key)).toEqual(['today', 'done'])
    expect(folded[1]).toMatchObject({ heading: 'Done today', folded: true, count: 2, openKey: DONE_OPEN_KEY, rows: [] })
    expect(titles(listGroups({ ...base, collapsed: new Set([DONE_OPEN_KEY]) })[1])).toEqual(['Done 2', 'Done 1'])
    // Hidden: no group; an empty group still shows its zero count.
    expect(listGroups({ ...base, doneToday: undefined }).map((x) => x.key)).toEqual(['today'])
    expect(listGroups({ ...base, doneToday: [] })[1]).toMatchObject({ key: 'done', count: 0 })
  })

  it('Today with day parts and only one part has no Today heading', () => {
    const g = listGroups(input({ view: 'today', tasks: [task({ due: { date: TODAY }, day_part: 'afternoon' })], dayParts: true }))
    expect(g.map((x) => [x.key, x.heading])).toEqual([['afternoon', 'Afternoon']])
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

  // GitHub issue #755: a parent deferred to Later left its subtasks behind in its old group.
  it('a deferred parent takes its subtasks into Later, nested, with their own dates (subtasks-follow-later)', () => {
    const parent = task({ title: 'Paint fence', project_id: 'p', start: '2026-11-20' })
    const plain = task({ title: 'Buy paint', project_id: 'p', parent_id: parent.id })
    const dated = task({ title: 'Book sprayer', project_id: 'p', parent_id: parent.id, due: { date: TODAY } })
    const grandchild = task({ title: 'Compare prices', project_id: 'p', parent_id: plain.id })
    const other = task({ title: 'Water plants', project_id: 'p', due: { date: TODAY } })
    const all = [parent, plain, dated, grandchild, other]
    const { active, later } = splitLater(all, TODAY)
    expect(active.map((x) => x.title)).toEqual(['Water plants'])
    expect(later.map((x) => x.title)).toEqual(['Paint fence', 'Buy paint', 'Book sprayer', 'Compare prices'])
    const g = listGroups(input({ view: 'project', tasks: all, tree: buildTaskTree(active), laterTasks: later, taskMap: new Map(all.map((x) => [x.id, x])) }))
    expect(g.map((x) => x.key)).toEqual(['all', 'later'])
    expect(titles(g[0])).toEqual(['Water plants'])
    expect(g[1].rows.map((r) => [r.task.title, r.depth, r.parent, r.breadcrumb])).toEqual([
      ['Paint fence', 0, null, null], ['Buy paint', 1, parent.id, null], ['Compare prices', 2, plain.id, null], ['Book sprayer', 1, parent.id, null],
    ])
    // Folding the parent in Later hides its subtasks like anywhere else in the tree.
    const folded = listGroups(input({ view: 'project', tree: buildTaskTree(active), laterTasks: later, collapsed: new Set([parent.id]) }))
    expect(titles(folded[1])).toEqual(['Paint fence'])
  })

  it('a deferred or parked subtask of an active parent stays under it; grouping by date keeps the subtree together', () => {
    const parent = task({ title: 'Plan trip', project_id: 'p', due: { date: TODAY } })
    const deferred = task({ title: 'Renew passport', project_id: 'p', parent_id: parent.id, start: '2026-12-01' })
    const parked = task({ title: 'Upgrade seats', project_id: 'p', parent_id: parent.id, start: 'someday' })
    const { active, later } = splitLater([parent, deferred, parked], TODAY)
    expect(later).toEqual([])
    const display = { groupBy: 'due', sortBy: 'position', sortDir: 'asc', rowLayout: 'line' } as GroupInput['display']
    const g = listGroups(input({ view: 'project', tasks: active, tree: buildTaskTree(active), laterTasks: later, display }))
    const today = g.find((x) => x.rows.some((r) => r.task.id === parent.id))!
    expect(titles(today)).toEqual(['Plan trip', 'Renew passport', 'Upgrade seats'])
    expect(g.some((x) => x.key === 'later')).toBe(false)
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

  it('deferred and parked tasks stay in their section under a folded Later, with their subtasks (later-in-section)', () => {
    const s1 = section('s1', 'p', 1)
    const s2 = section('s2', 'p', 2)
    const active = task({ title: 'Active', project_id: 'p', section_id: 's1' })
    const deferred = task({ title: 'Deferred', project_id: 'p', section_id: 's1', start: '2026-11-20' })
    const sub = task({ title: 'Sub', project_id: 'p', section_id: 's1', parent_id: deferred.id })
    const parked = task({ title: 'Parked', project_id: 'p', section_id: 's2', start: 'someday' })
    const loose = task({ title: 'Loose', project_id: 'p', start: 'someday' })
    const gone = task({ title: 'Deleted section', project_id: 'p', section_id: 'gone', start: 'someday' })
    const all = [active, deferred, sub, parked, loose, gone]
    const split = splitLater(all, TODAY)
    const tree = buildTaskTree(split.active)
    const buckets = sectionBuckets('p', tree, [s1, s2])
    const base = input({ view: 'project', projectId: 'p', tasks: split.active, laterTasks: split.later, tree, buckets, sectionCount: 2 })
    // Folded by default: each Later shows its count and no rows; "No section" is listed for its Later alone.
    const folded = listGroups(base)
    expect(folded.map((g) => [g.key, g.count, g.folded ?? null, titles(g)])).toEqual([
      ['section:', 0, null, []], ['later:', 2, true, []],
      ['section:s1', 1, null, ['Active']], ['later:s1', 2, true, []],
      ['section:s2', 0, null, []], ['later:s2', 1, true, []],
    ])
    expect(folded[3]).toMatchObject({ heading: 'Later', laterOf: 's1', openKey: laterOpenKey('p', 's1') })
    // Opened on this device: its rows, the subtask nested under its deferred parent.
    const open = listGroups({ ...base, collapsed: new Set([laterOpenKey('p', 's1'), laterOpenKey('p', '')]) })
    expect(open.find((g) => g.key === 'later:s1')!.rows.map((r) => [r.task.title, r.depth, r.parent])).toEqual([['Deferred', 0, null], ['Sub', 1, deferred.id]])
    expect(titles(open.find((g) => g.key === 'later:')!)).toEqual(['Loose', 'Deleted section'])
    expect(open.find((g) => g.key === 'later:s2')!.rows).toEqual([])
    // A drop beside a Later row takes that section; the Later rows count among their own siblings.
    expect(sectionOfRows(false, [], open).get(deferred.id)).toBe('s1')
    expect(sectionOfRows(false, [], open).get(loose.id)).toBe('')
    expect(sectionOfRows(false, [], open).has(sub.id)).toBe(false)
    expect(siblingPositions(open).get(deferred.id)).toEqual({ pos: 1, size: 1 })
    // A collapsed section hides its Later as well.
    expect(listGroups({ ...base, collapsedSections: ['s1'] }).some((g) => g.key === 'later:s1')).toBe(false)
  })

  it('without sections, grouped otherwise or on the timeline, Later stays one group at the end', () => {
    const s1 = section('s1', 'p', 1)
    const active = task({ title: 'Active', project_id: 'p', section_id: 's1', priority: 1 })
    const deferred = task({ title: 'Deferred', project_id: 'p', section_id: 's1', start: '2026-11-20' })
    const tree = buildTaskTree([active])
    const buckets = sectionBuckets('p', tree, [s1])
    const base = input({ view: 'project', projectId: 'p', tasks: [active], laterTasks: [deferred], tree, buckets, sectionCount: 1 })
    const keys = (over: Partial<GroupInput>) => listGroups({ ...base, ...over }).map((g) => g.key)
    expect(keys({ timeline: true })).toEqual(['section:s1', 'later'])
    expect(keys({ sectionCount: 0, buckets: sectionBuckets('p', tree, []) })).toEqual(['all', 'later'])
    expect(keys({ display: { groupBy: 'none', sortBy: 'position', sortDir: 'asc', rowLayout: 'line' } as GroupInput['display'] })).toEqual(['all', 'later'])
    expect(keys({ display: { groupBy: 'priority', sortBy: 'position', sortDir: 'asc', rowLayout: 'line' } as GroupInput['display'] }).at(-1)).toBe('later')
    expect(listGroups({ ...base, timeline: true }).at(-1)).toMatchObject({ heading: 'Later', rows: [expect.objectContaining({ task: deferred })] })
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
    const later = task({ project_id: 'p', section_id: 's1', start: 'someday' })
    const tree = buildTaskTree([one])
    const buckets = sectionBuckets('p', tree, [s1])
    const sectioned = listGroups(input({ view: 'project', projectId: 'p', tree, buckets, sectionCount: 1, laterTasks: [later], collapsed: new Set([laterOpenKey('p', 's1')]) }))
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

  it('subtaskAdds marks nothing in a flat list (quick-subtask-add)', () => {
    const parent = task({ title: 'Parent' })
    const child = task({ title: 'Child', parent_id: parent.id })
    const rows = listGroups(input({ view: 'today', tasks: [parent, child] })).flatMap((g) => g.rows)
    expect(rows.every((r) => !r.subtaskAdds)).toBe(true)
  })

  it('subtaskAdds marks each parent\'s last visible descendant in a tree', () => {
    const parent = task({ title: 'Parent' })
    const a = task({ title: 'A', parent_id: parent.id })
    const b = task({ title: 'B', parent_id: parent.id })
    const other = task({ title: 'Other' })
    const rows = listGroups(input({ tree: buildTaskTree([parent, a, b, other]) })).flatMap((g) => g.rows)
    const byTitle = (t: string) => rows.find((r) => r.task.title === t)!
    expect(byTitle('B').subtaskAdds?.map((m) => m.task.title)).toEqual(['Parent'])
    expect(byTitle('B').subtaskAdds?.[0].depth).toBe(0)
    expect(byTitle('A').subtaskAdds).toBeUndefined()
    expect(byTitle('Parent').subtaskAdds).toBeUndefined()
    expect(byTitle('Other').subtaskAdds).toBeUndefined()
  })

  it('subtaskAdds marks nothing while the subtasks are folded', () => {
    const parent = task({ title: 'Parent' })
    const a = task({ title: 'A', parent_id: parent.id })
    const rows = listGroups(input({ tree: buildTaskTree([parent, a]), collapsed: new Set([parent.id]) })).flatMap((g) => g.rows)
    expect(rows).toHaveLength(1)
    expect(rows[0].subtaskAdds).toBeUndefined()
  })

  it('subtaskAdds marks several parents ending at one row, innermost first', () => {
    const gp = task({ title: 'Grandparent' })
    const p = task({ title: 'Parent', parent_id: gp.id })
    const c = task({ title: 'Child', parent_id: p.id })
    const other = task({ title: 'Other' })
    const rows = listGroups(input({ tree: buildTaskTree([gp, p, c, other]) })).flatMap((g) => g.rows)
    const byTitle = (t: string) => rows.find((r) => r.task.title === t)!
    // 'Other' ends both subtrees at once: Parent's line, then Grandparent's.
    expect(byTitle('Child').subtaskAdds?.map((m) => m.task.title)).toEqual(['Parent', 'Grandparent'])
    expect(byTitle('Other').subtaskAdds).toBeUndefined()
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

describe('the Inbox list (inbox-only-inbox)', () => {
  const own = task({ title: 'Undated' })
  const tree = buildTaskTree([own])

  it('is only its own tasks, also on a device that had opened the former planned group', () => {
    expect(listGroups(input({ view: 'inbox', tasks: [own], tree })).map((g) => g.key)).toEqual(['all'])
    expect(listGroups(input({ view: 'inbox', tasks: [own], tree, collapsed: new Set(['inbox:planned:open']) })).map((g) => g.key)).toEqual(['all'])
  })

  it('Today\'s Blocked group keeps its own open key', () => {
    const waiting = task({ title: 'Waiting', due: { date: TODAY } })
    const g = listGroups(input({ view: 'today', tasks: [waiting], blocked: new Set([waiting.id]) })).find((x) => x.key === 'blocked')!
    expect(g.openKey).toBe(BLOCKED_OPEN_KEY)
  })
})

describe('keepGroups (list-rendering-at-scale D6)', () => {
  // A project with two sections, as a write sees it: a new derivation each time.
  const p = project('p', 1)
  const sections = [section('s1', 'p', 1), section('s2', 'p', 2)]
  const derive = (tasks: Task[]) => {
    const tree = buildTaskTree(tasks)
    return listGroups(input({ view: 'project', tasks, tree, buckets: sectionBuckets('p', tree, sections), sectionCount: 2, projects: [p], projectMap: new Map([['p', p]]) }))
  }
  const a = task({ title: 'A', project_id: 'p', section_id: 's1' })
  const b = task({ title: 'B', project_id: 'p', section_id: 's1' })
  const c = task({ title: 'C', project_id: 'p', section_id: 's2' })
  const d = task({ title: 'D', project_id: 'p', section_id: 's2' })

  it('keeps the whole list when nothing changed', () => {
    const first = derive([a, b, c, d])
    expect(keepGroups(first, derive([a, b, c, d]))).toBe(first)
  })

  it('gives new objects only to the changed row and its group', () => {
    const first = derive([a, b, c, d])
    const c2 = { ...c, title: 'C renamed' }
    const next = keepGroups(first, derive([a, b, c2, d]))
    expect(next).not.toBe(first)
    const [s1, s2] = next.filter((g) => g.section)
    const [o1, o2] = first.filter((g) => g.section)
    expect(s1).toBe(o1)
    expect(s2).not.toBe(o2)
    expect(s2.rows[0]).not.toBe(o2.rows[0])
    expect(s2.rows[0].task.title).toBe('C renamed')
    expect(s2.rows[1]).toBe(o2.rows[1])
  })

  it('keeps the other rows of a group a task left', () => {
    const first = derive([a, b, c, d])
    const next = keepGroups(first, derive([b, c, d]))
    const [s1] = next.filter((g) => g.section)
    const [o1] = first.filter((g) => g.section)
    expect(s1).not.toBe(o1)
    expect(titles(s1)).toEqual(['B'])
    expect(s1.rows[0]).toBe(o1.rows[1])
    expect(s1.count).toBe(1)
  })

  it('takes the new row when its place changed', () => {
    const first = derive([a, b, c, d])
    const child = { ...b, parent_id: a.id }
    const next = keepGroups(first, derive([a, child, c, d]))
    const [s1] = next.filter((g) => g.section)
    expect(s1.rows.map((r) => [r.task.title, r.depth])).toEqual([['A', 0], ['B', 1]])
    expect(s1.rows[0].hasChildren).toBe(true)
  })
})

// Display options on Today, Upcoming and the Inbox (OpenSpec change builtin-view-options).
describe('built-in view options (builtin-view-options)', () => {
  const home = project('home', 1)
  const work = project('work', 2)
  const projects = [home, work]
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const d = (kind: 'today' | 'upcoming' | 'inbox', over: Partial<ListDisplay> = {}): ListDisplay => ({ ...defaultListDisplay(kind), ...over })
  const today = (tasks: Task[], over: Partial<GroupInput> = {}) => input({ view: 'today', tasks, projects, projectMap, taskMap: new Map(tasks.map((x) => [x.id, x])), ...over })
  const shape = (groups: ListGroup[]) => groups.map((g) => [g.key, g.heading, titles(g)])

  it('with every option at its default, Today, Upcoming and the Inbox are exactly as before (D2 "Defaults")', () => {
    const late = task({ title: 'Late', due: { date: '2026-10-12' }, priority: 1 })
    const day = task({ title: 'Day', due: { date: TODAY, time: '10:00' } })
    const morning = task({ title: 'Morning', due: { date: TODAY }, day_part: 'morning' })
    const eve = task({ title: 'Eve', due: { date: TODAY }, evening: true })
    const wait = task({ title: 'Wait', due: { date: TODAY } })
    const slot = task({ title: 'Slot', due: { date: TODAY }, priority: 2 })
    const child = task({ title: 'Child', due: { date: TODAY }, parent_id: day.id })
    const next = task({ title: 'Next', due: { date: '2026-10-15' } })
    const all = [late, day, morning, eve, wait, slot, child]
    const fixtures: GroupInput[] = [
      today(all, { blocked: new Set([wait.id]), collapsed: new Set([BLOCKED_OPEN_KEY]) }),
      today(all, { dayParts: true }),
      today(all, { closedList: { limit: 2, waiting: [slot, eve] }, doneToday: [task({ title: 'Done', completed_at: 5 })], collapsed: new Set([WAITING_OPEN_KEY, DONE_OPEN_KEY]) }),
      input({ view: 'upcoming', tasks: [next, task({ title: 'Later', due: { date: '2026-10-20' } })] }),
      input({ view: 'upcoming', tasks: [late, day, eve, next], upcomingToday: true, dayParts: true }),
    ]
    for (const f of fixtures) {
      const kind = f.view as 'today' | 'upcoming'
      const withOptions = listGroups({ ...f, display: d(kind), todayDisplay: f.upcomingToday ? d('today') : undefined })
      expect(withOptions).toEqual(listGroups(f))
    }
    const inboxTasks = [task({ title: 'B', position: 2 }), task({ title: 'A', position: 1 })]
    const inbox = input({ view: 'inbox', tasks: inboxTasks, tree: buildTaskTree(inboxTasks) })
    expect(listGroups({ ...inbox, display: d('inbox') })).toEqual(listGroups(inbox))
  })

  it('Today by project: Earlier first with its late task, then the projects, then Blocked folded (D3)', () => {
    const late = task({ title: 'Late', due: { date: '2026-10-13' }, project_id: 'home' })
    const w1 = task({ title: 'W1', due: { date: TODAY }, project_id: 'work' })
    const w2 = task({ title: 'W2', due: { date: TODAY }, project_id: 'work', evening: true })
    const h1 = task({ title: 'H1', due: { date: TODAY }, project_id: 'home', day_part: 'morning' })
    const stuck = task({ title: 'Stuck', due: { date: TODAY }, project_id: 'work' })
    const g = listGroups(today([late, w1, w2, h1, stuck], { blocked: new Set([stuck.id]), dayParts: true, display: d('today', { groupBy: 'project' }) }))
    expect(shape(g)).toEqual([['earlier', 'Earlier', ['Late']], ['day:home', 'HOME', ['H1']], ['day:work', 'WORK', ['W1', 'W2']], ['blocked', 'Blocked', []]])
    expect(g[3]).toMatchObject({ folded: true, count: 1 })
    expect(g[1]).toMatchObject({ named: true })
    // The heading names the project, the date stays implied, and the part of the day shows on the row.
    expect(g[1].rows[0].implied).toEqual({ date: TODAY, project: true })
    expect(g[0].rows[0].implied).toBeUndefined()
    // Only Time of day's headings take drops.
    expect(g.some((x) => x.dropPart)).toBe(false)
  })

  it('Today by priority, label and None: each task once, the part of the day on its row', () => {
    const l1 = { id: 'l1', name: 'Calls', color: '#000', position: 1, created_at: 0, deleted_at: null } as Label
    const l2 = { id: 'l2', name: 'Errands', color: '#000', position: 2, created_at: 0, deleted_at: null } as Label
    const late = task({ title: 'Late', due: { date: '2026-10-13' } })
    const a = task({ title: 'A', due: { date: TODAY }, priority: 2, labels: ['l2', 'l1'] })
    const b = task({ title: 'B', due: { date: TODAY }, evening: true })
    expect(shape(listGroups(today([a, b], { display: d('today', { groupBy: 'priority' }) })))).toEqual([['day:p2', 'Priority 2', ['A']], ['day:p4', 'No priority', ['B']]])
    const byLabel = listGroups(today([a, b], { labels: [l1, l2], display: d('today', { groupBy: 'label' }) }))
    expect(shape(byLabel)).toEqual([['day:l1', 'Calls', ['A']], ['day:none', 'No label', ['B']]])
    expect(byLabel[0].named).toBe(true)
    expect(byLabel[1].rows[0].implied).toEqual({ date: TODAY })
    expect(shape(listGroups(today([a, b], { display: d('today', { groupBy: 'none' }) })))).toEqual([['day:all', null, ['A', 'B']]])
    expect(shape(listGroups(today([late, a, b], { display: d('today', { groupBy: 'none' }) })))).toEqual([['earlier', 'Earlier', ['Late']], ['day:all', 'Today', ['A', 'B']]])
  })

  it('Order inside Earlier: by priority, descending, the priority-1 task first', () => {
    const mon = task({ title: 'Monday p3', due: { date: '2026-10-12' }, priority: 3 })
    const tue = task({ title: 'Tuesday p1', due: { date: '2026-10-13' }, priority: 1 })
    const g = listGroups(today([mon, tue], { display: d('today', { sortBy: 'priority', sortDir: 'desc' }) }))
    expect(shape(g)).toEqual([['earlier', 'Earlier', ['Tuesday p1', 'Monday p3']], ['today', 'Today', []]])
    // Default: due first.
    expect(titles(listGroups(today([mon, tue]))[0])).toEqual(['Monday p3', 'Tuesday p1'])
  })

  it('Slots do not move: ordered by title, the slots are listed by title and Waiting keeps its fill order', () => {
    const [e, c, a, d1, b] = ['E', 'C', 'A', 'D', 'B'].map((title) => task({ title, due: { date: TODAY } }))
    const closedList = { limit: 3, waiting: [b, d1] }
    const g = listGroups(today([e, c, a, d1, b], { closedList, collapsed: new Set([WAITING_OPEN_KEY]), display: d('today', { sortBy: 'title' }) }))
    expect(shape(g)).toEqual([['today', null, ['A', 'C', 'E']], ['waiting', 'Waiting for a slot', ['B', 'D']]])
    expect(g[1].count).toBe(2)
  })

  it('Done today stays newest first whatever the order', () => {
    const one = task({ title: 'Older', completed_at: 1 })
    const two = task({ title: 'Newer', completed_at: 2 })
    const g = listGroups(today([task({ title: 'X', due: { date: TODAY } })], { doneToday: [two, one], collapsed: new Set([DONE_OPEN_KEY]), display: d('today', { sortBy: 'title' }) }))
    expect(titles(g.find((x) => x.key === 'done')!)).toEqual(['Newer', 'Older'])
  })

  it('Upcoming by priority: each day by priority, still one group per day that takes drops (D4)', () => {
    const thu = '2026-10-15'
    const timed = task({ title: 'p4 at nine', due: { date: thu, time: '09:00' }, priority: 4 })
    const urgent = task({ title: 'p1', due: { date: thu }, priority: 1 })
    const fri = task({ title: 'Friday', due: { date: '2026-10-16' } })
    const base = input({ view: 'upcoming', tasks: [timed, urgent, fri] })
    expect(shape(listGroups(base)).map((x) => x[2])).toEqual([['p4 at nine', 'p1'], ['Friday']])
    const g = listGroups({ ...base, display: d('upcoming', { sortBy: 'priority', sortDir: 'desc' }) })
    expect(g.map((x) => [x.key, titles(x), x.dropDay])).toEqual([[thu, ['p1', 'p4 at nine'], thu], ['2026-10-16', ['Friday'], '2026-10-16']])
    const titleDesc = listGroups({ ...base, display: d('upcoming', { sortBy: 'title', sortDir: 'desc' }) })
    expect(titles(titleDesc[0])).toEqual(['p4 at nine', 'p1'])
  })

  it('Start with Today: the Today groups follow Today\'s options, Tomorrow onwards Upcoming\'s (D4)', () => {
    const late = task({ title: 'Late', due: { date: '2026-10-13' }, project_id: 'home' })
    const w = task({ title: 'Work today', due: { date: TODAY }, project_id: 'work' })
    const h = task({ title: 'Home today', due: { date: TODAY }, project_id: 'home' })
    const z = task({ title: 'Zebra', due: { date: '2026-10-15' }, priority: 1 })
    const a = task({ title: 'Apple', due: { date: '2026-10-15' }, priority: 4 })
    const g = listGroups(input({
      view: 'upcoming', tasks: [late, w, h, z, a], projects, projectMap, upcomingToday: true,
      display: d('upcoming', { sortBy: 'title' }), todayDisplay: d('today', { groupBy: 'project' }),
    }))
    expect(shape(g)).toEqual([['earlier', 'Earlier', ['Late']], ['day:home', 'HOME', ['Home today']], ['day:work', 'WORK', ['Work today']], ['2026-10-15', 'Tomorrow', ['Apple', 'Zebra']]])
    // The headings of another grouping take no drop.
    expect(g.filter((x) => x.key.startsWith('day:')).every((x) => !x.dropDay)).toBe(true)
  })

  it('Grouped by priority, renamed levels head their groups in the order 1 to 4 (priority-names)', () => {
    setPriorityNames(['Must', 'Should', '', ''])
    const tasks = [task({ title: 'D', priority: 4 }), task({ title: 'B', priority: 2 }), task({ title: 'C', priority: 3 }), task({ title: 'A', priority: 1 })]
    const g = listGroups(input({ view: 'inbox', tasks, tree: buildTaskTree(tasks), display: d('inbox', { groupBy: 'priority' }) }))
    expect(g.map((x) => [x.key, x.heading])).toEqual([['p1', 'Must'], ['p2', 'Should'], ['p3', 'Priority 3'], ['p4', 'No priority']])
    expect(tasks.map((x) => x.priority)).toEqual([4, 2, 3, 1])
  })

  it('Inbox by priority: a subtask stays under its parent, indented, in its manual order (D6)', () => {
    const parent = task({ title: 'Parent p2', priority: 2 })
    const sub = task({ title: 'Sub p4', priority: 4, parent_id: parent.id })
    const other = task({ title: 'Other p4', priority: 4 })
    const tasks = [parent, sub, other]
    const g = listGroups(input({ view: 'inbox', tasks, tree: buildTaskTree(tasks), display: d('inbox', { groupBy: 'priority' }) }))
    expect(g.map((x) => [x.key, x.heading, x.rows.map((r) => [r.task.title, r.depth])])).toEqual([
      ['p2', 'Priority 2', [['Parent p2', 0], ['Sub p4', 1]]],
      ['p4', 'No priority', [['Other p4', 0]]],
    ])
    // Ordered by title, descending: top-level tasks only.
    const byTitle = listGroups(input({ view: 'inbox', tasks, tree: buildTaskTree(tasks), display: d('inbox', { sortBy: 'title', sortDir: 'desc' }) }))
    expect(byTitle[0].rows.map((r) => r.task.title)).toEqual(['Parent p2', 'Sub p4', 'Other p4'])
  })

  describe('Nest subtasks (D5)', () => {
    const nested = d('today', { subtasks: true })
    const rows = (g: ListGroup) => g.rows.map((r) => [r.task.title, r.depth, r.breadcrumb])

    it('parent and child due today: nested to any depth', () => {
      const plan = task({ title: 'Plan trip', due: { date: TODAY } })
      const book = task({ title: 'Book flights', due: { date: TODAY }, parent_id: plan.id })
      const compare = task({ title: 'Compare prices', due: { date: TODAY }, parent_id: book.id })
      const g = listGroups(today([compare, book, plan], { display: nested }))
      expect(rows(g[0])).toEqual([['Plan trip', 0, null], ['Book flights', 1, null], ['Compare prices', 2, null]])
      expect(g[0].rows[0]).toMatchObject({ hasChildren: true, parent: null })
      const pos = siblingPositions(g)
      expect(pos.get(book.id)).toEqual({ pos: 1, size: 1 })
      // Off: flat, each with its breadcrumb, as before.
      expect(listGroups(today([compare, book, plan])).flatMap((x) => x.rows.map((r) => r.depth))).toEqual([0, 0, 0])
    })

    it('parent in another group: the child stays a row of its own with the breadcrumb', () => {
      const plan = task({ title: 'Plan trip', due: { date: '2026-10-13' } })
      const book = task({ title: 'Book flights', due: { date: TODAY }, parent_id: plan.id })
      const g = listGroups(today([plan, book], { display: nested }))
      expect(g.map((x) => [x.key, rows(x)])).toEqual([['earlier', [['Plan trip', 0, null]]], ['today', [['Book flights', 0, 'Plan trip']]]])
    })

    it('parent not in the view: listed once with its breadcrumb, the parent not shown', () => {
      const plan = task({ title: 'Plan trip' })
      const compare = task({ title: 'Compare prices', due: { date: TODAY }, parent_id: plan.id })
      const g = listGroups(today([compare], { display: nested, taskMap: new Map([[plan.id, plan], [compare.id, compare]]) }))
      expect(g.map(rows)).toEqual([[['Compare prices', 0, 'Plan trip']]])
    })

    it('collapsed on this device: the subtasks are hidden, the parent row says so', () => {
      const plan = task({ title: 'Plan trip', due: { date: TODAY } })
      const book = task({ title: 'Book flights', due: { date: TODAY }, parent_id: plan.id })
      const g = listGroups(today([plan, book], { display: nested, collapsed: new Set([plan.id]) }))
      expect(rows(g[0])).toEqual([['Plan trip', 0, null]])
      expect(g[0].rows[0]).toMatchObject({ collapsed: true, hasChildren: true })
    })

    it('the order sorts top-level rows; subtasks keep their manual order; Upcoming nests within a day', () => {
      const p = task({ title: 'Parent', due: { date: '2026-10-15' }, priority: 4 })
      const c2 = task({ title: 'Second', due: { date: '2026-10-15' }, parent_id: p.id, position: 2, priority: 1 })
      const c1 = task({ title: 'First', due: { date: '2026-10-15' }, parent_id: p.id, position: 1, priority: 4 })
      const solo = task({ title: 'Solo', due: { date: '2026-10-15' }, priority: 1 })
      const tasks = [p, c2, c1, solo]
      const g = listGroups(input({ view: 'upcoming', tasks, taskMap: new Map(tasks.map((x) => [x.id, x])), display: d('upcoming', { subtasks: true, sortBy: 'priority', sortDir: 'desc' }) }))
      expect(rows(g[0])).toEqual([['Solo', 0, null], ['Parent', 0, null], ['First', 1, null], ['Second', 1, null]])
      expect(g[0].rows[2].implied).toEqual({ date: '2026-10-15' })
    })
  })

  it('a write under a non-default option keeps the rows and groups it did not change (D3, risks)', () => {
    const a = task({ title: 'A', due: { date: TODAY }, project_id: 'home' })
    const b = task({ title: 'B', due: { date: TODAY }, project_id: 'work' })
    const c = task({ title: 'C', due: { date: TODAY }, project_id: 'work' })
    const display = d('today', { groupBy: 'project', sortBy: 'title', subtasks: true })
    const first = listGroups(today([a, b, c], { display }))
    expect(keepGroups(first, listGroups(today([a, b, c], { display })))).toBe(first)
    const c2: Task = { ...c, priority: 1 }
    const next = keepGroups(first, listGroups(today([a, b, c2], { display })))
    expect(next[0]).toBe(first[0])
    expect(next[1]).not.toBe(first[1])
    expect(next[1].rows[0]).toBe(first[1].rows[0])
  })
})
