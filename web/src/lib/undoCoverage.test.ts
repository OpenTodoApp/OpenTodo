// OpenSpec change undo-coverage: deleting a section, deleting or merging a label,
// deleting a custom field, a single row's drag, keyboard move and section move, and a
// completion that stops tracking are each one step of the undo history.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createProject, createTask, resetDeviceId } from './ops'
import { createSection } from './sections'
import { addLabel, createLabel } from './labels'
import { createField, liveFields, setFieldValue } from './fields'
import { startTracking } from './timeEntries'
import { setCurrentUserId } from './sharing'
import { redoBatch, undoBatch } from './undo'
import {
  completeUndoable, deleteFieldUndoable, deleteLabelUndoable, deleteSectionUndoable, mergeLabelsUndoable,
  moveTaskByUndoable, moveTaskUndoable, sectionMoveUndoable,
} from './undoActions'

let n = 0
beforeEach(async () => {
  useDatabase(`undo-coverage-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
})

/** The timestamps of the ops queued since the outbox was cleared: one batch has one. */
async function batches(): Promise<number> {
  return new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`)).size
}

describe('Deleting a section is a step', () => {
  it('takes the section and its open tasks back in one Undo, and Redo deletes it again', async () => {
    const pid = await createProject({ name: 'Home' })
    const sid = await createSection(pid, 'Kitchen')
    const a = await createTask({ title: 'Dishes', project_id: pid, section_id: sid })
    const b = await createTask({ title: 'Oven', project_id: pid, section_id: sid })
    await db.outbox.clear()
    const r = await deleteSectionUndoable(sid)
    expect(r.label).toBe('Section deleted')
    expect(await batches()).toBe(1)
    expect((await db.sections.get(sid))?.deleted_at).toBeTruthy()
    expect((await db.tasks.get(a))?.section_id).toBeNull()
    await undoBatch(r.entry!.id)
    expect((await db.sections.get(sid))?.deleted_at).toBeNull()
    expect((await db.tasks.bulkGet([a, b])).map((tk) => tk?.section_id)).toEqual([sid, sid])
    await redoBatch(r.entry!.id)
    expect((await db.sections.get(sid))?.deleted_at).toBeTruthy()
    expect((await db.tasks.get(b))?.section_id).toBeNull()
  })

  it('records nothing for a section already deleted', async () => {
    const pid = await createProject({ name: 'Home' })
    const sid = await createSection(pid, 'Kitchen')
    await deleteSectionUndoable(sid)
    expect((await deleteSectionUndoable(sid)).entry).toBeNull()
  })
})

describe('Deleting or merging a label is a step', () => {
  it('Undo of a delete brings the label back on every task that carried it', async () => {
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    const a = await createTask({ title: 'Post office' })
    const b = await createTask({ title: 'Bank' })
    for (const id of [a, b]) await addLabel(id, errand)
    await addLabel(b, call)
    await db.outbox.clear()
    const r = await deleteLabelUndoable(errand)
    expect(r.label).toBe('Label deleted')
    expect(await batches()).toBe(1)
    expect((await db.tasks.get(b))?.labels).toEqual([call])
    await undoBatch(r.entry!.id)
    expect((await db.labels.get(errand))?.deleted_at).toBeNull()
    expect((await db.tasks.bulkGet([a, b])).map((tk) => tk?.labels)).toEqual([[errand], [errand, call]])
  })

  it('Undo of a merge restores the source label and each task’s own labels', async () => {
    const source = await createLabel({ name: 'phone' })
    const target = await createLabel({ name: 'call' })
    const a = await createTask({ title: 'Ring mum' })
    const b = await createTask({ title: 'Ring the bank' })
    await addLabel(a, source)
    await addLabel(b, target)
    await addLabel(b, source)
    await db.outbox.clear()
    const r = await mergeLabelsUndoable(source, target, 'call')
    expect(r.label).toBe('Merged into call')
    expect(await batches()).toBe(1)
    expect((await db.tasks.bulkGet([a, b])).map((tk) => tk?.labels)).toEqual([[target], [target]])
    await undoBatch(r.entry!.id)
    expect((await db.labels.get(source))?.deleted_at).toBeNull()
    expect((await db.tasks.bulkGet([a, b])).map((tk) => tk?.labels)).toEqual([[source], [target, source]])
  })

  it('a label merged into itself records nothing', async () => {
    const l = await createLabel({ name: 'call' })
    expect((await mergeLabelsUndoable(l, l, 'call')).entry).toBeNull()
  })
})

