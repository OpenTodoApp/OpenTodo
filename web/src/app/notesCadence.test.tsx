// @vitest-environment happy-dom
// The note push cadence in the editor (OpenSpec change notes-save-cadence, tasks
// 2.1-2.3): typing saves on the device after every pause and pushes after 3 s
// quiet, at least every 60 s, and at once when the editor is left; a
// collaborator's change still merges in place while a push waits; the comment
// composer sends nothing while typing. Fake timers drive the clocks.
import { act } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Op, Task } from '../lib/types'

const uploads: Op[][] = []
const syncCalls = vi.fn(async (_device: string, _cursor: number, ops: Op[]) => {
  uploads.push(ops)
  return { applied: ops.length, ops: [], cursor: 5, hasMore: false, serverTime: Date.now() }
})
vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  api: {
    sync: (...args: unknown[]) => syncCalls(...(args as [string, number, Op[]])),
    calendarEvents: async () => ({ events: [], subscriptions: [] }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
}))

import { db, useDatabase } from '../lib/db'
import { applyOps, createTask, onLocalMutation, resetDeviceId } from '../lib/ops'
import { activeBody, decodeDoc, encodeDoc, renderMarkdown, toModel } from '../lib/richtext'
import { pmToModel } from '../lib/richtextEditor'
import { NOTE_MAX_WAIT_MS, NOTE_QUIET_MS, startSync, stopSync, syncSnapshot } from '../lib/sync'
import { render } from '../ui/test-utils'
import { Composer } from './task-detail/Composer'
import NotesEditor, { noteViewOf } from './NotesEditor'

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

// Node's setImmediate stays real: fake-indexeddb and promise chains settle on it
// without moving the fake clock.
const { setImmediate: nextTask } = globalThis as unknown as { setImmediate: (fn: () => void) => void }
async function settle(rounds = 200): Promise<void> {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise<void>((r) => nextTask(r))
  })
}
async function until(cond: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (await cond()) return
    // Live queries schedule on timers too: one fake millisecond per try.
    await tick(1)
  }
  throw new Error(`timed out waiting for ${what}: ${document.body.innerHTML.slice(0, 300)}`)
}
/** Move the fake clock, then let the work it started finish. */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await settle()
  // A timer that fired at the end of the step may have scheduled a zero-delay one,
  // which fake timers run a millisecond later.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  await settle()
}

