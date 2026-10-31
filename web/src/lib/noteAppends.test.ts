// Pending appends (notes-overview D13, docs/sync.md "Mergeable documents" rule
// 5) through the real data layer: simulated devices, each with its own
// IndexedDB, exchange ops through a tiny in-memory server.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, getDeviceId, mutate, resetDeviceId } from './ops'
import { activeBody, APPEND_ATTR, decodeDoc, encodeDoc, newDoc, toModel, updateBody, type RNode } from './richtext'
import * as rt from './richtext'
import { foldAppends, noteIsFull, pendingAppends } from './noteAppends'
import type { Op, Task } from './types'

class Server {
  log: (Op & { seq: number })[] = []
  sync(device: string, cursor: number, ops: Op[]) {
    for (const op of ops) if (!this.log.some((o) => o.id === op.id)) this.log.push({ ...op, seq: this.log.length + 1 })
    return { ops: this.log.filter((o) => o.seq > cursor && o.device !== device), cursor: this.log.length }
  }
  /** A plain-text writer (the CLI, MCP): one `appends.<id>` op from device "server". */
  append(entity: 'task' | 'note', entityId: string, id: string, text: string) {
    this.log.push({ id: crypto.randomUUID(), entity, entityId, field: `appends.${id}`, value: text, ts: Date.now() + 10_000, device: 'server', seq: this.log.length + 1 })
  }
}

interface Device { name: string; cursor: number }
let run = 0
let server: Server

const device = (name: string): Device => ({ name: `appends-${name}-${run}`, cursor: 0 })

async function on<T>(dev: Device, fn: () => Promise<T>): Promise<T> {
  useDatabase(dev.name)
  resetDeviceId()
  await getDeviceId()
  return fn()
}

/** Send the outbox and apply what the server has; `pull` false sends only. */
async function sync(dev: Device, pull = true): Promise<number> {
  return on(dev, async () => {
    const id = await getDeviceId()
    let sent = 0
    for (let round = 0; round < 10; round++) {
      const out = await db.outbox.orderBy('local').toArray()
      const res = server.sync(id, pull ? dev.cursor : Number.MAX_SAFE_INTEGER, out.map(({ local: _l, ...op }) => op))
      sent += out.length
      await db.outbox.bulkDelete(out.map((o) => o.local as number))
      if (!pull) break
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
const read = (dev: Device, id: string) => on(dev, async () => (await db.tasks.get(id)) as Task)

async function editNote(dev: Device, taskId: string, change: (nodes: RNode[]) => RNode[]): Promise<void> {
  await on(dev, async () => {
    const task = (await db.tasks.get(taskId)) as Task
    const doc = decodeDoc(task.notes_doc ?? '') ?? newDoc()
    const body = activeBody(doc)
    doc.transact(() => updateBody(body, change(toModel(body))))
    await mutate('task', taskId, { notes_doc: encodeDoc(doc) })
  })
}

function count(text: string, word: string): number {
  return text.split(word).length - 1
}

beforeEach(() => {
  run++
  server = new Server()
})

describe('pending appends (rule 5)', () => {
  it('a device folds an append at the end and clears the key in the same batch', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 'Meeting' }))
    await editNote(a, id, () => [para('Agenda.')])
    await sync(a)
    server.append('task', id, 'x1', '- ship Friday')
    await sync(a)
    const t = await read(a, id)
    expect(t.description).toBe('Agenda.\n\n- ship Friday')
    expect(t.appends?.x1).toBe('')
    expect(t._clock['appends.x1'].ts).toBe(t._clock.notes_doc.ts)
    const doc = decodeDoc(t.notes_doc ?? '')!
    const last = activeBody(doc).get(activeBody(doc).length - 1) as unknown as { getAttribute(k: string): unknown }
    expect(last.getAttribute(APPEND_ATTR)).toBe('x1')
  })

  it('two devices folding the same append converge on one copy', async () => {
    const a = device('a')
    const b = device('b')
    const id = await on(a, () => createTask({ title: 'Plan' }))
    await editNote(a, id, () => [para('Intro.')])
    await settle([a, b])
    server.append('task', id, 'dup', 'called back')
    // Both pull the append and fold it before seeing the other's document.
    await sync(a)
    await sync(b)
    await settle([a, b])
    for (const d of [a, b]) {
      const t = await read(d, id)
      expect(count(t.description, 'called back'), d.name).toBe(1)
      expect(t.description).toBe('Intro.\n\ncalled back')
    }
    expect((await read(a, id)).notes_doc).toBe((await read(b, id)).notes_doc)
  })

  it('an append and a concurrent offline rich edit both survive', async () => {
    const a = device('a')
    const b = device('b')
    const id = await on(a, () => createTask({ title: 'Plan' }))
    await editNote(a, id, () => [para('One.'), para('Two.')])
    await settle([a, b])
    // B goes offline and adds a paragraph in the middle.
    await editNote(b, id, (n) => [n[0], para('Middle.'), n[1]])
    server.append('task', id, 'late', '- ship Friday')
    await sync(a)
    await settle([a, b])
    for (const d of [a, b]) {
      const t = await read(d, id)
      expect(t.description, d.name).toBe('One.\n\nMiddle.\n\nTwo.\n\n- ship Friday')
    }
  })

  it('an append confirmed on this device is a direct insertion, never a pending op', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 'Plan' }))
    await editNote(a, id, () => [para('Intro.')])
    await on(a, () => mutate('task', id, { 'appends.mine': 'from the assistant' }))
    const t = await read(a, id)
    expect(t.description).toBe('Intro.\n\nfrom the assistant')
    const out = await on(a, () => db.outbox.toArray())
    expect(out.some((o) => o.field.startsWith('appends.'))).toBe(false)
  })

  it('a note without a document becomes one and takes the append', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 'Plain', description: 'old text' }))
    await sync(a)
    server.append('task', id, 'p1', 'more')
    await sync(a)
    expect((await read(a, id)).description).toBe('old text\n\nmore')
  })

  it('leaves an append pending when the note is full, and lists pending appends oldest first', () => {
    const doc = rt.foldText('', 'base', 1, 'd')
    const row = { notes_doc: doc, appends: { b: 'second', a: 'first' }, _clock: { 'appends.a': { ts: 1, device: 's' }, 'appends.b': { ts: 2, device: 's' } } }
    expect(pendingAppends(row).map((p) => p.id)).toEqual(['a', 'b'])
    expect(foldAppends(rt, row, undefined, doc.length + 10)).toBeNull()
    expect(noteIsFull(rt, row, doc.length + 10)).toBe(true)
    const folded = foldAppends(rt, row)!
    expect(folded['appends.a']).toBe('')
    expect(folded.description).toBe('base\n\nfirst\n\nsecond')
    // Folding again changes nothing: the blocks are already there.
    expect(foldAppends(rt, { ...row, notes_doc: folded.notes_doc, appends: { a: '', b: '' } })).toBeNull()
  })
})