describe('Deleting a custom field is a step', () => {
  it('Undo shows the field and its values again', async () => {
    const pid = await createProject({ name: 'Clients' })
    const fid = await createField(pid, { name: 'Cost', type: 'number' })
    const task = await createTask({ title: 'Invoice', project_id: pid })
    await setFieldValue(task, fid, 120)
    const r = await deleteFieldUndoable(fid)
    expect(r.label).toBe('Field deleted')
    expect(liveFields(pid, await db.fields.toArray())).toEqual([])
    await undoBatch(r.entry!.id)
    expect(liveFields(pid, await db.fields.toArray()).map((f) => f.id)).toEqual([fid])
    expect((await db.tasks.get(task))?.fields?.[fid]).toBe(120)
  })
})

describe('Moving one row is a step', () => {
  it('a drag among rows, and its Undo puts the row back', async () => {
    const pid = await createProject({ name: 'Trip' })
    const a = await createTask({ title: 'Flights', project_id: pid })
    const b = await createTask({ title: 'Hotel', project_id: pid })
    const order = async () => (await db.tasks.where('project_id').equals(pid).sortBy('position')).map((tk) => tk.id)
    expect(await order()).toEqual([a, b])
    const r = await moveTaskUndoable(b, { parent_id: null, at: { before: a } })
    expect(r?.label).toBe('1 task moved')
    expect(await order()).toEqual([b, a])
    await undoBatch(r!.entry!.id)
    expect(await order()).toEqual([a, b])
  })

  it('a drag onto another row makes a subtask, and Undo makes it top-level again', async () => {
    const pid = await createProject({ name: 'Trip' })
    const a = await createTask({ title: 'Flights', project_id: pid })
    const b = await createTask({ title: 'Seats', project_id: pid })
    const r = await moveTaskUndoable(b, { parent_id: a, at: 'bottom' })
    expect((await db.tasks.get(b))?.parent_id).toBe(a)
    await undoBatch(r!.entry!.id)
    expect((await db.tasks.get(b))?.parent_id).toBeNull()
  })

  it('a keyboard move is "Order changed", and the edge records nothing', async () => {
    const pid = await createProject({ name: 'Trip' })
    const a = await createTask({ title: 'Flights', project_id: pid })
    const b = await createTask({ title: 'Hotel', project_id: pid })
    expect(await moveTaskByUndoable(a, -1)).toBeNull()
    const r = await moveTaskByUndoable(a, 1)
    expect(r?.label).toBe('Order changed')
    const first = async () => (await db.tasks.where('project_id').equals(pid).sortBy('position'))[0].id
    expect(await first()).toBe(b)
    await undoBatch(r!.entry!.id)
    expect(await first()).toBe(a)
  })

  it('a move to another section names it, and Undo puts the task back in its section', async () => {
    const pid = await createProject({ name: 'Work' })
    const todo = await createSection(pid, 'To do')
    const doing = await createSection(pid, 'Doing')
    const task = await createTask({ title: 'Report', project_id: pid, section_id: todo })
    const r = await sectionMoveUndoable(task, doing, 'Doing')
    expect(r.label).toBe('Moved to Doing')
    expect((await db.tasks.get(task))?.section_id).toBe(doing)
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(task))?.section_id).toBe(todo)
  })
})

describe('Completing stops tracking in the same step', () => {
  it('closes the running entry with the completion, and Undo reopens both', async () => {
    const task = await createTask({ title: 'Write the report' })
    const entry = await startTracking(task, { now: 1_000 })
    await db.outbox.clear()
    const r = await completeUndoable(task, true, { now: 721_000, today: '2026-10-20' })
    expect((await db.timeEntries.get(entry))?.ended_at).toBe(721_000)
    expect(await batches()).toBe(1)
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(task))?.completed_at).toBeNull()
    expect((await db.timeEntries.get(entry))?.ended_at).toBeNull()
  })

  it('keeps the entry closed when another one runs by then: one running entry per person', async () => {
    const a = await createTask({ title: 'Write the report' })
    const b = await createTask({ title: 'Call the bank' })
    const first = await startTracking(a, { now: 1_000 })
    const r = await completeUndoable(a, true, { now: 60_000, today: '2026-10-20' })
    const second = await startTracking(b, { now: 600_000 })
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(a))?.completed_at).toBeNull()
    expect((await db.timeEntries.get(first))?.ended_at).toBe(60_000)
    expect((await db.timeEntries.get(second))?.ended_at).toBeNull()
  })
})
