// OpenSpec change inbox-drop-unplaces (GitHub issue 2137): a move to the Inbox puts
// the task in the Inbox, clearing its project and its schedule; a repeating task keeps its date.
import { beforeEach, describe, expect, it } from 'vitest'
import { reviewMove } from './bulk'
import { db, useDatabase } from './db'
import { isInboxTask } from './inbox'
import { createProject, createTask, resetDeviceId } from './ops'
import { undoBatch } from './undo'
import { dropUndoable, moveUndoable } from './undoActions'

let n = 0
beforeEach(() => {
  useDatabase(`inbox-drop-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-11-26'

describe('a move to the Inbox (inbox-drop-unplaces)', () => {
  it('a task without a project, due today, dropped on the Inbox joins it; Undo puts the date back', async () => {
    const id = await createTask({ title: 'From the phone', due: { date: TODAY }, evening: true })
    expect(isInboxTask((await db.tasks.get(id))!)).toBe(false)
    await db.outbox.clear()
    const r = (await dropUndoable('inbox', [id]))!
    expect(r.label).toBe('Moved to Inbox')
    const task = (await db.tasks.get(id))!
    expect(task).toMatchObject({ due: null, evening: false })
    expect(isInboxTask(task)).toBe(true)
    expect(new Set((await db.outbox.toArray()).map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
    await undoBatch(r.entry!.id)
    expect(await db.tasks.get(id)).toMatchObject({ due: { date: TODAY }, evening: true })
  })

  it('a dated task of a project dropped on the Inbox lands in the Inbox, not in Today', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Dated', project_id: home, due: { date: TODAY }, start: '2026-11-20' })
    await dropUndoable('inbox', [id])
    const task = (await db.tasks.get(id))!
    expect(task).toMatchObject({ project_id: null, due: null, start: null })
    expect(isInboxTask(task)).toBe(true)
  })

  it('a dated task of a shared project leaves as an unscheduled copy in the Inbox, the original tombstoned', async () => {
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'owner', ownerId: 'me', members: [] } as never)
    const id = await createTask({ title: 'Shared, dated', project_id: shared, due: { date: TODAY } })
    await dropUndoable('inbox', [id])
    expect((await db.tasks.get(id))!.deleted_at).toBeTruthy()
    const copy = (await db.tasks.toArray()).find((task) => task.id !== id && task.title === 'Shared, dated')!
    expect(copy).toMatchObject({ project_id: null, due: null })
    expect(isInboxTask(copy)).toBe(true)
  })

  it('the project picker\'s Inbox choice (moveUndoable with no project) unschedules a task with or without a project', async () => {
    const home = await createProject({ name: 'Home' })
    const placed = await createTask({ title: 'In Home', project_id: home, due: { date: TODAY } })
    const loose = await createTask({ title: 'Loose', start: 'someday' })
    const a = await moveUndoable(placed, null, 'Inbox')
    const b = await moveUndoable(loose, null, 'Inbox')
    expect([a.label, b.label]).toEqual(['Moved to Inbox', 'Moved to Inbox'])
    for (const id of [placed, loose]) expect(isInboxTask((await db.tasks.get(id))!)).toBe(true)
    // An Inbox task already there writes nothing.
    expect((await moveUndoable(loose, null, 'Inbox')).entry).toBeNull()
  })

  it('a repeating task keeps its date, and the toast says why', async () => {
    const home = await createProject({ name: 'Home' })
    const loose = await createTask({ title: 'Water plants', due: { date: TODAY }, recurrence: 'every day' })
    await db.outbox.clear()
    const stay = (await dropUndoable('inbox', [loose]))!
    expect(stay).toMatchObject({ entry: null, label: 'It repeats, so it stays scheduled' })
    expect(await db.outbox.count()).toBe(0)
    const placed = await createTask({ title: 'Bins', project_id: home, due: { date: TODAY }, recurrence: 'every week' })
    const moved = await moveUndoable(placed, null, 'Inbox')
    expect(moved.label).toBe('Moved to Inbox; it repeats, so it stays scheduled')
    expect(await db.tasks.get(placed)).toMatchObject({ project_id: null, due: { date: TODAY } })
  })

  it('bulk Move to the Inbox reviews and writes the cleared schedule', async () => {
    const home = await createProject({ name: 'Home' })
    const a = await createTask({ title: 'A', project_id: home, due: { date: TODAY } })
    const b = await createTask({ title: 'B', due: { date: TODAY } })
    const plan = await reviewMove([a, b], { projectId: null, inbox: true })
    expect(plan.items.map((i) => i.patch)).toEqual([{ due: null, project_id: null }, { due: null }])
    const changes = await plan.resolve([a, b])
    expect(changes.find((c) => c.entityId === b)!.patch).toMatchObject({ due: null })
  })

  it('a drop on a project leaves the date as it is', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Dated', due: { date: TODAY } })
    await dropUndoable(`project:${home}`, [id])
    expect(await db.tasks.get(id)).toMatchObject({ project_id: home, due: { date: TODAY } })
  })
})
