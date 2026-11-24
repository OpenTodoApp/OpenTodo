// OpenSpec change quick-add-files, task 1.1: files pasted into quick add are written
// with the new task in one batch, under its Undo, through the attachment limits.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({
  api: { uploadAttachment: vi.fn(async () => ({ status: 204 })), me: vi.fn(async () => ({})) },
  ApiError: class extends Error {},
  isNetworkError: () => true,
}))

import { AttachmentError, checkFiles } from './attachments'
import { db, setMeta, useDatabase } from './db'
import { createTask, resetDeviceId } from './ops'
import { addTasksUndoable, addTaskUndoable } from './pasteTasks'
import { reuseMatchFor } from './reuseAdd'
import { undoBatch } from './undo'

let n = 0
beforeEach(async () => {
  useDatabase(`quick-add-files-${Date.now()}-${n++}`)
  resetDeviceId()
  await setMeta('userId', 'u1')
  await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
})

const file = (name: string, body = 'png-bytes', type = 'image/png') => new File([body], name, { type })
const live = async () => (await db.attachments.toArray()).filter((a) => !a.deleted_at)

describe('files on a new task', () => {
  it('createTask writes the task and its file; the bytes wait on the device for the uploader', async () => {
    const id = await createTask({ title: 'Fix the header', files: [file('shot.png')] })
    const [row] = await live()
    expect(row).toMatchObject({ task_id: id, name: 'shot.png', mime: 'image/png', size: 9, author_id: 'u1', uploaded_at: null })
    expect(await db.attachmentBlobs.get(row.id)).toBeDefined()
    // One batch: the task's create and the attachment's rows wait in the outbox together.
    const outbox = await db.outbox.toArray()
    expect(outbox.some((o) => o.entity === 'task' && o.entityId === id)).toBe(true)
    expect(outbox.some((o) => o.entity === 'attachment' && o.entityId === row.id)).toBe(true)
  })

  it('one Undo of a quick-add task removes its file too', async () => {
    await addTaskUndoable({ title: 'Fix the header', files: [file('shot.png')] })
    expect(await live()).toHaveLength(1)
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    expect((await db.tasks.toArray()).filter((t) => !t.deleted_at)).toHaveLength(0)
    expect(await live()).toHaveLength(0)
  })

  it('a pasted list gives the files to its first task', async () => {
    const added = await addTasksUndoable([{ title: 'Milk', files: [file('list.png')] }, { title: 'Eggs' }])
    expect((await live()).map((a) => a.task_id)).toEqual([added.ids[0]])
  })

  it('over the limit: nothing is written and the attachment message is given', async () => {
    const big = file('big.png', 'x'.repeat(2000))
    await expect(checkFiles([big])).rejects.toThrow('files may be at most 1000 bytes on this server')
    await expect(createTask({ title: 'Fix the header', files: [big] })).rejects.toBeInstanceOf(AttachmentError)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.attachmentBlobs.count()).toBe(0)
  })

  it('refused while signed out or with attachments turned off', async () => {
    await setMeta('attachmentLimits', { enabled: false, max_file_bytes: 1000, quota_bytes: 0, used_bytes: 0 })
    await expect(checkFiles([file('a.png')])).rejects.toThrow('Attachments are turned off on this server.')
    await setMeta('userId', null)
    await expect(checkFiles([file('a.png')])).rejects.toThrow('Sign in to add files.')
  })

  it('a line with files never reuses an item of a reusable list', async () => {
    expect(await reuseMatchFor({ title: 'Milk', project_id: 'p-shop', files: [file('a.png')] })).toBeNull()
  })
})
