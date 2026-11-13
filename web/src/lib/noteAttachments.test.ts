// Note attachments (OpenSpec change note-attachments, tasks 2.1 and 2.3): a
// note's files, and files that move with the note in one batch, one Undo.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, setMeta, useDatabase } from './db'
import { noteParent, parentOf, queueLink } from './attachments'
import { applyOps, createProject, resetDeviceId } from './ops'
import { createNote, noteToTask, setNoteProject } from './noteOps'
import { renameEmbeds } from './noteAttachments'
import { undoBatch } from './undo'
import type { Op } from './types'

let run = 0
beforeEach(async () => {
  useDatabase(`note-attachments-${run++}`)
  resetDeviceId()
  await setMeta('userId', 'me')
})

/** A stored file on a note, as another device and the server wrote it. */
async function file(id: string, note: string, opts: { encrypted?: boolean } = {}) {
  let ts = 100
  const op = (field: string, value: unknown, device = 'other'): Op => ({ id: `${id}-${field}`, entity: 'attachment', entityId: id, field, value, ts: ts++, device })
  await applyOps([op('note_id', note), op('author_id', 'me'), op('name', 'boiler.pdf'), op('mime', 'application/pdf'), op('size', 2048), op('sha256', 'ab'),
    op('encrypted', !!opts.encrypted), op('created_at', 5), op('uploaded_at', 9, 'server')])
}

describe('note attachments', () => {
  it('"Attach to a note offline": the row names the note and no task', async () => {
    const note = await createNote({ title: 'Trip to Lisbon' })
    const id = await queueLink(noteParent(note), 'https://example.com/booking.pdf', 'Booking')
    const a = (await db.attachments.get(id))!
    expect(a.note_id).toBe(note)
    expect(a.task_id ?? '').toBe('')
    expect(parentOf(a)).toBe(noteParent(note))
    const out = await db.outbox.toArray()
    expect(out.some((o) => o.entityId === id && o.field === 'task_id')).toBe(false)
  })

  it('"Turn into task": the task takes the files as copies of the same stored file, and Undo brings them back', async () => {
    const note = await createNote({ title: 'Boiler manual', description: 'See ![plate](attachment:a1)' })
    await file('a1', note)
    const r = await noteToTask(note)
    const copies = (await db.attachments.toArray()).filter((a) => a.task_id === r.id && !a.deleted_at)
    expect(copies).toHaveLength(1)
    expect(copies[0].file_id).toBe('a1')
    expect(copies[0].uploaded_at).toBe(9)
    expect((await db.attachments.get('a1'))!.deleted_at).toBeTruthy()
    expect((await db.tasks.get(r.id))!.description).toBe(`See ![plate](attachment:${copies[0].id})`)
    await undoBatch(r.entry!.id)
    expect((await db.attachments.get('a1'))!.deleted_at).toBeNull()
    expect((await db.attachments.get(copies[0].id))!.deleted_at).toBeTruthy()
    expect((await db.notes.get(note))!.deleted_at).toBeNull()
  })

  it('"Move to a shared project": the copy shares the file; an encrypted file stays behind', async () => {
    const shared = await createProject({ name: 'Renovation' })
    await db.memberships.put({ projectId: shared, role: 'editor', members: [] } as never)
    const note = await createNote({ title: 'Kitchen' })
    await file('p1', note)
    await file('e1', note, { encrypted: true })
    const copy = await setNoteProject(note, shared)
    expect(copy).not.toBe(note)
    const moved = (await db.attachments.toArray()).filter((a) => a.note_id === copy && !a.deleted_at)
    expect(moved.map((a) => a.file_id)).toEqual(['p1'])
    expect((await db.attachments.get('e1'))!.deleted_at ?? null).toBeNull()
  })

  it('renames only the embeds it moved', () => {
    expect(renameEmbeds('![a](attachment:x) ![b](attachment:y) [x](attachment:x)', new Map([['x', 'z']]))).toBe('![a](attachment:z) ![b](attachment:y) [x](attachment:x)')
  })
})
