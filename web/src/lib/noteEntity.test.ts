import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, copyNoteChange, NOTE_DEFAULTS, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import { reseedAfterRestore } from './sync'
import { isContentField } from './e2ee'
import type { Note } from './types'

// The client side of the standalone `note` entity (OpenSpec notes-overview, task 1.7).

let n = 0
beforeEach(async () => {
  useDatabase(`note-entity-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
})

describe('the note entity', () => {
  it('applies remote ops into a row with the defaults, appends in their own map', async () => {
    await applyOps([
      { id: 'o1', entity: 'note', entityId: 'n1', field: 'title', value: 'Trip', ts: 5, device: 'other' },
      { id: 'o2', entity: 'note', entityId: 'n1', field: 'project_id', value: 'p1', ts: 5, device: 'other' },
    ])
    const row = await db.notes.get('n1')
    expect(row).toMatchObject({ ...NOTE_DEFAULTS, id: 'n1', title: 'Trip', project_id: 'p1' })
    expect(await db.notes.where('project_id').equals('p1').count()).toBe(1)
  })

  it('re-seeds every note field and pending append after a restore', async () => {
    await applyOps([
      { id: 'a', entity: 'note', entityId: 'n1', field: 'title', value: 'Trip', ts: 5, device: 'd' },
      { id: 'b', entity: 'note', entityId: 'n1', field: 'description', value: 'ferry', ts: 5, device: 'd' },
      { id: 'c', entity: 'note', entityId: 'n1', field: 'appends.x', value: 'more', ts: 6, device: 'server' },
    ])
    await db.outbox.clear()
    await reseedAfterRestore('gen-2')
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'note')
    // The device folded the append on receipt (rule 5); the re-seed carries the folded state.
    expect([...new Set(ops.map((o) => o.field))].sort()).toEqual(['appends.x', 'description', 'notes_doc', 'title'])
    expect(ops.find((o) => o.field === 'description' && o.value === 'ferry\n\nmore')).toBeTruthy()
  })

  it('encrypts title, text and appends as content, the project and labels not', () => {
    for (const f of ['title', 'description', 'notes_doc', 'appends.a1']) expect(isContentField('note', f), f).toBe(true)
    for (const f of ['project_id', 'labels', 'deleted_at']) expect(isContentField('note', f), f).toBe(false)
    expect(isContentField('task', 'appends.a1')).toBe(true)
  })

  it('copies a note into another place with a new id and the same text', () => {
    const note = { ...NOTE_DEFAULTS, id: 'n1', title: 'Plan', description: '- a', notes_doc: 'ydoc:v1:AAAA', labels: ['l'], project_id: 'p', _clock: {} } as Note
    const c = copyNoteChange(note, null, 'w1')
    expect(c.entityId).not.toBe('n1')
    expect(c.patch).toMatchObject({ title: 'Plan', description: '- a', notes_doc: 'ydoc:v1:AAAA', labels: ['l'], project_id: null, workspace_id: 'w1', deleted_at: null })
    expect(copyNoteChange(note, 'p2', 'w1').patch.workspace_id).toBeNull()
  })
})
