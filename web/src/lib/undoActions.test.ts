// OpenSpec change rule-boards, task 2.3: a drop on a board column as one undoable batch.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createProject, createTask, resetDeviceId, updateTask } from './ops'
import { addReminder } from './reminders'
import { deadlineFireAt } from './reminderTime'
import type { OnDropRule } from './types'
import { redoBatch, topUndo, undoBatch } from './undo'
import { assigneeUndoable, calendarEditUndoable, deadlineUndoable, dropOnPanel, dropUndoable, estimateUndoable, eveningUndoable, parkUndoable, priorityUndoable } from './undoActions'

let n = 0
beforeEach(() => {
  useDatabase(`undo-actions-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-14'
const URGENT_IMPORTANT = { name: 'Urgent and important', query: '(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', on_drop: { priority: 1, due: 'today' } as OnDropRule }
const IMPORTANT = { name: 'Important, not urgent', query: '(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday', on_drop: { priority: 2, due: 'next-week' } as OnDropRule }

async function drop(id: string, view: typeof URGENT_IMPORTANT) {
  const [labels, projects, sections, tasks] = await Promise.all([db.labels.toArray(), db.projects.toArray(), db.sections.toArray(), db.tasks.toArray()])
  return dropOnPanel(id, view, { filter: { today: TODAY, labels, projects, tasks }, names: { labels, projects, sections }, today: TODAY })
}

describe('dropOnPanel', () => {
  it('writes one batch, names the column and the changes, and Undo restores (spec "Toast and undo")', async () => {
    const id = await createTask({ title: 'Report', priority: 3 })
    await db.outbox.clear()
    const r = await drop(id, URGENT_IMPORTANT)
    expect(r.label).toBe('Moved to Urgent and important: priority 1, due today')
    expect(r.matches).toBe(true)
    expect(await db.tasks.get(id)).toMatchObject({ priority: 1, due: { date: TODAY } })
    const stamps = new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`))
    expect(stamps.size).toBe(1)
    const u = await undoBatch(r.entry!.id)
    expect(u.skipped).toEqual([])
    expect(await db.tasks.get(id)).toMatchObject({ priority: 3, due: null })
  })

  it('Undo keeps a field changed again since and names the task', async () => {
    const id = await createTask({ title: 'Report', priority: 3 })
    const r = await drop(id, URGENT_IMPORTANT)
    await updateTask(id, { priority: 2 })
    const u = await undoBatch(r.entry!.id)
    expect(u.skipped).toEqual(['Report'])
    expect(await db.tasks.get(id)).toMatchObject({ priority: 2, due: null })
  })

  it('writes nothing for a task that already matches the rule (spec "Nothing to change")', async () => {
    const id = await createTask({ title: 'Report', priority: 1, due: { date: TODAY } })
    await db.outbox.clear()
    const r = await drop(id, URGENT_IMPORTANT)
    expect(r).toMatchObject({ entry: null, changed: false, label: 'Report already matches Urgent and important' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('says when the task still does not match the column (spec "Still not matching after the rule")', async () => {
    const id = await createTask({ title: 'Tax return', priority: 4, deadline: '2026-10-15' })
    const r = await drop(id, IMPORTANT)
    expect(r.matches).toBe(false)
    expect(r.label).toBe('Moved to Important, not urgent: priority 2, due next week It does not match the column’s filter.')
    expect((await db.tasks.get(id))!.priority).toBe(2)
  })
})

// OpenSpec change day-parts, D4: a task dropped on a part heading of Today gets
// that part, both fields in one batch, and Undo puts it back.
describe('part headings', () => {
  it('a drop on Afternoon writes the pair with Undo; Any time clears it; the same part writes nothing', async () => {
    const id = await createTask({ title: 'Stretch', evening: true })
    await db.outbox.clear()
    const r = (await dropUndoable('part:afternoon', [id]))!
    expect(r.label).toBe('Moved to Afternoon')
    expect(await db.tasks.get(id)).toMatchObject({ day_part: 'afternoon', evening: false })
    expect(new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
    expect((await dropUndoable('part:afternoon', [id]))!.entry).toBeNull()
    await undoBatch(r.entry!.id)
    expect(await db.tasks.get(id)).toMatchObject({ evening: true })
    expect((await db.tasks.get(id))?.day_part ?? null).toBeNull()
    await dropUndoable('part:morning', [id])
    const none = (await dropUndoable('part:none', [id]))!
    expect(none.label).toBe('Moved to Any time')
    expect(await db.tasks.get(id)).toMatchObject({ day_part: null, evening: false })
    expect(await dropUndoable('part:night', [id])).toBeNull()
  })
})

// OpenSpec change archive-several-projects (GitHub issue 1661).
describe('archiveProjectsUndoable', () => {
  it('archives each project with its sub-projects in one batch, each once, and Undo brings them all back', async () => {
    const { createProject, updateProject } = await import('./ops')
    const { archiveProjectsUndoable } = await import('./undoActions')
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const work = await createProject({ name: 'Work' })
    const old = await createProject({ name: 'Old' })
    const keep = await createProject({ name: 'Keep' })
    await updateProject(old, { archived: true })
    await db.outbox.clear()
    // Garden is listed through its parent and on its own; Old is archived already.
    const r = await archiveProjectsUndoable([home, garden, work, old])
    expect(r.label).toBe('Archived 4 projects')
    for (const id of [home, garden, work, old]) expect((await db.projects.get(id))?.archived).toBe(true)
    expect((await db.projects.get(keep))?.archived).toBeFalsy()
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.entityId).sort()).toEqual([home, garden, work].sort())
    expect(new Set(ops.map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
    await undoBatch(r.entry!.id)
    for (const id of [home, garden, work]) expect((await db.projects.get(id))?.archived).toBeFalsy()
    expect((await db.projects.get(old))?.archived).toBe(true)
  })
})

// OpenSpec change undo-estimate: one task's estimate is one step of history.
describe('estimateUndoable', () => {
  it('records one step; undo restores the old estimate', async () => {
    const id = await createTask({ title: 'Write the report' })
    await updateTask(id, { estimate_minutes: 30 })
    const r = await estimateUndoable(id, 90)
    expect(r.label).toBe('Estimate 90 min')
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(90)
    await undoBatch(topUndo(await db.assistantUndo.toArray())!.id)
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(30)
  })

  it('removing it is a step too; the same value records nothing', async () => {
    const id = await createTask({ title: 'Write the report' })
    await updateTask(id, { estimate_minutes: 30 })
    expect((await estimateUndoable(id, 30)).entry).toBeNull()
    expect((await estimateUndoable(id, null)).label).toBe('Estimate removed')
    expect(await db.assistantUndo.count()).toBe(1)
  })

  it('a repeating task is written as before, without a step', async () => {
    const id = await createTask({ title: 'Review', due: { date: '2030-01-07' }, recurrence: 'every week' })
    expect((await estimateUndoable(id, 45)).entry).toBeNull()
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(45)
  })
})

// OpenSpec change undo-priority: one task's priority is one step of history.
describe('priorityUndoable', () => {
  it('records one step named like the bulk action; undo restores the old priority', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 3 })
    await priorityUndoable(id, 1)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    const step = topUndo(await db.assistantUndo.toArray())
    expect(step).toMatchObject({ label: 'Priority 1 set on 1 task', count: 1 })
    await undoBatch(step!.id)
    expect((await db.tasks.get(id))!.priority).toBe(3)
  })

  it('a repeating task is written as before (updateTask), without a step', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2030-01-07' }, recurrence: 'every week' })
    await priorityUndoable(id, 1)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('the same priority again records nothing', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 2 })
    await priorityUndoable(id, 2)
    expect(await db.assistantUndo.count()).toBe(0)
  })
})

