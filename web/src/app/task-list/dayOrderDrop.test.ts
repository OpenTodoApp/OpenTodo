// @vitest-environment happy-dom
// OpenSpec change day-manual-order, task 2.3: where a drag lands in Today's and
// Upcoming's day order, and what the line writes (design D2).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDaysISO, currentDateTime } from '../../lib/dates'
import { defaultListDisplay } from '../../lib/listDisplay'
import { listGroups, type GroupInput, type ListGroup } from '../../lib/listGroups'
import { stepAnchor } from '../../lib/viewOrder'
import { dayOrderSiblings } from '../../lib/listGroups'
import type { Task } from '../../lib/types'
import { dayOrderDrop } from './dayOrderDrop'

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
function groupsOf(over: Partial<GroupInput>): ListGroup[] {
  return listGroups({
    view: 'today', tasks: [], laterTasks: [], tree: null, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked: new Set(),
    taskMap: new Map(), projects: [], projectMap: new Map(), board: false, columns: [], buckets: null, sectionCount: 0, collapsedSections: [], logbook: null, ...over,
  })
}

/** Rows on screen, 20 px each, in the order the groups list them. */
function render(groups: readonly ListGroup[]) {
  document.body.innerHTML = ''
  groups.flatMap((g) => g.rows).forEach((r, i) => {
    const el = document.createElement('div')
    el.setAttribute('data-task-id', r.task.id)
    el.getBoundingClientRect = () => ({ top: i * 20, height: 20, bottom: i * 20 + 20, left: 0, right: 100, width: 100, x: 0, y: i * 20, toJSON: () => ({}) })
    document.body.append(el)
  })
}
const rowY = (groups: readonly ListGroup[], id: string, half: 'top' | 'bottom') => groups.flatMap((g) => g.rows).findIndex((r) => r.task.id === id) * 20 + (half === 'top' ? 4 : 16)

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('Today grouped by Time of day', () => {
  const untimed = task({ title: 'Untimed', due: { date: TODAY } })
  const nine = task({ title: 'Nine', due: { date: TODAY, time: '09:00' } })
  const a = task({ title: 'A', due: { date: TODAY }, day_part: 'afternoon' })
  const b = task({ title: 'B', due: { date: TODAY }, day_part: 'afternoon' })
  const late = task({ title: 'Late', due: { date: addDaysISO(TODAY, -1) } })
  const groups = groupsOf({ tasks: [late, untimed, nine, a, b], dayParts: true, display: { ...defaultListDisplay('today'), sortBy: 'position' }, manualOrder: new Map() })
  const c = { groups, parts: true, canEdit: () => true }

  it('places within the task\'s own part without writing a part', () => {
    render(groups)
    const r = dayOrderDrop(c, b, `task:${a.id}`, 0, rowY(groups, a.id, 'top'))
    expect(r).toEqual({ indicator: { id: a.id, zone: 'before' }, drop: { kind: 'day', at: { before: a.id } } })
  })

  it('a line in another part writes that part, named on the line; a timed task keeps out of the part-less group', () => {
    render(groups)
    const r = dayOrderDrop(c, untimed, `task:${a.id}`, 0, rowY(groups, a.id, 'bottom'))
    expect(r).toEqual({ indicator: { id: a.id, zone: 'after', note: 'Move to Afternoon' }, drop: { kind: 'day', at: { after: a.id }, part: 'afternoon' } })
    expect(dayOrderDrop(c, nine, `task:${untimed.id}`, 0, rowY(groups, untimed.id, 'top'))).toBeNull()
    expect(dayOrderDrop(c, nine, `task:${a.id}`, 0, rowY(groups, a.id, 'top'))?.drop.part).toBe('afternoon')
  })

  it('takes no line in Earlier, nor for a part the user may not change, and a viewer still orders within a part', () => {
    render(groups)
    expect(dayOrderDrop(c, late, `task:${a.id}`, 0, rowY(groups, a.id, 'top'))).toBeNull()
    expect(dayOrderDrop(c, a, `task:${late.id}`, 0, rowY(groups, late.id, 'top'))).toBeNull()
    const viewer = { ...c, canEdit: () => false }
    expect(dayOrderDrop(viewer, untimed, `task:${a.id}`, 0, rowY(groups, a.id, 'top'))).toBeNull()
    expect(dayOrderDrop(viewer, b, `task:${a.id}`, 0, rowY(groups, a.id, 'top'))?.drop).toEqual({ kind: 'day', at: { before: a.id } })
  })

  it('keyboard steps stop at the edge of the part', () => {
    const siblings = dayOrderSiblings(groups, a.id).map((x) => x.id)
    expect(siblings).toEqual([a.id, b.id])
    expect(stepAnchor(siblings, a.id, -1)).toBeNull()
    expect(stepAnchor(siblings, b.id, 1)).toBeNull()
    expect(stepAnchor(siblings, b.id, 'top')).toEqual({ before: a.id })
    expect(dayOrderSiblings(groups, late.id)).toEqual([])
  })
})

describe('Today grouped by Priority', () => {
  it('keeps a line within the task\'s own priority group', () => {
    const one = task({ title: 'P1', due: { date: TODAY }, priority: 1 })
    const four = task({ title: 'P4', due: { date: TODAY } })
    const other = task({ title: 'P4 too', due: { date: TODAY } })
    const groups = groupsOf({ tasks: [one, four, other], display: { ...defaultListDisplay('today'), groupBy: 'priority' } })
    render(groups)
    const c = { groups, parts: false, canEdit: () => true }
    expect(dayOrderDrop(c, one, `task:${four.id}`, 0, rowY(groups, four.id, 'top'))).toBeNull()
    expect(dayOrderDrop(c, other, `task:${four.id}`, 0, rowY(groups, four.id, 'top'))?.drop).toEqual({ kind: 'day', at: { before: four.id } })
  })
})

describe('Upcoming', () => {
  const call = task({ title: 'Call Ada', due: { date: addDaysISO(TODAY, 1) } })
  const gym = task({ title: 'Gym', due: { date: THURSDAY } })
  const eve = task({ title: 'Eve', due: { date: THURSDAY }, evening: true })
  const groups = groupsOf({ view: 'upcoming', tasks: [call, gym, eve], dayParts: true })
  const c = { groups, parts: true, canEdit: () => true }

  it('reads the row under the pointer from a day target, and a line in another day writes the date and the part beside it', () => {
    render(groups)
    const at = (id: string) => vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.querySelector(`[data-task-id="${id}"]`))
    at(eve.id)
    const r = dayOrderDrop(c, call, `drop:day:${THURSDAY}`, 0, rowY(groups, eve.id, 'top'))
    expect(r?.drop).toEqual({ kind: 'day', at: { before: eve.id }, date: THURSDAY, part: 'evening' })
    expect(r?.indicator.note).toMatch(/^Move to .+ · Evening$/)
    at(gym.id)
    expect(dayOrderDrop(c, call, `drop:day:${THURSDAY}`, 0, rowY(groups, gym.id, 'top'))?.drop).toEqual({ kind: 'day', at: { before: gym.id }, date: THURSDAY })
  })

  it('over a day without a row under the pointer (its heading, a closed summarised bar) there is no line', () => {
    render(groups)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null)
    expect(dayOrderDrop(c, call, `drop:day:${THURSDAY}`, 0, 0)).toBeNull()
  })
})
