// Note conversions (OpenSpec change notes-overview, design D6, task 4.4): one batch
// each with one Undo; moving a task's note out clears it inside the document, so a
// device holding an older copy cannot bring the text back by merging.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createProject, createTask, getDeviceId, mutate, resetDeviceId } from './ops'
import { activeBody, decodeDoc, encodeDoc, newDoc, toModel, updateBody, type RNode } from './richtext'
import { createNote, moveTaskNoteOut, noteToTask, setNoteProject, toggleNoteLabel, trashNote } from './noteOps'
import { undoBatch } from './undo'
import type { Op, Task } from './types'

class Server {
  log: (Op & { seq: number })[] = []
  sync(device: string, cursor: number, ops: Op[]) {
    for (const op of ops) if (!this.log.some((o) => o.id === op.id)) this.log.push({ ...op, seq: this.log.length + 1 })
    return { ops: this.log.filter((o) => o.seq > cursor && o.device !== device), cursor: this.log.length }
  }
}

interface Device { name: string; cursor: number }
let run = 0
let server: Server
const device = (name: string): Device => ({ name: `noteops-${name}-${run}`, cursor: 0 })

async function on<T>(dev: Device, fn: () => Promise<T>): Promise<T> {
  useDatabase(dev.name)
  resetDeviceId()
  await getDeviceId()
  return fn()
}

async function sync(dev: Device): Promise<number> {
  return on(dev, async () => {
    const id = await getDeviceId()
    let sent = 0
    for (let round = 0; round < 10; round++) {
      const out = await db.outbox.orderBy('local').toArray()
      const res = server.sync(id, dev.cursor, out.map(({ local: _l, ...op }) => op))
      sent += out.length
      await db.outbox.bulkDelete(out.map((o) => o.local as number))
      await applyOps(res.ops)
      dev.cursor = res.cursor
      if ((await db.outbox.count()) === 0) break
    }
    return sent
  })
}

async function settle(list: Device[]): Promise<void> {
  for (let round = 1; round <= 10; round++) {
    let sent = 0
    for (const d of list) sent += await sync(d)
    if (sent === 0) return
  }
  throw new Error('devices did not settle')
}

const para = (text: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] })

/** Writes a note through the document, as the editor does. */
async function writeNote(entity: 'task' | 'note', id: string, nodes: RNode[]): Promise<void> {
  const row = (await (entity === 'task' ? db.tasks.get(id) : db.notes.get(id))) as { notes_doc?: string }
  const doc = decodeDoc(row.notes_doc ?? '') ?? newDoc()
  doc.transact(() => updateBody(activeBody(doc), nodes))
  await mutate(entity, id, { notes_doc: encodeDoc(doc) })
}

beforeEach(async () => {
  run++
  server = new Server()
  useDatabase(`noteops-local-${run}`)
  resetDeviceId()
})

describe('noteToTask', () => {
  it('a note becomes a task with the same note in its project, and Undo brings the note back', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createNote({ title: 'Call the plumber', project_id: home, labels: ['l1'] })
    await writeNote('note', id, [para('Ask about the boiler.')])
    const r = await noteToTask(id)
    const task = (await db.tasks.get(r.id)) as Task
    expect(task.title).toBe('Call the plumber')
    expect(task.project_id).toBe(home)
    expect(task.labels).toEqual(['l1'])
    expect(task.description).toBe('Ask about the boiler.')
    expect(task.notes_doc).toBeTruthy()
    expect((await db.notes.get(id))!.deleted_at).not.toBeNull()

    await undoBatch(r.entry!.id)
    expect((await db.notes.get(id))!.deleted_at).toBeNull()
    expect((await db.tasks.get(r.id))!.deleted_at).not.toBeNull()
  })

  it('an untitled note becomes a task named "Untitled note"', async () => {
    const id = await createNote({})
    const r = await noteToTask(id)
    expect((await db.tasks.get(r.id))!.title).toBe('Untitled note')
  })
})