// OpenSpec change undo-deadline: one task's deadline is one step of history.
describe('deadlineUndoable', () => {
  it('records one step; undo restores the old deadline, and removing it is a step too', async () => {
    const id = await createTask({ title: 'File taxes', deadline: '2030-04-15' })
    const r = await deadlineUndoable(id, '2030-04-30')
    expect(r.entry).not.toBeNull()
    expect((await db.tasks.get(id))!.deadline).toBe('2030-04-30')
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.deadline).toBe('2030-04-15')
    expect((await deadlineUndoable(id, null)).label).toBe('Deadline removed')
  })

  it('a deadline reminder follows the deadline, and the restored one after undo', async () => {
    const id = await createTask({ title: 'File taxes', deadline: '2030-04-15' })
    const rem = await addReminder(id, { kind: 'deadline', offset_minutes: 0 })
    const r = await deadlineUndoable(id, '2030-04-30')
    expect((await db.reminders.get(rem))!.fire_at).toBe(deadlineFireAt('2030-04-30', 0))
    await undoBatch(r.entry!.id)
    expect((await db.reminders.get(rem))!.fire_at).toBe(deadlineFireAt('2030-04-15', 0))
  })

  it('the same deadline records nothing; a repeating task is written as before', async () => {
    const id = await createTask({ title: 'File taxes', deadline: '2030-04-15' })
    expect((await deadlineUndoable(id, '2030-04-15')).entry).toBeNull()
    const rep = await createTask({ title: 'Pay', due: { date: '2030-01-07' }, recurrence: 'every month' })
    expect((await deadlineUndoable(rep, '2030-01-10')).entry).toBeNull()
    expect((await db.tasks.get(rep))!.deadline).toBe('2030-01-10')
    expect(await db.assistantUndo.count()).toBe(0)
  })
})

