// Convergence of rich-text notes through the real data layer (OpenSpec change
// `collaborative-rich-text`): several simulated devices, each with its own
// IndexedDB, exchange ops through a tiny in-memory server that behaves like the
// real one (append-only log, last-writer-wins materialisation, no echo of a
// device's own ops).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { DocTooLargeError, MAX_DOC_CHARS } from './docfields'
import { applyOps, createTask, foldNote, getDeviceId, mutate, resetDeviceId, updateTask } from './ops'
import { activeBody, decodeDoc, encodeDoc, foldText, newDoc, projectDoc, toModel, updateBody, type RNode } from './richtext'
import type { Op, Task } from './types'
import { wins } from './hlc'
import { publishEncryption } from './e2ee'

class Server {
  log: (Op & { seq: number })[] = []
  sync(device: string, cursor: number, ops: Op[]) {
    for (const op of ops) if (!this.log.some((o) => o.id === op.id)) this.log.push({ ...op, seq: this.log.length + 1 })
    return { ops: this.log.filter((o) => o.seq > cursor && o.device !== device), cursor: this.log.length }
  }
  /** The stored (winning) value of a field, as REST reads and the export see it. */
  field(entityId: string, field: string): unknown {
    let best: Op | undefined
    for (const o of this.log) if (o.entityId === entityId && o.field === field && wins(o.ts, o.device, best)) best = o
    return best?.value
  }
  /** A REST write: device "server", stamped now. */
  rest(entityId: string, field: string, value: unknown, ts = Date.now() + 10_000) {
    this.log.push({ id: crypto.randomUUID(), entity: 'task', entityId, field, value, ts, device: 'server', seq: this.log.length + 1 })
  }
}

interface Device {
  name: string
  cursor: number
}

let run = 0
let server: Server
const devices: Device[] = []

function device(name: string): Device {
  const d = { name: `${name}-${run}`, cursor: 0 }
  devices.push(d)
  return d
}

/** Run `fn` with `dev`'s database selected (the data layer uses one global db). */
async function on<T>(dev: Device, fn: () => Promise<T>): Promise<T> {
  useDatabase(dev.name)
  resetDeviceId()
  await getDeviceId()
  return fn()
}

/** One full exchange for a device, repeated while merging queued republishes. */
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

/** Sync every device until a full round sends nothing. Returns the number of rounds. */
async function settle(list: Device[]): Promise<number> {
  for (let round = 1; round <= 10; round++) {
    let sent = 0
    for (const d of list) sent += await sync(d)
    if (sent === 0) return round
  }
  throw new Error('devices did not settle')
}

/** What the editor does: change the visible body of the stored document and save it. */
async function editNote(dev: Device, taskId: string, change: (nodes: RNode[]) => RNode[]): Promise<void> {
  await on(dev, async () => {
    const task = (await db.tasks.get(taskId)) as Task
    const doc = decodeDoc(task.notes_doc ?? '') ?? newDoc()
    const body = activeBody(doc)
    doc.transact(() => updateBody(body, change(toModel(body))))
    await mutate('task', taskId, { notes_doc: encodeDoc(doc) })
  })
}

const para = (text: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] })
const read = (dev: Device, taskId: string) => on(dev, async () => (await db.tasks.get(taskId)) as Task)

async function sharedNote(a: Device, b: Device, text = 'Shared intro.'): Promise<string> {
  const id = await on(a, () => createTask({ title: 'Plan the trip' }))
  await editNote(a, id, () => [para(text)])
  await settle([a, b])
  return id
}

beforeEach(() => {
  run++
  server = new Server()
  devices.length = 0
})