let n = 0
beforeEach(() => {
  useDatabase(`notes-cadence-${Date.now()}-${n++}`)
  resetDeviceId()
  uploads.length = 0
  syncCalls.mockClear()
  FakeEventSource.last = null
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => {
  stopSync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The note editor over the stored task, as the task panel shows it. */
function Note({ id }: { id: string }) {
  const task = useLiveQuery(() => db.tasks.get(id), [id]) as Task | undefined
  if (!task) return null
  return <NotesEditor readOnly={false} note={{ entity: 'task', id, notes_doc: task.notes_doc ?? undefined, description: task.description, project_id: task.project_id, note_mentions: task.note_mentions, _clock: task._clock }} />
}

/** A task, the sync loop live and settled, and its note editor open and focused. */
async function openNote(): Promise<{ id: string; v: EditorView; unmount: () => Promise<void> }> {
  const id = await createTask({ title: 'Write the report' })
  startSync()
  await until(() => FakeEventSource.last !== null, 'the stream')
  FakeEventSource.last!.onopen?.(new Event('open'))
  await tick(0)
  await until(() => syncCalls.mock.calls.length >= 1 && !syncSnapshot().pending, 'the first exchange')
  const r = await render(<Note id={id} />)
  await until(() => !!r.container.querySelector('.notes-editor[contenteditable]'), 'the notes editor')
  const v = noteViewOf(r.container.querySelector('.notes-editor[contenteditable]')!)!
  v.focus()
  await tick(1000)
  uploads.length = 0
  syncCalls.mockClear()
  return { id, v, unmount: r.unmount }
}

async function typeText(v: EditorView, text: string): Promise<void> {
  await act(async () => {
    for (const ch of text) v.dispatch(v.state.tr.insertText(ch))
  })
}

const pushedDocs = () => uploads.flat().filter((o) => o.field === 'notes_doc')

/** The n-th document reaches the server well before the 3 s pause would send it. */
async function sentAtOnce(count: number): Promise<void> {
  for (let elapsed = 0; elapsed <= 1000; elapsed += 50) {
    if (pushedDocs().length >= count) break
    await tick(50)
  }
  expect(pushedDocs()).toHaveLength(count)
}
const textOf = (value: unknown) => renderMarkdown(toModel(activeBody(decodeDoc(value)!)))
const lastPushed = () => textOf(pushedDocs().at(-1)!.value)
const editorText = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))

describe('note push cadence in the editor (2.1)', () => {
  it('typing saves on the device after 400 ms and pushes once after 3 s of quiet', async () => {
    const { id, v } = await openNote()
    await typeText(v, 'Draft one')
    await tick(500)
    // Saved locally (a reload would find it), not yet sent.
    expect((await db.tasks.get(id))?.description).toBe('Draft one')
    expect(syncCalls).not.toHaveBeenCalled()
    await tick(NOTE_QUIET_MS)
    expect(pushedDocs()).toHaveLength(1)
    expect(lastPushed()).toBe('Draft one')
    await tick(NOTE_MAX_WAIT_MS)
    expect(pushedDocs()).toHaveLength(1)
  })

  it('typing then blur sends at once, also when the timed save already ran', async () => {
    const { v } = await openNote()
    await typeText(v, 'Before the save')
    await act(async () => void v.dom.dispatchEvent(new Event('blur')))
    await sentAtOnce(1)
    expect(lastPushed()).toBe('Before the save')
    v.focus()
    await typeText(v, ', after it')
    await tick(500)
    expect(pushedDocs()).toHaveLength(1)
    await act(async () => void v.dom.dispatchEvent(new Event('blur')))
    await sentAtOnce(2)
    expect(lastPushed()).toBe('Before the save, after it')
  })

  it('hiding the page, unloading it and closing the editor each send at once', async () => {
    const { v, unmount } = await openNote()
    await typeText(v, 'Hidden')
    await tick(500)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    visibility.mockRestore()
    await sentAtOnce(1)

    await typeText(v, ' then unloaded')
    await act(async () => void window.dispatchEvent(new Event('pagehide')))
    await sentAtOnce(2)
    expect(lastPushed()).toBe('Hidden then unloaded')

    await typeText(v, ' and closed')
    await unmount()
    await sentAtOnce(3)
    expect(lastPushed()).toBe('Hidden then unloaded and closed')
  })

  it('a collaborator\'s change merges in place while the local push waits', async () => {
    const { id, v } = await openNote()
    await typeText(v, 'Mine')
    await tick(500)
    expect(syncCalls).not.toHaveBeenCalled()
    // Device B starts from the same document and adds a paragraph above.
    const theirs = decodeDoc((await db.tasks.get(id))!.notes_doc)!
    const body = activeBody(theirs)
    const { insertModel } = await import('../lib/richtext')
    theirs.transact(() => insertModel(body, 0, [{ type: 'paragraph', attrs: {}, runs: [{ text: 'Theirs', marks: {} }] }]))
    await act(async () => {
      await applyOps([{ id: 'remote-1', entity: 'task', entityId: id, field: 'notes_doc', value: encodeDoc(theirs), ts: Date.now() + 1, device: 'phone-b' }])
    })
    await until(() => editorText(v).includes('Theirs'), 'the remote paragraph in the editor')
    expect(editorText(v)).toBe('Theirs\n\nMine')
    // Typing goes on where the caret was; the pending push still goes out after the pause.
    await typeText(v, '!')
    await tick(500 + NOTE_QUIET_MS)
    expect(editorText(v)).toBe('Theirs\n\nMine!')
    expect(pushedDocs().length).toBeGreaterThanOrEqual(1)
    expect(lastPushed()).toContain('Mine!')
  })
})

describe('count check (2.2)', () => {
  it('a 10-minute session with 1-2 s pauses pushes at most once per 3 s pause plus once a minute', async () => {
    const { v } = await openNote()
    let pauses = 0
    for (let second = 0; second < 600;) {
      // A burst of words, then a pause of 1 or 2 seconds; every 45 s a 4-second pause.
      await typeText(v, 'word ')
      const pause = second % 45 === 44 ? 4000 : second % 2 === 0 ? 1000 : 2000
      if (pause >= NOTE_QUIET_MS) pauses++
      await tick(pause)
      second += Math.max(1, Math.round(pause / 1000))
    }
    await tick(NOTE_QUIET_MS)
    const minutes = 10
    expect(pushedDocs().length).toBeGreaterThan(0)
    expect(pushedDocs().length).toBeLessThanOrEqual(pauses + minutes + 1)
    // The previous cadence pushed after every pause: about one per word, 400 here.
    expect(pushedDocs().length).toBeLessThan(40)
  })
})

describe('comment composer (2.3)', () => {
  it('typing a comment and waiting 3 s sends nothing and keeps the draft', async () => {
    const seen: string[] = []
    const off = onLocalMutation(({ push }) => seen.push(push))
    const submit = vi.fn(async () => true)
    const r = await render(<Composer id="c" draftTaskId="t1" members={[]} me={null} onSubmit={submit} submitLabel="Comment" label="Comment" rich={false} />)
    const area = r.container.querySelector('textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(area, 'Half a thought')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await tick(NOTE_QUIET_MS + 1000)
    off()
    expect(submit).not.toHaveBeenCalled()
    expect(seen).toEqual([])
    expect(await db.outbox.count()).toBe(0)
    expect(area.value).toBe('Half a thought')
    await r.unmount()
  })
})