// OpenSpec change undo-assignee: one task's assignee is one step of history.
describe('assigneeUndoable', () => {
  it('records one step named for the member; undo and redo, in a shared project', async () => {
    await db.meta.put({ key: 'userId', value: 'u-me' })
    const p = await createProject({ name: 'Wedding' })
    await db.memberships.put({ projectId: p, role: 'owner', ownerId: 'u-me', members: [{ userId: 'u-ana', name: 'Ana', email: 'ana@example.com' }] } as never)
    const id = await createTask({ title: 'Book the venue', project_id: p })
    const a = await assigneeUndoable(id, 'u-ana')
    expect(a.label).toBe('Assigned to Ana')
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-ana')
    const b = await assigneeUndoable(id, 'u-me')
    expect(b.label).toBe('Assigned to you')
    const c = await assigneeUndoable(id, null)
    expect(c.label).toBe('Unassigned')
    await undoBatch(c.entry!.id)
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-me')
    await undoBatch(b.entry!.id)
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-ana')
    await redoBatch(b.entry!.id)
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-me')
    await undoBatch(b.entry!.id)
    await undoBatch(a.entry!.id)
    expect((await db.tasks.get(id))!.assignee_id ?? null).toBeNull()
  })

  it('the same assignee records nothing; a repeating task is written as before', async () => {
    const id = await createTask({ title: 'Book the venue' })
    expect((await assigneeUndoable(id, null)).entry).toBeNull()
    const rep = await createTask({ title: 'Take the bins out', due: { date: '2030-01-07' }, recurrence: 'every week' })
    expect((await assigneeUndoable(rep, 'u-ana')).entry).toBeNull()
    expect((await db.tasks.get(rep))!.assignee_id).toBe('u-ana')
    expect(await db.assistantUndo.count()).toBe(0)
  })
})