describe('rich-text notes: data layer', () => {
  it('new task has empty notes_doc and no document op', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 'Only a title' }))
    const t = await read(a, id)
    expect(t.notes_doc).toBe('')
    expect(t.description).toBe('')
    const ops = await on(a, () => db.outbox.toArray())
    expect(ops.some((o) => o.field === 'notes_doc')).toBe(false)
  })

  it('a document write carries its Markdown projection in the same batch', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't' }))
    await editNote(a, id, () => [{ type: 'heading', attrs: { level: 1 }, runs: [{ text: 'Steps', marks: {} }] }, { type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: false }, content: [para('call the plumber')] }] }])
    const t = await read(a, id)
    expect(t.description).toBe('# Steps\n\n- [ ] call the plumber')
    expect(t._clock.description).toEqual(t._clock.notes_doc)
    const ops = await on(a, () => db.outbox.toArray())
    const pair = ops.filter((o) => o.field === 'notes_doc' || o.field === 'description').slice(-2)
    expect(pair[0].ts).toBe(pair[1].ts)
  })

  it('concurrent inserts converge on both replicas', async () => {
    for (const order of [['a', 'b'], ['b', 'a']]) {
      run++
      server = new Server()
      const a = device('a')
      const b = device('b')
      const id = await sharedNote(a, b)
      // Both offline: each appends its own paragraph.
      await editNote(a, id, (n) => [...n, para('Paragraph from A.')])
      await editNote(b, id, (n) => [...n, para('Paragraph from B.')])
      const byName = { a, b } as Record<string, Device>
      await settle(order.map((x) => byName[x]))
      const ta = await read(a, id)
      const tb = await read(b, id)
      expect(ta.description).toContain('Paragraph from A.')
      expect(ta.description).toContain('Paragraph from B.')
      expect(ta.description).toBe(tb.description)
      expect(projectDoc(ta.notes_doc ?? '')).toBe(projectDoc(tb.notes_doc ?? ''))
      // The server's stored values (REST, export) hold both too.
      expect(server.field(id, 'description')).toBe(ta.description)
      expect(projectDoc(server.field(id, 'notes_doc') as string)).toBe(ta.description)
      expect(ta._clock.notes_doc).toEqual(tb._clock.notes_doc)
      // Merge terminates: another exchange sends nothing.
      expect(await sync(a) + await sync(b)).toBe(0)
    }
  })

  it('edit and delete overlap: the sentence is gone and the word is bold everywhere', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b, 'Delete this sentence. Keep this word here.')
    await editNote(a, id, () => [para('Keep this word here.')])
    await editNote(b, id, (): RNode[] => [{
      type: 'paragraph', attrs: {}, runs: [
        { text: 'Delete this sentence. Keep this ', marks: {} }, { text: 'word', marks: { strong: {} } }, { text: ' here.', marks: {} },
      ],
    }])
    await settle([b, a])
    for (const d of [a, b]) expect((await read(d, id)).description).toBe('Keep this **word** here.')
  })

  it('randomized interleavings converge', async () => {
    let seed = 7
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    for (let trial = 0; trial < 6; trial++) {
      run++
      server = new Server()
      const list = [device('a'), device('b'), device('c')]
      const id = await sharedNote(list[0], list[1], 'Base text for everyone.')
      await settle(list)
      for (let step = 0; step < 12; step++) {
        const d = list[Math.floor(rand() * list.length)]
        if (rand() < 0.35) {
          await sync(d)
          continue
        }
        const tag = `${d.name.slice(0, 1)}${step}`
        await editNote(d, id, (nodes) => {
          const out = [...nodes]
          const k = Math.floor(rand() * out.length)
          const text = (out[k]?.runs ?? []).map((r) => r.text).join('')
          if (rand() < 0.5) out.splice(k + 1, 0, para(`line ${tag}`))
          else out[k] = para(`${text.slice(0, 4)}<${tag}>${text.slice(4)}`)
          return out
        })
      }
      await settle(list)
      const texts = await Promise.all(list.map(async (d) => (await read(d, id)).description))
      expect(new Set(texts).size).toBe(1)
      expect(server.field(id, 'description')).toBe(texts[0])
      for (const d of list) expect(await sync(d)).toBe(0)
    }
  })

  it('merge of identical states emits no op', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b)
    const t = await read(b, id)
    await on(b, async () => {
      await applyOps([{ id: crypto.randomUUID(), entity: 'task', entityId: id, field: 'notes_doc', value: t.notes_doc, ts: 1, device: 'old' }])
      await applyOps([{ id: crypto.randomUUID(), entity: 'task', entityId: id, field: 'notes_doc', value: t.notes_doc, ts: Date.now() + 99_999, device: 'zz' }])
      expect(await db.outbox.count()).toBe(0)
    })
  })

  it('REST description write becomes document', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b, 'Old note.')
    server.rest(id, 'description', '- [ ] call the plumber')
    await settle([a, b])
    // Nothing is rewritten until a device opens the note…
    expect((await read(a, id)).description).toBe('- [ ] call the plumber')
    expect(await on(a, () => db.outbox.count())).toBe(0)
    // …then both devices fold it (concurrently, offline) and the folds merge into one.
    await on(a, () => foldNote(id))
    await on(b, () => foldNote(id))
    await settle([a, b])
    for (const d of [a, b]) {
      const t = await read(d, id)
      expect(t.description).toBe('- [ ] call the plumber')
      expect(projectDoc(t.notes_doc ?? '')).toBe('- [ ] call the plumber')
      const item = toModel(activeBody(decodeDoc(t.notes_doc ?? '') as ReturnType<typeof newDoc>))[0]
      expect(item.type).toBe('bullet_list')
      expect(item.content?.[0].attrs.checked).toBe(false)
    }
    expect(projectDoc(server.field(id, 'notes_doc') as string)).toBe('- [ ] call the plumber')
  })

  it('a merge after a REST write keeps the REST text', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b, 'Old note.')
    // B edits offline (older clock); a script then rewrites the description.
    await editNote(b, id, (n) => [...n, para('offline addition')])
    server.rest(id, 'description', 'Replaced by a script')
    await settle([a, b])
    for (const d of [a, b]) expect((await read(d, id)).description).toBe('Replaced by a script')
  })

  it('stale description does not override document', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b, 'Current note.')
    server.rest(id, 'description', 'stale text', 5) // older than every edit
    await settle([a, b])
    for (const d of [a, b]) {
      const t = await read(d, id)
      expect(t.description).toBe('Current note.')
      await on(d, () => foldNote(id))
    }
    expect(await on(a, () => db.outbox.count())).toBe(0)
    // A document written without its projection (an API client) is re-projected.
    const t = await read(a, id)
    const doc = foldText(t.notes_doc ?? '', 'From the API', 1, 'api')
    server.rest(id, 'notes_doc', foldText(doc, 'Newer doc', Date.now(), 'api'))
    await settle([a, b])
    await on(a, () => foldNote(id))
    await settle([a, b])
    for (const d of [a, b]) expect((await read(d, id)).description).toBe('Newer doc')
  })

  it('a local plain-text write (history restore, quick edit) is folded into the document', async () => {
    const a = device('a')
    const b = device('b')
    const id = await sharedNote(a, b, 'Version two.')
    await on(a, () => updateTask(id, { description: 'Version **one**.' }))
    const t = await read(a, id)
    expect(projectDoc(t.notes_doc ?? '')).toBe('Version **one**.')
    expect(t._clock.notes_doc).toEqual(t._clock.description)
    await settle([a, b])
    expect((await read(b, id)).description).toBe('Version **one**.')
  })

  it('legacy notes are upgraded when opened', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't', description: 'Some **notes**\n- a list' }))
    expect((await read(a, id)).notes_doc).toBe('')
    expect(await on(a, () => foldNote(id))).toBe(true)
    const t = await read(a, id)
    expect(projectDoc(t.notes_doc ?? '')).toBe('Some **notes**\n\n- a list')
    expect(t.description).toBe('Some **notes**\n\n- a list')
    expect(await on(a, () => foldNote(id))).toBe(false)
  })

  it('outbox keeps one doc op per task', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't' }))
    for (const text of ['one', 'one two', 'one two three']) await editNote(a, id, () => [para(text)])
    const ops = await on(a, () => db.outbox.toArray())
    expect(ops.filter((o) => o.field === 'notes_doc')).toHaveLength(1)
    expect(projectDoc(ops.find((o) => o.field === 'notes_doc')?.value as string)).toBe('one two three')
  })

  it('oversized document is refused locally', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't' }))
    // Random text barely compresses, so the encoded state outgrows the cap.
    let s = ''
    while (s.length < MAX_DOC_CHARS) s += Math.random().toString(36).slice(2)
    const before = await on(a, () => db.outbox.count())
    await expect(editNote(a, id, () => [para(s)])).rejects.toBeInstanceOf(DocTooLargeError)
    expect(await on(a, () => db.outbox.count())).toBe(before)
    expect((await read(a, id)).notes_doc).toBe('')
  })

  it('with end-to-end encryption the document has its own cap, the projection the 48 KB text cap', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't' }))
    publishEncryption({ enabled: true })
    try {
      // ~20 KB of text: fine for both caps.
      await editNote(a, id, () => Array.from({ length: 400 }, (_, i) => para(`line ${i} ${'x'.repeat(40)}`)))
      expect((await read(a, id)).notes_doc?.length).toBeGreaterThan(20_000)
      // ~60 KB of text: the projection could not be encrypted within the value limit.
      await expect(editNote(a, id, () => Array.from({ length: 1200 }, (_, i) => para(`line ${i} ${'y'.repeat(40)}`)))).rejects.toThrow()
      expect((await read(a, id)).description).toContain('x'.repeat(40))
    } finally {
      publishEncryption({ enabled: false })
    }
  })

  it('document ops stay out of the activity log', async () => {
    const a = device('a')
    const id = await on(a, () => createTask({ title: 't' }))
    await editNote(a, id, () => [para('hello')])
    const rows = await on(a, () => db.activity.where('taskId').equals(id).toArray())
    expect(rows.some((r) => r.field === 'notes_doc')).toBe(false)
    expect(rows.some((r) => r.field === 'description')).toBe(true)
  })
})
