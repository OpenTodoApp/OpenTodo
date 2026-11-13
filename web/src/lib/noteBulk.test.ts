// Actions on several notes (OpenSpec change notes-bulk-actions, tasks 2.1 and 2.3): one
// batch per action, the scope-changing move copied and reviewed, labels with the
// all-or-add rule, pins after the earlier pins, turn into tasks, trash, and Undo with
// a field changed since kept and named.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { parseFavourites, pin } from './favourites'
import { allPinned, labelNotes, moveNotes, notesChangingScope, notesToTasks, pinNotes, trashNotes } from './noteBulk'
import { createNote } from './noteOps'
import { createProject, mutate, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import { undoBatch } from './undo'
import { USER_PREFS_ID } from './userPrefs'

let run = 0
beforeEach(() => {
  useDatabase(`note-bulk-${run++}`)
  resetDeviceId()
  setCurrentUserId('u-me')
})

const notes = async (n: number, fields: { project_id?: string; labels?: string[] } = {}) => {
  const ids: string[] = []
  for (let i = 0; i < n; i++) ids.push(await createNote({ title: `Note ${i + 1}`, description: `text ${i + 1}`, ...fields }))
  return ids
}
const opCount = async () => db.outbox.count()

describe('note bulk actions', () => {
  it('Move to an archive project: twelve notes in one batch, the toast names it, Undo puts them back', async () => {
    const home = await createProject({ name: 'Home' })
    const archive = await createProject({ name: 'Archive' })
    const ids = await notes(12, { project_id: home })
    expect(await notesChangingScope(ids, archive)).toHaveLength(0)
    const before = await opCount()
    const r = await moveNotes(ids, archive, 'Archive')
    expect(r.label).toBe('12 notes moved to Archive')
    expect((await db.notes.bulkGet(ids)).every((n) => n!.project_id === archive)).toBe(true)
    expect(await opCount() - before).toBe(12)
    const undone = await undoBatch(r.undoId!)
    expect(undone.restored).toBe(12)
    expect((await db.notes.bulkGet(ids)).every((n) => n!.project_id === home)).toBe(true)
  })

  it('Move into a shared project: listed for review, copied there and the originals trashed in one batch', async () => {
    const reno = await createProject({ name: 'Renovation' })
    await db.memberships.put({ projectId: reno, role: 'owner', ownerId: 'u-me', members: [] })
    const ids = await notes(2)
    expect((await notesChangingScope(ids, reno)).map((n) => n.id)).toEqual(ids)
    const r = await moveNotes(ids, reno, 'Renovation')
    expect((await db.notes.bulkGet(ids)).every((n) => !!n!.deleted_at)).toBe(true)
    const copies = (await db.notes.toArray()).filter((n) => n.project_id === reno && !n.deleted_at)
    expect(copies.map((n) => n.title).sort()).toEqual(['Note 1', 'Note 2'])
    await undoBatch(r.undoId!)
    expect((await db.notes.bulkGet(ids)).every((n) => !n!.deleted_at)).toBe(true)
    expect((await db.notes.toArray()).filter((n) => n.project_id === reno && !n.deleted_at)).toHaveLength(0)
  })

  it('Label several: added to the notes lacking it; removed from all when all carry it', async () => {
    const [a, b, c] = await notes(3)
    await mutate('note', a, { labels: ['l-ref', 'l-x'] })
    const r = await labelNotes([a, b, c], 'l-ref', 'reference')
    expect(r.label).toBe('reference added to 2 notes')
    expect((await db.notes.get(a))!.labels).toEqual(['l-ref', 'l-x'])
    expect((await db.notes.get(b))!.labels).toEqual(['l-ref'])
    const off = await labelNotes([a, b, c], 'l-ref', 'reference')
    expect(off.label).toBe('reference removed from 3 notes')
    expect((await db.notes.get(a))!.labels).toEqual(['l-x'])
  })

  it('Pin several: after the notes pinned before; Unpin when all are pinned', async () => {
    const [first, x, y, z] = await notes(4)
    await pin('note', first)
    await pinNotes([x, y, z], true)
    const favs = (await db.userPrefs.get(USER_PREFS_ID))!.favourites
    expect(parseFavourites(favs)).toEqual([`note:${first}`, `note:${x}`, `note:${y}`, `note:${z}`])
    expect(allPinned([x, y, z], favs)).toBe(true)
    await pinNotes([x, y, z], false)
    expect(parseFavourites((await db.userPrefs.get(USER_PREFS_ID))!.favourites)).toEqual([`note:${first}`])
  })

  it('Turn into tasks: two tasks in Work with the notes\' titles, text and labels, the notes in the Trash; Undo reverses both', async () => {
    const work = await createProject({ name: 'Work' })
    const ids = await notes(2, { project_id: work, labels: ['l-a'] })
    const r = await notesToTasks(ids)
    expect(r.label).toBe('2 notes turned into tasks')
    const tasks = (await db.tasks.toArray()).filter((t) => t.project_id === work && !t.deleted_at)
    expect(tasks.map((t) => [t.title, t.description, t.labels]).sort()).toEqual([['Note 1', 'text 1', ['l-a']], ['Note 2', 'text 2', ['l-a']]])
    expect((await db.notes.bulkGet(ids)).every((n) => !!n!.deleted_at)).toBe(true)
    await undoBatch(r.undoId!)
    expect((await db.tasks.toArray()).filter((t) => t.project_id === work && !t.deleted_at)).toHaveLength(0)
    expect((await db.notes.bulkGet(ids)).every((n) => !n!.deleted_at)).toBe(true)
  })

  it('Trash several, and Undo keeps a note changed again since', async () => {
    const ids = await notes(3)
    const r = await trashNotes(ids)
    expect(r.label).toBe('3 notes moved to the Trash')
    expect((await db.notes.bulkGet(ids)).every((n) => !!n!.deleted_at)).toBe(true)
    const labelled = await labelNotes(ids.slice(0, 0).concat(await notes(5)), 'l-2025', '2025')
    const five = (await db.notes.toArray()).filter((n) => (n.labels ?? []).includes('l-2025'))
    // Another change to one of them after the batch: Undo keeps it and names it.
    await mutate('note', five[0].id, { labels: [] })
    const undone = await undoBatch(labelled.undoId!)
    expect(undone.skipped).toHaveLength(1)
    expect((await db.notes.toArray()).filter((n) => (n.labels ?? []).includes('l-2025'))).toHaveLength(0)
    await undoBatch(r.undoId!)
    expect((await db.notes.bulkGet(ids)).every((n) => !n!.deleted_at)).toBe(true)
  })
})