// OpenSpec change undo-evening: This Evening on one task is one step of history.
describe('eveningUndoable', () => {
  it('marks the task, records one step, and undo takes it out again', async () => {
    const id = await createTask({ title: 'Call mum' })
    await eveningUndoable(id, true)
    expect((await db.tasks.get(id))!.evening).toBe(true)
    const step = topUndo(await db.assistantUndo.toArray())
    expect(step?.count).toBe(1)
    await undoBatch(step!.id)
    expect((await db.tasks.get(id))!.evening).toBeFalsy()
  })

  it('a task already there records nothing', async () => {
    const id = await createTask({ title: 'Call mum' })
    await updateTask(id, { evening: true, day_part: null })
    await eveningUndoable(id, true)
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('a repeating task is written as before, without a step', async () => {
    const id = await createTask({ title: 'Read', due: { date: '2030-01-07' }, recurrence: 'every day' })
    await eveningUndoable(id, true)
    expect((await db.tasks.get(id))!.evening).toBe(true)
    expect(await db.assistantUndo.count()).toBe(0)
  })
})

// OpenSpec change undo-calendar-moves: a date move from the keyboard (Month, Plan, Day and Week)
// or in the timeline is one step of history.
describe('calendarEditUndoable', () => {
  it('records one step named Rescheduled; undo restores start and due, redo moves again', async () => {
    const id = await createTask({ title: 'Pack', start: '2030-01-03', due: { date: '2030-01-10', time: '09:00' } })
    const r = await calendarEditUndoable(id, { start: '2030-01-04', due: { date: '2030-01-11', time: '09:00' } })
    expect(r.label).toBe('Rescheduled')
    expect(r.entry).not.toBeNull()
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2030-01-11', time: '09:00' })
    await undoBatch(r.entry!.id)
    let t = (await db.tasks.get(id))!
    expect(t.start).toBe('2030-01-03')
    expect(t.due).toEqual({ date: '2030-01-10', time: '09:00' })
    await redoBatch(r.entry!.id)
    t = (await db.tasks.get(id))!
    expect(t.start).toBe('2030-01-04')
    expect(t.due).toEqual({ date: '2030-01-11', time: '09:00' })
  })

  it('a deadline and an estimate are steps too', async () => {
    const id = await createTask({ title: 'Pack', due: { date: '2030-01-10', time: '09:00' }, estimate_minutes: 30 })
    const a = await calendarEditUndoable(id, { deadline: '2030-01-12' })
    const b = await calendarEditUndoable(id, { estimate_minutes: 45 })
    expect(b.label).toBe('Estimate 45 min')
    await undoBatch(b.entry!.id)
    await undoBatch(a.entry!.id)
    const t = (await db.tasks.get(id))!
    expect(t.deadline ?? null).toBeNull()
    expect(t.estimate_minutes).toBe(30)
  })

  it('the same dates record nothing; a repeating task is written as before', async () => {
    const id = await createTask({ title: 'Pack', due: { date: '2030-01-10', time: '09:00' } })
    expect((await calendarEditUndoable(id, { due: { date: '2030-01-10', time: '09:00' } })).entry).toBeNull()
    expect((await calendarEditUndoable(id, { due: { time: '09:00', date: '2030-01-10' } })).entry).toBeNull()
    const rep = await createTask({ title: 'Bins', due: { date: '2030-01-07' }, recurrence: 'every week' })
    expect((await calendarEditUndoable(rep, { due: { date: '2030-01-08' } })).entry).toBeNull()
    expect((await db.tasks.get(rep))!.due).toEqual({ date: '2030-01-08' })
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('a date on a parked task takes it out of Someday in the same step', async () => {
    const id = await createTask({ title: 'Paint the shed', start: 'someday' })
    const r = await calendarEditUndoable(id, { due: { date: '2030-01-10' } })
    expect((await db.tasks.get(id))!.start ?? null).toBeNull()
    await undoBatch(r.entry!.id)
    const t = (await db.tasks.get(id))!
    expect(t.start).toBe('someday')
    expect(t.due ?? null).toBeNull()
  })
})

// OpenSpec change undo-row-schedule: a repeating task is parked as before, ending its repetition.
describe('parkUndoable', () => {
  it('parks a plain task as one step; a repeating task as before, without a step', async () => {
    const id = await createTask({ title: 'Paint the shed', due: { date: '2030-01-10' } })
    const r = await parkUndoable(id)
    expect(r.label).toBe('Moved to Someday')
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2030-01-10' })
    const rep = await createTask({ title: 'Bins', due: { date: '2030-01-07' }, recurrence: 'every week' })
    expect((await parkUndoable(rep)).entry).toBeNull()
    const t = (await db.tasks.get(rep))!
    expect(t.start).toBe('someday')
    expect(t.recurrence ?? null).toBeNull()
    expect(await db.assistantUndo.count()).toBe(1)
  })
})

// Undo skips steps for fields this device can't decrypt (OpenSpec e2ee): the change is written, no step is kept.
describe('a value this device cannot decrypt', () => {
  it('a rename, a location and a due are written as before, without a step', async () => {
    const { locationUndoable, titleUndoable } = await import('./undoActions')
    const id = await createTask({ title: 'Secret', due: { date: '2030-01-10' } })
    await db.tasks.update(id, { title: '[Cannot decrypt]', location: '[Cannot decrypt]', _e2ee: { wire: {}, raw: { title: 'v1.x', location: 'v1.y' } } } as never)
    expect((await titleUndoable(id, 'Plain')).entry).toBeNull()
    expect((await db.tasks.get(id))!.title).toBe('Plain')
    expect((await locationUndoable(id, null)).entry).toBeNull()
    expect((await db.tasks.get(id))!.location ?? null).toBeNull()
    await db.tasks.update(id, { _e2ee: { wire: {}, raw: { due: 'v1.z' } } } as never)
    expect((await calendarEditUndoable(id, { due: { date: '2030-01-11' } })).entry).toBeNull()
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('a title edit with attributes and a plain date change are written, without a step', async () => {
    const { dueUndoable, titleEditUndoable } = await import('./undoActions')
    const id = await createTask({ title: 'Secret' })
    await db.tasks.update(id, { title: '[Cannot decrypt]', _e2ee: { wire: {}, raw: { title: 'v1.x' } } } as never)
    expect((await titleEditUndoable(id, { title: 'Call Ana', priority: 1 })).entry).toBeNull()
    const t = (await db.tasks.get(id))!
    expect(t.title).toBe('Call Ana')
    expect(t.priority).toBe(1)
    await db.tasks.update(id, { _e2ee: { wire: {}, raw: { due: 'v1.z' } } } as never)
    expect((await dueUndoable(id, { date: '2030-02-01' })).entry).toBeNull()
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2030-02-01' })
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('a readable field of the same row still records its step', async () => {
    const { dueUndoable } = await import('./undoActions')
    const id = await createTask({ title: 'Secret' })
    await db.tasks.update(id, { _e2ee: { wire: {}, raw: { title: 'v1.x' } } } as never)
    expect((await dueUndoable(id, { date: '2030-02-01' })).entry).not.toBeNull()
  })
})

// OpenSpec change undo-indent (#1748): Tab and Shift-Tab in a list and the panel's Parent task.
describe('parentUndoable', () => {
  it('makes a task a subtask as one step named after the parent; undo and redo restore it', async () => {
    const { parentUndoable } = await import('./undoActions')
    const project = await createProject({ name: 'Trip' })
    const flights = await createTask({ title: 'Book flights', project_id: project })
    const hotel = await createTask({ title: 'Book the hotel', project_id: project })
    const before = (await db.tasks.get(hotel))!.position
    const r = await parentUndoable(hotel, flights)
    expect(r.label).toBe('Subtask of “Book flights”')
    expect((await db.tasks.get(hotel))!.parent_id).toBe(flights)
    await undoBatch(r.entry!.id)
    expect(await db.tasks.get(hotel)).toMatchObject({ parent_id: null, position: before })
    await redoBatch(r.entry!.id)
    expect((await db.tasks.get(hotel))!.parent_id).toBe(flights)
  })

  it('back to the top level is "Task updated"; the same parent records nothing; a bad parent throws and records nothing', async () => {
    const { parentUndoable } = await import('./undoActions')
    const project = await createProject({ name: 'Trip' })
    const other = await createProject({ name: 'Home' })
    const trip = await createTask({ title: 'Trip', project_id: project })
    const hotel = await createTask({ title: 'Hotel', project_id: project, parent_id: trip })
    const away = await createTask({ title: 'Away', project_id: other })
    expect((await parentUndoable(hotel, trip)).entry).toBeNull()
    await expect(parentUndoable(trip, hotel)).rejects.toThrow(/descendant/)
    await expect(parentUndoable(hotel, away)).rejects.toThrow(/same project/)
    expect(await db.assistantUndo.count()).toBe(0)
    const r = await parentUndoable(hotel, null)
    expect(r.label).toBe('Task updated')
    expect((await db.tasks.get(hotel))!.parent_id).toBeNull()
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(hotel))!.parent_id).toBe(trip)
  })

  it('a repeating task records its step too (a parent is not carried to the series)', async () => {
    const { parentUndoable } = await import('./undoActions')
    const parent = await createTask({ title: 'Chores' })
    const bins = await createTask({ title: 'Bins', due: { date: '2030-01-07' }, recurrence: 'every week' })
    const r = await parentUndoable(bins, parent)
    expect(r.entry).not.toBeNull()
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(bins))!.parent_id ?? null).toBeNull()
  })
})

// OpenSpec change undo-project-appearance (#1748): a project's name, colour and icon.
describe('project name, colour and icon', () => {
  it('a rename is one step named with both names; undo and redo restore it; the same name records nothing', async () => {
    const { projectRenameUndoable } = await import('./undoActions')
    const id = await createProject({ name: 'Work' })
    const r = await projectRenameUndoable(id, 'Office')
    expect(r.label).toBe('Renamed “Work” → “Office”')
    expect((await db.projects.get(id))!.name).toBe('Office')
    await undoBatch(r.entry!.id)
    expect((await db.projects.get(id))!.name).toBe('Work')
    await redoBatch(r.entry!.id)
    expect((await db.projects.get(id))!.name).toBe('Office')
    expect((await projectRenameUndoable(id, 'Office')).entry).toBeNull()
    expect(await db.assistantUndo.count()).toBe(1)
  })

  it('a colour and an icon are steps; undo puts the old ones back', async () => {
    const { projectEditUndoable } = await import('./undoActions')
    const id = await createProject({ name: 'Home', color: '#2563eb', icon: 'house' })
    const c = await projectEditUndoable(id, { color: '#dc2626' }, 'Colour Red')
    const i = await projectEditUndoable(id, { icon: null }, 'Project updated')
    expect(await db.projects.get(id)).toMatchObject({ color: '#dc2626', icon: null })
    await undoBatch(i.entry!.id)
    await undoBatch(c.entry!.id)
    expect(await db.projects.get(id)).toMatchObject({ color: '#2563eb', icon: 'house' })
  })
})