describe('moveTaskNoteOut', () => {
  it('the task note moves to a new note in the task\'s project; Undo puts the text back and removes the note', async () => {
    const home = await createProject({ name: 'Home' })
    const taskId = await createTask({ title: 'Kitchen', project_id: home, labels: ['l1'] })
    await writeNote('task', taskId, [para('- tiles'), para('- sink')])
    const before = (await db.tasks.get(taskId))!.description
    const r = (await moveTaskNoteOut(taskId))!
    const note = (await db.notes.get(r.id))!
    expect(note.title).toBe('Kitchen')
    expect(note.project_id).toBe(home)
    expect(note.labels).toEqual(['l1'])
    expect(note.description).toBe(before)
    const task = (await db.tasks.get(taskId))!
    expect(task.title).toBe('Kitchen')
    expect(task.description).toBe('')
    // Cleared inside the document: a document is still there, with an empty visible body.
    expect(task.notes_doc).toBeTruthy()
    expect(toModel(activeBody(decodeDoc(task.notes_doc)!))).toEqual([])

    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(taskId))!.description).toBe(before)
    expect((await db.notes.get(r.id))!.deleted_at).not.toBeNull()
  })

  it('a task without a note moves nothing', async () => {
    const taskId = await createTask({ title: 'Empty' })
    expect(await moveTaskNoteOut(taskId)).toBeNull()
    expect(await db.notes.count()).toBe(0)
  })

  it('an older copy does not bring the text back', async () => {
    const a = device('a')
    const b = device('b')
    const taskId = await on(a, () => createTask({ title: 'Kitchen' }))
    await on(a, () => writeNote('task', taskId, [para('A long checklist.')]))
    await settle([a, b])
    expect((await on(b, () => db.tasks.get(taskId)))!.description).toBe('A long checklist.')
    // B is offline and still holds the earlier note; it saves that document again
    // (the editor's save on leaving), without changing it.
    const old = (await on(b, () => db.tasks.get(taskId)))!.notes_doc!
    await on(b, () => mutate('task', taskId, { notes_doc: old }))
    // A moves the note out and syncs.
    await on(a, () => moveTaskNoteOut(taskId))
    await sync(a)
    // B syncs later.
    await settle([b, a])
    for (const d of [a, b]) {
      const task = (await on(d, () => db.tasks.get(taskId)))!
      expect(task.description, d.name).toBe('')
      expect(toModel(activeBody(decodeDoc(task.notes_doc)!)), d.name).toEqual([])
    }
    expect((await on(b, () => db.notes.toArray())).map((n) => n.description)).toEqual(['A long checklist.'])
  })
})

describe('notes in their project', () => {
  it('a project change within the scope is one op; Delete is undoable', async () => {
    const home = await createProject({ name: 'Home' })
    const id = await createNote({ title: 'Wi-Fi' })
    expect(await setNoteProject(id, home)).toBe(id)
    expect((await db.notes.get(id))!.project_id).toBe(home)
    await toggleNoteLabel(id, 'ref')
    expect((await db.notes.get(id))!.labels).toEqual(['ref'])
    const r = await trashNote(id)
    expect((await db.notes.get(id))!.deleted_at).not.toBeNull()
    await undoBatch(r.entry!.id)
    expect((await db.notes.get(id))!.deleted_at).toBeNull()
  })

  it('into a shared project the note is copied there and the original goes to the Trash', async () => {
    const shared = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: shared, role: 'editor', members: [] } as never)
    const id = await createNote({ title: 'Recipes' })
    const copy = await setNoteProject(id, shared)
    expect(copy).not.toBe(id)
    expect((await db.notes.get(copy))!.project_id).toBe(shared)
    expect((await db.notes.get(copy))!.title).toBe('Recipes')
    expect((await db.notes.get(id))!.deleted_at).not.toBeNull()
  })
})
