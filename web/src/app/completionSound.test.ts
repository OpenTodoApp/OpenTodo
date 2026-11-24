// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { db } from '../lib/db'
import { applyOps, createTask, resetDeviceId } from '../lib/ops'
import { logicalToday } from '../lib/dates'
import { resetTone } from '../lib/focus/tone'
import { undoBatch } from '../lib/undo'
import { runBulk } from './bulk/BulkActions'
import { completeWithUndo } from './undoable'
import { prepareCompletionSound, setTaskCompletedWithFeedback } from './completionSound'

const prefs = vi.hoisted(() => ({ value: 'on' }))
vi.mock('../lib/localData', async (original) => ({
  ...await original<typeof import('../lib/localData')>(),
  currentUserPrefsRow: () => ({ completion_sound: prefs.value }),
}))

let cues: number[]
let started: Mock<() => void>

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  prefs.value = 'on'
  cues = []
  started = vi.fn()
  vi.stubGlobal('AudioContext', class {
    state = 'running'
    currentTime = 0
    sampleRate = 48_000
    destination = {}
    constructor() { started() }
    async resume() {}
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }
    }
    createBufferSource() {
      return {
        buffer: undefined as { duration: number } | undefined,
        connect() {},
        start() { cues.push(Math.round((this.buffer?.duration ?? 0) * 1_000)) },
      }
    }
  })
})

afterEach(() => {
  resetTone()
  delete window.opentodoShell
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('task completion sound', () => {
  it('prepares audio in the first gesture and plays after the write', async () => {
    const id = await createTask({ title: 'Task' })
    const completing = setTaskCompletedWithFeedback(id, true)
    expect(started).toHaveBeenCalledOnce()
    expect(cues).toEqual([])
    await completing
    expect((await db.tasks.get(id))?.completed_at).toBeTruthy()
    expect(cues).toEqual([239])
    await setTaskCompletedWithFeedback(id, true)
    await setTaskCompletedWithFeedback(id, false)
    expect(cues).toEqual([239])
  })

  it('plays once for a subtree and once for a bulk action, and stays quiet for a bulk reopen', async () => {
    const parent = await createTask({ title: 'Parent' })
    const child = await createTask({ title: 'Child', parent_id: parent })
    const another = await createTask({ title: 'Another' })
    const second = await createTask({ title: 'Second' })
    await completeWithUndo(parent, true)
    expect((await db.tasks.get(child))?.completed_at).toBeTruthy()
    expect(cues).toEqual([239])
    await runBulk([another, second], { kind: 'complete' })
    expect(cues).toEqual([239, 239])
    await runBulk([another, second], { kind: 'complete' })
    expect(cues).toEqual([239, 239])
  })

  it('plays once for a recurring occurrence and stays quiet on Undo', async () => {
    const id = await createTask({ title: 'Daily task', due: { date: logicalToday() }, recurrence: 'every day' })
    await completeWithUndo(id, true)
    expect((await db.tasks.get(id))?.due?.date).not.toBe(logicalToday())
    expect(cues).toEqual([239])
    const entry = await db.assistantUndo.orderBy('created_at').last()
    expect(entry).toBeTruthy()
    await undoBatch(entry!.id)
    expect(cues).toEqual([239])
  })

  it('skips disabled, missing, hidden, and synced actions', async () => {
    prefs.value = 'off'
    const id = await createTask({ title: 'Task' })
    await completeWithUndo(id, true)
    expect(started).not.toHaveBeenCalled()
    prefs.value = 'on'
    await completeWithUndo('missing', true)
    const next = await createTask({ title: 'Synced task' })
    await applyOps([{ id: 'from-other-device', entity: 'task', entityId: next, field: 'completed_at', value: Date.now(), ts: Date.now() * 2, device: 'other' }])
    const cue = prepareCompletionSound(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    cue?.()
    expect(cues).toEqual([])
  })

  it('uses the advertised mobile capability without a browser fallback', async () => {
    const playCompletionSound = vi.fn()
    const host = { platform: 'android' as const, bridge: 1, app: '1.5.0', playCompletionSound }
    window.opentodoShell = { ...host, capabilities: ['haptics'] }
    await completeWithUndo(await createTask({ title: 'On an old shell' }), true)
    expect(playCompletionSound).not.toHaveBeenCalled()
    expect(started).not.toHaveBeenCalled()
    window.opentodoShell = { ...host, capabilities: ['completion-sound'] }
    await completeWithUndo(await createTask({ title: 'On a supported shell' }), true)
    expect(playCompletionSound).toHaveBeenCalledExactlyOnceWith()
    expect(started).not.toHaveBeenCalled()
  })
})
