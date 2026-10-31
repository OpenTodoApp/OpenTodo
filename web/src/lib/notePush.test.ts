// The note push cadence (OpenSpec change notes-save-cadence, tasks 1.1 and 1.2):
// a note saved while typing is pushed 3 s after the last save, at least every
// 60 s, at once when the editor is left, and with any other exchange.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Op } from './types'

const uploads: Op[][] = []
const syncCalls = vi.fn(async (_device: string, _cursor: number, ops: Op[]) => {
  uploads.push(ops)
  return { applied: ops.length, ops: [], cursor: 5, hasMore: false, serverTime: Date.now() }
})
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  api: {
    sync: (...args: unknown[]) => syncCalls(...(args as [string, number, Op[]])),
    calendarEvents: async () => ({ events: [], subscriptions: [] }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { db, useDatabase } from './db'
import { createTask, mutate, onLocalMutation, resetDeviceId } from './ops'
import { activeBody, encodeDoc, newDoc, updateBody } from './richtext'
import { NOTE_MAX_WAIT_MS, NOTE_QUIET_MS, pushPendingNotes, startSync, stopSync, syncSnapshot } from './sync'

/** An EventSource that opens when asked, so the live interval (5 min) applies. */
class FakeEventSource {
  static last: FakeEventSource | null = null
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  constructor(public url: string) {
    FakeEventSource.last = this
  }
  addEventListener() {}
  close() {}
}

const { setImmediate: nextTask } = globalThis as unknown as { setImmediate: (fn: () => void) => void }
async function settle(rounds = 25): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => nextTask(r))
}
async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return
    await new Promise<void>((r) => nextTask(r))
  }
  throw new Error(`timed out waiting for ${what}`)
}
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

let n = 0
beforeEach(() => {
  useDatabase(`note-push-${Date.now()}-${n++}`)
  resetDeviceId()
  uploads.length = 0
  syncCalls.mockClear()
  FakeEventSource.last = null
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('navigator', { onLine: true })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => {
  stopSync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A task, synced, with the live channel open. */
async function connectedTask(): Promise<string> {
  const id = await createTask({ title: 'Write the report' })
  startSync()
  await until(() => FakeEventSource.last !== null, 'the stream')
  FakeEventSource.last!.onopen?.(new Event('open'))
  await tick(0)
  await until(() => syncCalls.mock.calls.length >= 1 && !syncSnapshot().pending, 'the first exchange')
  await tick(1000)
  uploads.length = 0
  syncCalls.mockClear()
  return id
}

const doc = newDoc()
/** What the editor's timed save does: the whole document, deferred. */
async function save(id: string, text: string, push: 'now' | 'deferred' = 'deferred'): Promise<void> {
  doc.transact(() => updateBody(activeBody(doc), [{ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] }]))
  await mutate('task', id, { notes_doc: encodeDoc(doc) }, { push })
  await settle()
}

const docOps = () => uploads.flat().filter((o) => o.field === 'notes_doc')

describe('mutation listeners (1.1)', () => {
  it('receive the push timing; the outbox keeps one pending document across deferred saves', async () => {
    const seen: string[] = []
    const off = onLocalMutation(({ push }) => seen.push(push))
    const id = await createTask({ title: 'Draft' })
    await save(id, 'one')
    await save(id, 'one two')
    await mutate('task', id, { priority: 2 })
    off()
    expect(seen).toEqual(['now', 'deferred', 'deferred', 'now'])
    const queued = (await db.outbox.toArray()).filter((o) => o.entityId === id)
    expect(queued.filter((o) => o.field === 'notes_doc')).toHaveLength(1)
    // The projection saved with it is replaced too.
    expect(queued.filter((o) => o.field === 'description')).toHaveLength(1)
  })
})

describe('note push cadence (1.2)', () => {
  it('saves every second for 30 s send nothing; a 3 s pause sends one document, the newest', async () => {
    const id = await connectedTask()
    for (let i = 1; i <= 30; i++) {
      await save(id, `line ${i}`)
      await tick(1000)
    }
    expect(syncCalls).not.toHaveBeenCalled()
    // The indicator shows the change as pending meanwhile.
    expect(syncSnapshot().state).toBe('syncing')
    await tick(NOTE_QUIET_MS)
    expect(syncCalls).toHaveBeenCalledTimes(1)
    expect(docOps()).toHaveLength(1)
    expect(docOps()[0].value).toBe(encodeDoc(doc))
  })

  it('150 s of saves without a 3 s pause push at least twice, never more than once a minute', async () => {
    const id = await connectedTask()
    for (let i = 1; i <= 150; i++) {
      await save(id, `word ${i}`)
      await tick(1000)
    }
    expect(syncCalls.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(syncCalls.mock.calls.length).toBeLessThanOrEqual(3)
    // Each push carries the newest document and its projection only, not every save's.
    for (const batch of uploads) expect(batch.map((o) => o.field).sort()).toEqual(['description', 'notes_doc'])
  })

  it('a save with push now, or leaving the editor, sends at once', async () => {
    const id = await connectedTask()
    await save(id, 'first', 'now')
    await tick(300)
    expect(docOps()).toHaveLength(1)
    await save(id, 'second')
    await tick(500)
    expect(docOps()).toHaveLength(1)
    pushPendingNotes()
    await tick(0)
    expect(docOps()).toHaveLength(2)
    // Nothing pending: leaving again sends nothing, and the timers were cleared.
    pushPendingNotes()
    await tick(NOTE_MAX_WAIT_MS)
    expect(docOps()).toHaveLength(2)
  })

  it('another field\'s edit carries the pending document', async () => {
    const id = await connectedTask()
    await save(id, 'thinking about the due date')
    await tick(500)
    await mutate('task', id, { due: { date: '2026-11-05' } })
    await tick(300)
    expect(syncCalls).toHaveBeenCalledTimes(1)
    expect(uploads[0].map((o) => o.field)).toEqual(expect.arrayContaining(['notes_doc', 'due']))
    // The exchange cleared the note timers: no second push for the same document.
    await tick(NOTE_MAX_WAIT_MS)
    expect(syncCalls).toHaveBeenCalledTimes(1)
  })

  it('offline: saves stay on the device and the next exchange sends one document with the latest text', async () => {
    const id = await connectedTask()
    vi.stubGlobal('navigator', { onLine: false })
    for (let i = 1; i <= 20; i++) {
      await save(id, `offline ${i}`)
      await tick(1000)
    }
    await tick(NOTE_MAX_WAIT_MS)
    expect(syncCalls).not.toHaveBeenCalled()
    expect((await db.outbox.toArray()).filter((o) => o.field === 'notes_doc')).toHaveLength(1)
    vi.stubGlobal('navigator', { onLine: true })
    ;(globalThis.window as unknown as EventTarget).dispatchEvent(new Event('online'))
    await tick(0)
    expect(docOps()).toHaveLength(1)
    expect(docOps()[0].value).toBe(encodeDoc(doc))
  })
})
