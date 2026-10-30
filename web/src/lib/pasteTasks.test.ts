// OpenSpec change paste-to-tasks, task 2.2: one Undo for a pasted batch.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, resetDeviceId } from './ops'
import { addTasksUndoable, subtaskInputs } from './pasteTasks'
import { undoBatch } from './undo'

let n = 0
beforeEach(() => {
  useDatabase(`paste-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('addTasksUndoable', () => {
  it('one Undo leaves no live task of the batch, nor its reminders', async () => {
    await createTask({ title: 'kept' })
    const added = await addTasksUndoable([
      { title: 'Milk', due: { date: '2030-01-02', time: '10:00' }, reminders: [{ kind: 'offset', minutes: 30 }] },
      { title: 'Eggs' },
      { title: 'Bread' },
    ])
    expect(added.label).toBe('3 tasks added')
    expect(added.ids).toHaveLength(3)
    expect(added.undoId).not.toBeNull()
    expect((await db.reminders.toArray()).filter((r) => !r.deleted_at)).toHaveLength(1)

    const result = await undoBatch(added.undoId!)
    expect(result.skipped).toEqual([])
    const live = (await db.tasks.toArray()).filter((t) => !t.deleted_at).map((t) => t.title)
    expect(live).toEqual(['kept'])
    expect((await db.reminders.toArray()).filter((r) => !r.deleted_at)).toHaveLength(0)
  })

  it('subtasks: under the parent, its project, priority 4, no date; the label says subtasks', async () => {
    const parent = await createTask({ title: 'Plan trip', project_id: null })
    const row = (await db.tasks.get(parent))!
    const added = await addTasksUndoable(subtaskInputs(row, ['Pack tomorrow', 'Book taxi p1']), { subtasks: true })
    expect(added.label).toBe('2 subtasks added')
    const subs = await Promise.all(added.ids.map((id) => db.tasks.get(id)))
    expect(subs.map((s) => [s!.title, s!.parent_id, s!.priority, s!.due])).toEqual([
      ['Pack tomorrow', parent, 4, null],
      ['Book taxi p1', parent, 4, null],
    ])
    await undoBatch(added.undoId!)
    expect((await db.tasks.toArray()).filter((t) => !t.deleted_at).map((t) => t.title)).toEqual(['Plan trip'])
  })

  it('nothing to add writes nothing', async () => {
    expect(await addTasksUndoable([])).toMatchObject({ ids: [], undoId: null })
    expect(await db.outbox.count()).toBe(0)
  })
})
