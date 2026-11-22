// OpenSpec change rule-boards, task 2.3: a drop on a board column as one undoable batch.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, resetDeviceId, updateTask } from './ops'
import type { OnDropRule } from './types'
import { topUndo, undoBatch } from './undo'
import { dropOnPanel, dropUndoable, estimateUndoable, eveningUndoable, priorityUndoable } from './undoActions'

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
