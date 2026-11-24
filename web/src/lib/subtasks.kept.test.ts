// Kept subtasks (OpenSpec change keep-open-subtasks): the rule against the shared
// vectors (kept.vectors.json, also read by internal/kept), completion with and
// without the cascade and its undo, the shared snapshot, and reminders.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from './db'
import { createSubtask, createTask, mutate, planCompletePlain, resetDeviceId, setTaskCompleted } from './ops'
import { addReminder } from './reminders'
import { checkReminders } from './reminderWatcher'
import { keptIds, keepsOpenSubtasks, withoutKept } from './subtasks'
import { deriveSets } from './taskSnapshot'
import { visibleTaskSets } from './trash'
import { undoBatch } from './undo'
import { setKeepOpenSubtasks } from './userPrefs'
import { readWorkspaceState } from './workspaces'
import type { Task } from './types'
import vectors from './kept.vectors.json'

let n = 0
beforeEach(() => {
  useDatabase(`kept-${Date.now()}-${n++}`)
  resetDeviceId()
})

const row = (id: string, over: Partial<Task> = {}) => ({ id, title: id, project_id: null, parent_id: null, completed_at: null, deleted_at: null, ...over }) as Task

describe('the kept rule', () => {
  it.each(vectors.cases)('$name', (c) => {
    const tasks = (c.tasks as { id: string; parent?: string; done?: boolean; deleted?: boolean }[])
      .map((x) => row(x.id, { parent_id: x.parent ?? null, completed_at: x.done ? 1 : null, deleted_at: x.deleted ? 2 : null }))
    expect([...keptIds(tasks)].sort()).toEqual(c.kept)
    const kept = new Set(c.kept)
    expect(withoutKept(tasks).map((x) => x.id)).toEqual(tasks.filter((x) => !kept.has(x.id)).map((x) => x.id))
  })

  it('reads the preference: only "keep" keeps', () => {
    expect(keepsOpenSubtasks({ complete_subtasks: 'keep' })).toBe(true)
    for (const v of ['', 'complete', 'Keep', undefined]) expect(keepsOpenSubtasks({ complete_subtasks: v })).toBe(false)
    expect(keepsOpenSubtasks(null)).toBe(false)
  })

  it('plans the cascade by default and only the parent with keep', () => {
    const all = [row('p'), row('c', { parent_id: 'p' }), row('g', { parent_id: 'c' }), row('d', { parent_id: 'p', completed_at: 5 })]
    expect(planCompletePlain('p', all, 9).map((x) => x.entityId).sort()).toEqual(['c', 'g', 'p'])
    expect(planCompletePlain('p', all, 9, true)).toEqual([{ entity: 'task', entityId: 'p', patch: { completed_at: 9 } }])
  })
})

/** The visible task ids the lists read now. */
async function listed(): Promise<string[]> {
  return (await visibleTaskSets()).here.map((x) => x.id).sort()
}

describe('completing a parent', () => {
  it('completes open subtasks by default, and undo reopens them', async () => {
    const { completeUndoable } = await import('./undoActions')
    const trip = await createTask({ title: 'Plan trip' })
    const hotel = await createSubtask(trip, 'Book hotel')
    const r = await completeUndoable(trip, true)
    expect((await db.tasks.get(hotel))!.completed_at).toBeGreaterThan(0)
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(trip))!.completed_at).toBeNull()
    expect((await db.tasks.get(hotel))!.completed_at).toBeNull()
  })

  it('keeps open subtasks with the preference: out of lists, in the parent, back on reopen with no write', async () => {
    const { completeUndoable } = await import('./undoActions')
    await setKeepOpenSubtasks(true)
    expect((await db.userPrefs.get('me'))!.complete_subtasks).toBe('keep')
    const trip = await createTask({ title: 'Plan trip', due: { date: '2026-11-24' } })
    const hotel = await createSubtask(trip, 'Book hotel')
    const prices = await createSubtask(hotel, 'Compare prices')
    const bags = await createTask({ title: 'Pack bags' })
    const r = await completeUndoable(trip, true)
    expect((await db.tasks.get(hotel))!.completed_at).toBeNull()
    expect(await listed()).toEqual([bags, trip].sort())
    // The parent's Subtasks reads the database (useSubtasks), so it still lists the kept one.
    expect((await db.tasks.where('parent_id').equals(trip).toArray()).map((x) => x.id)).toEqual([hotel])

    // Undo reopens the parent alone, which ends the kept state.
    await undoBatch(r.entry!.id)
    expect(await listed()).toEqual([bags, hotel, prices, trip].sort())

    await setTaskCompleted(trip, true)
    expect((await db.tasks.get(hotel))!.completed_at).toBeNull()
    const before = await db.tasks.get(hotel)
    await setTaskCompleted(trip, false)
    expect(await db.tasks.get(hotel)).toEqual(before)
    expect(await listed()).toEqual([bags, hotel, prices, trip].sort())

    // Back to the default: the cascade again.
    await setKeepOpenSubtasks(false)
    expect((await db.userPrefs.get('me'))!.complete_subtasks).toBe('')
    await setTaskCompleted(trip, true)
    expect((await db.tasks.get(prices))!.completed_at).toBeGreaterThan(0)
  })

  it('bulk completion follows the preference', async () => {
    const { applyBulk } = await import('./bulk')
    await mutate('user_prefs', 'me', { complete_subtasks: 'keep' })
    const trip = await createTask({ title: 'Plan trip' })
    const hotel = await createSubtask(trip, 'Book hotel')
    const other = await createTask({ title: 'Other' })
    const r = await applyBulk([trip, other], { kind: 'complete' })
    expect((await db.tasks.get(hotel))!.completed_at).toBeNull()
    expect((await db.tasks.get(other))!.completed_at).toBeGreaterThan(0)
    expect(await listed()).toEqual([other, trip].sort())
    await undoBatch(r.undoId!)
    expect(await listed()).toEqual([hotel, other, trip].sort())
  })

  it('makes an earlier orphan (an open child of a completed parent) kept', async () => {
    const trip = await createTask({ title: 'Plan trip' })
    const hotel = await createSubtask(trip, 'Book hotel')
    // As an MCP or REST completion leaves it: only the parent written.
    await mutate('task', trip, { completed_at: 1 })
    expect(await listed()).toEqual([trip])
    const sets = deriveSets(await db.tasks.toArray(), await db.projects.toArray(), await readWorkspaceState())
    expect(sets.every.map((x) => x.id)).toEqual([trip])
    expect((await db.tasks.get(hotel))!.completed_at).toBeNull()
  })
})

describe('reminders of kept subtasks', () => {
  it('wait while the parent is completed and fire after it is reopened', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = new Date(2026, 9, 10, 9, 0).getTime()
      vi.setSystemTime(start)
      await mutate('user_prefs', 'me', { complete_subtasks: 'keep' })
      const trip = await createTask({ title: 'Plan trip' })
      const hotel = await createSubtask(trip, 'Book hotel')
      await addReminder(hotel, { kind: 'absolute', fire_at: start + 60_000 })
      await setTaskCompleted(trip, true)
      expect(await checkReminders(start + 120_000)).toEqual([])
      await setTaskCompleted(trip, false)
      expect((await checkReminders(start + 120_000)).map((d) => d.task.id)).toEqual([hotel])
    } finally {
      vi.useRealTimers()
    }
  })
})
