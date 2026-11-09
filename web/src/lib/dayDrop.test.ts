// OpenSpec change upcoming-drag: a task dropped on another day of Upcoming moves there
// as a drop on the calendar does, as one batch with Undo.
import { beforeEach, describe, expect, it } from 'vitest'
import { currentDateTime } from './dates'
import { db, useDatabase } from './db'
import { dayDropPatch, planDayDrop } from './dayDrop'
import { listGroups, type GroupInput } from './listGroups'
import { createTask, resetDeviceId } from './ops'
import type { Task } from './types'
import { undoBatch } from './undo'
import { dayDropUndoable, dropUndoable } from './undoActions'

const TODAY = '2026-10-14'
let n = 0
function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: over.id ?? `t${n}`, title: over.title ?? `Task ${n}`, notes: '', project_id: 'p', section_id: null, parent_id: null, position: n,
    priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: n, updated_at: n,
    assignee_id: null, ...over,
  } as Task
}

describe('dayDropPatch', () => {
  it('moves the do-on date and keeps the time and the zone', () => {
    expect(dayDropPatch(task({ due: { date: '2026-10-15' } }), '2026-10-17', TODAY)).toEqual({ due: { date: '2026-10-17' } })
    expect(dayDropPatch(task({ due: { date: '2026-10-15', time: '09:30' } }), '2026-10-17', TODAY)).toEqual({ due: { date: '2026-10-17', time: '09:30' } })
    const zoned = dayDropPatch(task({ due: { date: '2026-10-15', time: '09:30', tz: 'Europe/Rome' } }), '2026-10-17', TODAY, 'Europe/Rome')
    expect(zoned).toEqual({ due: { date: '2026-10-17', time: '09:30', tz: 'Europe/Rome' } })
  })

  it('moves a repeating task like any other: only its date, the rule stays', () => {
    expect(dayDropPatch(task({ due: { date: '2026-10-15' }, recurrence: 'every week' } as Partial<Task>), '2026-10-16', TODAY)).toEqual({ due: { date: '2026-10-16' } })
  })

  it('writes nothing on the day the task is already on, or for a closed task', () => {
    expect(dayDropPatch(task({ due: { date: '2026-10-15' } }), '2026-10-15', TODAY)).toBeNull()
    expect(dayDropPatch(task({ due: { date: '2026-10-15' }, completed_at: 1 }), '2026-10-16', TODAY)).toBeNull()
  })

  it('never moves a deadline: a task listed by its deadline is planned for the day', () => {
    expect(dayDropPatch(task({ deadline: '2026-10-20' }), '2026-10-16', TODAY)).toEqual({ due: { date: '2026-10-16' } })
  })

  it('moves a span whole', () => {
    const span = task({ span: true, start: '2026-10-16', due: { date: '2026-10-18' } } as Partial<Task>)
    expect(dayDropPatch(span, '2026-10-20', TODAY)).toEqual({ start: '2026-10-20', due: { date: '2026-10-22' } })
    expect(dayDropPatch(span, '2026-10-16', TODAY)).toBeNull()
  })

  it('keeps a task listed by its start deferred, to the new day', () => {
    const deferred = task({ project_id: null, start: '2026-10-16' })
    expect(dayDropPatch(deferred, '2026-10-19', TODAY)).toEqual({ start: '2026-10-19' })
    expect(dayDropPatch(deferred, TODAY, TODAY)).toEqual({ start: null, due: { date: TODAY } })
  })

  it('plans one change per task that moves', () => {
    const a = task({ due: { date: '2026-10-15' } })
    const b = task({ due: { date: '2026-10-16' } })
    expect(planDayDrop([a, b], '2026-10-16', TODAY)).toEqual([{ entity: 'task', entityId: a.id, patch: { due: { date: '2026-10-16' } } }])
  })
})

describe('dropUndoable on a day', () => {
  let k = 0
  beforeEach(() => {
    useDatabase(`day-drop-${Date.now()}-${k++}`)
    resetDeviceId()
  })

  it('moves the task as one batch with Undo', async () => {
    const id = await createTask({ title: 'Dentist', due: { date: '2026-10-15', time: '10:00' } })
    await db.outbox.clear()
    const r = (await dayDropUndoable([id], '2026-10-17', TODAY))
    expect(r.label).toBe('Date changed')
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-17', time: '10:00' } })
    expect(new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
    await undoBatch(r.entry!.id)
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2026-10-15', time: '10:00' } })
  })

  it('carries the selection and names how many moved; the same day writes nothing', async () => {
    const a = await createTask({ title: 'A', due: { date: '2026-10-15' } })
    const b = await createTask({ title: 'B', due: { date: '2026-10-16' } })
    expect((await dayDropUndoable([a, b], '2026-10-18', TODAY)).label).toBe('2 tasks moved')
    await db.outbox.clear()
    expect((await dayDropUndoable([a], '2026-10-18', TODAY)).entry).toBeNull()
    expect(await db.outbox.count()).toBe(0)
  })

  it('resolves `day:<date>` targets and refuses anything else', async () => {
    const id = await createTask({ title: 'A', due: { date: '2099-01-01' } })
    expect((await dropUndoable('day:2099-01-03', [id]))!.label).toBe('Date changed')
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: '2099-01-03' } })
    expect(await dropUndoable('day:soon', [id])).toBeNull()
  })
})

describe('Upcoming groups take day drops', () => {
  function input(over: Partial<GroupInput>): GroupInput {
    return {
      view: 'upcoming', tasks: [], laterTasks: [], tree: null, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked: new Set(),
      taskMap: new Map(), projects: [], projectMap: new Map(), board: false, columns: [], buckets: null, sectionCount: 0, collapsedSections: [], logbook: null,
      ...over,
    }
  }
  const tasks = [
    task({ title: 'Late', due: { date: '2026-10-12' } }),
    task({ title: 'Now', due: { date: TODAY } }),
    task({ title: 'Evening', due: { date: TODAY }, evening: true }),
    task({ title: 'Tomorrow', due: { date: '2026-10-15' } }),
  ]

  it('each day group drops on its own date', () => {
    const gs = listGroups(input({ tasks: tasks.slice(3) }))
    expect(gs.map((g) => [g.key, g.dropDay])).toEqual([['2026-10-15', '2026-10-15']])
  })

  it('with Start with Today, Today and This Evening drop on today, Earlier takes no drop', () => {
    const gs = listGroups(input({ tasks, upcomingToday: true }))
    expect(gs.map((g) => [g.key, g.dropDay ?? null])).toEqual([['earlier', null], ['today', TODAY], ['evening', TODAY], ['2026-10-15', '2026-10-15']])
  })
})
