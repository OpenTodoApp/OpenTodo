// OpenSpec change rule-boards, task 2.3: a drop on a board column as one undoable batch.
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('a repeating task records its step too (undo-series-edits)', async () => {
    const id = await createTask({ title: 'Review', due: { date: '2030-01-07' }, recurrence: 'every week' })
    const r = await estimateUndoable(id, 45)
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(45)
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.estimate_minutes ?? null).toBeNull()
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

  it('a repeating task records its step too (undo-series-edits)', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2030-01-07' }, recurrence: 'every week' })
    await priorityUndoable(id, 1)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(topUndo(await db.assistantUndo.toArray())).toMatchObject({ label: 'Priority 1 set on 1 task' })
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

  it('the same deadline records nothing; a repeating task records its step', async () => {
    const id = await createTask({ title: 'File taxes', deadline: '2030-04-15' })
    expect((await deadlineUndoable(id, '2030-04-15')).entry).toBeNull()
    const rep = await createTask({ title: 'Pay', due: { date: '2030-01-07' }, recurrence: 'every month' })
    const r = await deadlineUndoable(rep, '2030-01-10')
    expect((await db.tasks.get(rep))!.deadline).toBe('2030-01-10')
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(rep))!.deadline ?? null).toBeNull()
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

  it('the same assignee records nothing; a repeating task records its step', async () => {
    const id = await createTask({ title: 'Book the venue' })
    expect((await assigneeUndoable(id, null)).entry).toBeNull()
    const rep = await createTask({ title: 'Take the bins out', due: { date: '2030-01-07' }, recurrence: 'every week' })
    const r = await assigneeUndoable(rep, 'u-ana')
    expect((await db.tasks.get(rep))!.assignee_id).toBe('u-ana')
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(rep))!.assignee_id ?? null).toBeNull()
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

  it('a repeating task records its step too (undo-series-edits)', async () => {
    const id = await createTask({ title: 'Read', due: { date: '2030-01-07' }, recurrence: 'every day' })
    await eveningUndoable(id, true)
    expect((await db.tasks.get(id))!.evening).toBe(true)
    await undoBatch(topUndo(await db.assistantUndo.toArray())!.id)
    expect(!!(await db.tasks.get(id))!.evening).toBe(false)
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

  it('the same dates record nothing; a repeating task records its step', async () => {
    const id = await createTask({ title: 'Pack', due: { date: '2030-01-10', time: '09:00' } })
    expect((await calendarEditUndoable(id, { due: { date: '2030-01-10', time: '09:00' } })).entry).toBeNull()
    expect((await calendarEditUndoable(id, { due: { time: '09:00', date: '2030-01-10' } })).entry).toBeNull()
    const rep = await createTask({ title: 'Bins', due: { date: '2030-01-07' }, recurrence: 'every week' })
    const r = await calendarEditUndoable(rep, { due: { date: '2030-01-08' } })
    expect((await db.tasks.get(rep))!.due).toEqual({ date: '2030-01-08' })
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(rep))!.due).toEqual({ date: '2030-01-07' })
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

// Undoing a series completion: the day's record goes back open and out of sight (no live record, so the
// date is the series' own again), never into the Trash list; ticking again completes that same day.
describe('undoing a series completion', () => {
  it('leaves no live record and nothing in the Trash, and a tick after it completes the same day', async () => {
    const { completeUndoable } = await import('./undoActions')
    const { trashItems } = await import('./trash')
    const id = await createTask({ title: 'Bins', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const records = () => db.tasks.filter((x) => x.series_id === id).toArray()
    const r = await completeUndoable(id, true, { today: '2026-10-12' })
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-19' })
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-12' })
    const [rec] = await records()
    expect(rec.deleted_at).toBeGreaterThan(0)
    expect(rec).toMatchObject({ completed_at: null, skipped: true })
    const all = await db.tasks.toArray()
    expect(trashItems(all, [])).toEqual([])
    await redoBatch(r.entry!.id)
    expect((await records())[0]).toMatchObject({ deleted_at: null, skipped: false })
    expect((await records())[0].completed_at).toBeGreaterThan(0)
    await undoBatch(r.entry!.id)

    await completeUndoable(id, true, { today: '2026-10-12' })
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-19' })
    expect((await records()).map((x) => [x.occurrence_date, !!x.completed_at, !!x.deleted_at, x.skipped])).toEqual([['2026-10-12', true, false, false]])
  })

  it('keeps a trashed completed occurrence in the Trash', async () => {
    const { completeUndoable } = await import('./undoActions')
    const { trashItems } = await import('./trash')
    const { deleteTask } = await import('./ops')
    const id = await createTask({ title: 'Bins', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await completeUndoable(id, true, { today: '2026-10-12' })
    const [rec] = await db.tasks.filter((x) => x.series_id === id).toArray()
    await deleteTask(rec.id)
    const all = await db.tasks.toArray()
    expect(trashItems(all, []).map((x) => x.id)).toEqual([rec.id])
  })

  it('keeps an open occurrence the user trashed in the Trash, even once its series repeats again', async () => {
    const { actOnOccurrence } = await import('./occurrenceActions')
    const { trashItems } = await import('./trash')
    const { deleteTask } = await import('./ops')
    const id = await createTask({ title: 'Bins', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const rec = (await actOnOccurrence(id, '2026-10-19', { kind: 'edit', patch: { title: 'Bins (late)' } }, { today: '2026-10-12' }))!
    await updateTask(id, { recurrence: null })
    await deleteTask(rec)
    await updateTask(id, { recurrence: 'every monday' })
    expect(trashItems(await db.tasks.toArray(), []).map((x) => x.id)).toEqual([rec])
  })
})

// OpenSpec change undo-skip (#1748): skipping a repeating task's occurrence is a step.
describe('skipOccurrence', () => {
  it('moves a series on as one step named "Occurrence skipped"; undo brings the date back', async () => {
    const { skipOccurrence } = await import('./undoActions')
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    expect(await skipOccurrence(id, { today: '2026-10-12' })).toBe(true)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-19' })
    const entry = (await db.assistantUndo.toArray())[0]
    expect(entry.label).toBe('Occurrence skipped')
    await undoBatch(entry.id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-12' })
    await redoBatch(entry.id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-19' })
  })

  it('a habit skip is "Day skipped"; undo writes back the open occurrence, never a record in the Trash', async () => {
    const { skipOccurrence } = await import('./undoActions')
    const id = await createTask({ title: 'Walk', due: { date: '2026-10-14' }, recurrence: 'every day' })
    await updateTask(id, { habit: true })
    const records = () => db.tasks.filter((x) => x.series_id === id).toArray()
    expect(await skipOccurrence(id, { today: '2026-10-14' })).toBe(true)
    expect((await records()).map((r) => r.skipped)).toEqual([true])
    const entry = (await db.assistantUndo.toArray())[0]
    expect(entry.label).toBe('Day skipped')
    await undoBatch(entry.id)
    // series-exceptions D3: the record stays, as an untouched open occurrence (nothing goes to the Trash).
    expect(await records()).toMatchObject([{ skipped: false, completed_at: null, deleted_at: null }])
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-14' })
    await redoBatch(entry.id)
    expect((await records()).map((r) => r.skipped)).toEqual([true])
    expect(await skipOccurrence(await createTask({ title: 'Plain' }))).toBe(false)
    expect(await db.assistantUndo.count()).toBe(1)
  })

  it('two skips at once run one after the other', async () => {
    const { skipOccurrence } = await import('./undoActions')
    const id = await createTask({ title: 'Gym', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    await Promise.all([skipOccurrence(id, { today: '2026-10-12' }), skipOccurrence(id, { today: '2026-10-12' })])
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-26' })
    expect(await db.assistantUndo.count()).toBe(2)
  })
})

// custom-fields: an undo's base is unfolded like the patch, one fields.<id> per value.
describe('undoing an action on one occurrence', () => {
  it('a habit day skipped from the calendar comes back with the series\' custom field values', async () => {
    const { actOnOccurrenceUndoable } = await import('./occurrenceActions')
    const { createField, setFieldValue } = await import('./fields')
    const project = await createProject({ name: 'Health' })
    const id = await createTask({ title: 'Walk', due: { date: '2026-10-14' }, recurrence: 'every day', project_id: project })
    await updateTask(id, { habit: true })
    const field = await createField(project, { name: 'Route', type: 'text' })
    await setFieldValue(id, field, 'Park')
    const r = await actOnOccurrenceUndoable(id, '2026-10-14', { kind: 'skip' }, { today: '2026-10-14' })
    const [rec] = await db.tasks.filter((x) => x.series_id === id).toArray()
    expect(rec).toMatchObject({ skipped: true })
    expect(rec.fields?.[field]).toBe('Park')
    await undoBatch(r!.entry!.id)
    const back = (await db.tasks.get(rec.id))!
    expect(back).toMatchObject({ skipped: false, deleted_at: null })
    expect(back.fields?.[field]).toBe('Park')
  })
})

// OpenSpec change undo-series-edits (#1748): a repeating task's all-occurrences edits and rule
// changes are steps; the open records an edit carries to come back too; past records are left alone.
describe('repeating tasks', () => {
  async function series() {
    const { actOnOccurrence } = await import('./occurrenceActions')
    const { completeTask } = await import('./ops')
    const id = await createTask({ title: 'Water', due: { date: '2026-10-12' }, recurrence: 'every day', priority: 4 })
    // A past occurrence done, and an open one moved to a later time of its day (an exception record).
    await completeTask(id, { today: '2026-10-12' })
    const moved = await actOnOccurrence(id, '2026-10-14', { kind: 'move', due: { date: '2026-10-14', time: '18:00' } }, { today: '2026-10-13' })
    return { id, moved: moved! }
  }

  it('a rename is one step that also takes back the open record it carried to', async () => {
    const { titleUndoable } = await import('./undoActions')
    const { id, moved } = await series()
    const r = await titleUndoable(id, 'Water the plants')
    expect(r.entry).not.toBeNull()
    expect((await db.tasks.get(moved))!.title).toBe('Water the plants')
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.title).toBe('Water')
    expect((await db.tasks.get(moved))!.title).toBe('Water')
  })

  it('a priority change is a step', async () => {
    const { id } = await series()
    await priorityUndoable(id, 1)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    expect((await db.tasks.get(id))!.priority).toBe(4)
  })

  it('a rule change is a step, and its undo leaves the past records as they were', async () => {
    const { recurrenceUndoable } = await import('./undoActions')
    const { id } = await series()
    const records = async () => (await db.tasks.filter((x) => x.series_id === id).toArray()).map((x) => ({ id: x.id, completed_at: x.completed_at, due: x.due, deleted_at: x.deleted_at, title: x.title })).sort((a, b) => a.id.localeCompare(b.id))
    const before = await records()
    const r = await recurrenceUndoable(id, 'every week')
    expect(r.ok).toBe(true)
    expect((await db.tasks.get(id))!.recurrence).toBe('every week')
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    expect(entry.label).toBe('Task updated')
    await undoBatch(entry.id)
    expect((await db.tasks.get(id))!.recurrence).toBe('every day')
    expect(await records()).toEqual(before)
  })

  it('stopping a repetition is a step', async () => {
    const { recurrenceUndoable } = await import('./undoActions')
    const { id } = await series()
    await recurrenceUndoable(id, null)
    expect((await db.tasks.get(id))!.recurrence ?? null).toBeNull()
    await undoBatch((await db.assistantUndo.toArray()).at(-1)!.id)
    expect((await db.tasks.get(id))!.recurrence).toBe('every day')
  })

  it('an edit under This and following keeps its own path, without a step', async () => {
    const { titleUndoable } = await import('./undoActions')
    const { redirectNextEdit } = await import('./ops')
    const { id } = await series()
    const count = await db.assistantUndo.count()
    let redirected = false
    redirectNextEdit(id, async () => { redirected = true; return null })
    expect((await titleUndoable(id, 'From now on')).entry).toBeNull()
    expect(redirected).toBe(true)
    expect(await db.assistantUndo.count()).toBe(count)
  })

  it('under Also past ones, an edit that reaches no past record is still a step', async () => {
    const { estimateUndoable } = await import('./undoActions')
    const { setPastScope } = await import('./ops')
    const { id } = await series()
    const committed = vi.fn()
    setPastScope({ id, committed })
    try {
      const r = await estimateUndoable(id, 30)
      expect(r.entry).not.toBeNull()
      expect(committed).not.toHaveBeenCalled()
      await undoBatch(r.entry!.id)
      expect((await db.tasks.get(id))!.estimate_minutes ?? null).toBeNull()
    } finally { setPastScope(null) }
  })

  it('under Also past ones, a rename that reaches the past records its own step', async () => {
    const { titleUndoable } = await import('./undoActions')
    const { setPastScope } = await import('./ops')
    const { id } = await series()
    const committed = vi.fn()
    setPastScope({ id, committed })
    try {
      expect((await titleUndoable(id, 'Water the plants')).entry).toBeNull()
      expect(committed).toHaveBeenCalledOnce()
      const done = await db.tasks.filter((x) => x.series_id === id && !!x.completed_at).toArray()
      expect(done.map((x) => x.title)).toEqual(['Water the plants'])
    } finally { setPastScope(null) }
  })

  it('undo leaves a record done since the edit as it is', async () => {
    const { titleUndoable } = await import('./undoActions')
    const { actOnOccurrence } = await import('./occurrenceActions')
    const { id, moved } = await series()
    const r = await titleUndoable(id, 'Water the plants')
    await actOnOccurrence(id, '2026-10-14', { kind: 'complete' }, { today: '2026-10-14' })
    expect((await db.tasks.get(moved))!.completed_at).toBeTruthy()
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.title).toBe('Water')
    expect((await db.tasks.get(moved))!.title).toBe('Water the plants')
  })

  it('redo leaves a record done since the undo as it is', async () => {
    const { titleUndoable } = await import('./undoActions')
    const { actOnOccurrence } = await import('./occurrenceActions')
    const { id, moved } = await series()
    const r = await titleUndoable(id, 'Water the plants')
    await undoBatch(r.entry!.id)
    await actOnOccurrence(id, '2026-10-14', { kind: 'complete' }, { today: '2026-10-14' })
    await redoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.title).toBe('Water the plants')
    expect((await db.tasks.get(moved))!.title).toBe('Water')
  })

  it('a length key on a series is named as the estimate step', async () => {
    const { id } = await series()
    expect((await calendarEditUndoable(id, { estimate_minutes: 45 })).label).toBe('Estimate 45 min')
  })

  it('a calendar move to where the series already is records nothing', async () => {
    const { id } = await series()
    const count = await db.assistantUndo.count()
    expect((await calendarEditUndoable(id, { due: (await db.tasks.get(id))!.due })).entry).toBeNull()
    expect(await db.assistantUndo.count()).toBe(count)
  })
})
