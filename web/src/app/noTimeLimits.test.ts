// @vitest-environment happy-dom
// OpenSpec accessibility "No time limits" (accessibility-aaa 7.2): what a disappearing
// undo toast offers stays reachable after it has gone.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { completeUndoable } from '../lib/undoActions'
import { ACTION_TOAST_MS, bulkToast, hideBulkToast, showUndoToast } from './bulk/toastStore'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  hideBulkToast()
})

describe('no time limits', () => {
  it('after the undo toast has left on its own, the task can still be reopened and its history still holds the change', async () => {
    const id = await createTask({ title: 'Renew passport' })
    const done = await completeUndoable(id, true)
    showUndoToast(done.label, done.entry?.id ?? null)
    expect(bulkToast()?.label).toBe(done.label)
    // The toast leaves on its own after ACTION_TOAST_MS (the UndoToast component's timer calls hideBulkToast).
    expect(ACTION_TOAST_MS).toBeGreaterThan(0)
    hideBulkToast()
    expect(bulkToast()).toBeNull()
    // Completed still lists the task, and it can be reopened from there.
    expect((await db.tasks.get(id))?.completed_at).not.toBeNull()
    await completeUndoable(id, false)
    expect((await db.tasks.get(id))?.completed_at).toBeNull()
    // The history (the op log) keeps both changes, so the undo is never lost with the toast.
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id && o.field === 'completed_at')
    expect(ops.length).toBeGreaterThanOrEqual(2)
  })
})
