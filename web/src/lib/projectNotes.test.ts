// A project's note (OpenSpec change project-notes) follows the same rules as a
// task's: a mergeable document with its Markdown projection, folded and merged
// by the same data-layer code. Simulated devices exchange ops through an
// in-memory server, as notes.test.ts does for tasks.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { DocTooLargeError, MAX_DOC_CHARS } from './docfields'
import { applyOps, createProject, foldNote, getDeviceId, mutate, resetDeviceId } from './ops'
import { activeBody, decodeDoc, encodeDoc, newDoc, projectDoc, toModel, updateBody, type RNode } from './richtext'
import { wins } from './hlc'
import type { Op, Project } from './types'

class Server {
  log: (Op & { seq: number })[] = []
  sync(device: string, cursor: number, ops: Op[]) {
    for (const op of ops) if (!this.log.some((o) => o.id === op.id)) this.log.push({ ...op, seq: this.log.length + 1 })
    return { ops: this.log.filter((o) => o.seq > cursor && o.device !== device), cursor: this.log.length }
  }
  field(entityId: string, field: string): unknown {
    let best: Op | undefined
    for (const o of this.log) if (o.entityId === entityId && o.field === field && wins(o.ts, o.device, best)) best = o
    return best?.value
  }
  rest(entityId: string, field: string, value: unknown, ts: number) {
    this.log.push({ id: crypto.randomUUID(), entity: 'project', entityId, field, value, ts, device: 'server', seq: this.log.length + 1 })
  }
}

interface Device { name: string; cursor: number }
let run = 0
let server: Server
const device = (name: string): Device => ({ name: `pn-${name}-${run}`, cursor: 0 })

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

async function settle(list: Device[]) {
  for (let round = 1; round <= 10; round++) {
    let sent = 0
    for (const d of list) sent += await sync(d)
    if (sent === 0) return
  }
  throw new Error('devices did not settle')
}

const para = (text: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] })
const read = (dev: Device, id: string) => on(dev, async () => (await db.projects.get(id)) as Project)

async function editNote(dev: Device, id: string, change: (nodes: RNode[]) => RNode[]) {
  await on(dev, async () => {
    const p = (await db.projects.get(id)) as Project
    const doc = decodeDoc(p.notes_doc ?? '') ?? newDoc()
    const body = activeBody(doc)
    doc.transact(() => updateBody(body, change(toModel(body))))
    await mutate('project', id, { notes_doc: encodeDoc(doc) })
  })
}

beforeEach(() => {
  run++
  server = new Server()
})

describe('project notes: data layer (project-notes 3.1–3.4)', () => {
  it('a new project writes no note op and reads back with an empty note', async () => {
    const a = device('a')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    const outbox = await on(a, () => db.outbox.toArray())
    expect(outbox.some((o) => o.field === 'description' || o.field === 'notes_doc')).toBe(false)
    const p = await read(a, id)
    expect(p.description ?? '').toBe('')
    expect(p.notes_doc ?? '').toBe('')
  })

  it('a document write carries its Markdown projection in the same batch', async () => {
    const a = device('a')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    await editNote(a, id, () => [para('Pack light.')])
    const ops = (await on(a, () => db.outbox.toArray())).filter((o) => o.entityId === id)
    const doc = ops.find((o) => o.field === 'notes_doc')!
    const desc = ops.find((o) => o.field === 'description')!
    expect(desc.value).toBe('Pack light.')
    expect(doc.ts).toBe(desc.ts)
  })

  it('concurrent edits by two members merge before write and converge', async () => {
    const a = device('a')
    const b = device('b')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    await editNote(a, id, () => [para('Intro.')])
    await settle([a, b])
    await editNote(a, id, (nodes) => [...nodes, para('From A.')])
    await editNote(b, id, (nodes) => [...nodes, para('From B.')])
    await settle([a, b])
    const pa = await read(a, id)
    const pb = await read(b, id)
    expect(pa.description).toBe(pb.description)
    expect(pa.description).toContain('From A.')
    expect(pa.description).toContain('From B.')
    expect(server.field(id, 'description')).toBe(pa.description)
  })

  it('a newer plain-text description (REST) is folded into the document; a stale one loses', async () => {
    const a = device('a')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    await editNote(a, id, () => [para('Old.')])
    await settle([a])
    server.rest(id, 'description', 'Rewritten from the API.', Date.now() + 60_000)
    await settle([a])
    expect((await read(a, id)).description).toBe('Rewritten from the API.')
    // Opening the note folds the newer plain text into the document.
    await on(a, () => foldNote('project', id))
    await settle([a])
    const p = await read(a, id)
    expect(projectDoc(p.notes_doc!)).toBe('Rewritten from the API.')
    expect(p.description).toBe('Rewritten from the API.')
    server.rest(id, 'description', 'Stale.', 1)
    await settle([a])
    expect((await read(a, id)).description).toBe('Rewritten from the API.')
  })

  it('a legacy plain note is upgraded to a document when opened', async () => {
    const a = device('a')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    await on(a, () => mutate('project', id, { description: 'Just text.' }))
    expect((await read(a, id)).notes_doc ?? '').toBe('')
    expect(await on(a, () => foldNote('project', id))).toBe(true)
    const p = await read(a, id)
    expect(p.notes_doc).toMatch(/^ydoc:v1:/)
    expect(p.description).toBe('Just text.')
    expect(await on(a, () => foldNote('project', id))).toBe(false)
  })

  it('refuses a document over the size cap before any op exists', async () => {
    const a = device('a')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    const before = await on(a, () => db.outbox.count())
    await expect(on(a, () => mutate('project', id, { notes_doc: 'ydoc:v1:' + 'A'.repeat(MAX_DOC_CHARS) }))).rejects.toBeInstanceOf(DocTooLargeError)
    expect(await on(a, () => db.outbox.count())).toBe(before)
  })

  it('a remote document that adds nothing is not republished', async () => {
    const a = device('a')
    const b = device('b')
    const id = await on(a, () => createProject({ name: 'Trip' }))
    await editNote(a, id, () => [para('Same.')])
    await settle([a, b])
    const before = server.log.length
    await settle([a, b])
    expect(server.log.length).toBe(before)
  })
})
