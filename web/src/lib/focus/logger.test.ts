import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { setCurrentUserId } from '../sharing'
import { startTracking, stopTracking } from '../timeEntries'
import { noopLogger, setFocusLogger, timeTrackingLogger } from './index'
import { FOCUS_DEFAULTS } from './prefs'
import { breakSession, extendSession, finishIfDue, noteEntryStopped, pauseSession, resumeSession, startSession, completeSession } from './session'
import { readFocus, writeFocus } from './state'
import { idleState } from './timer'

// Sessions as time entries (OpenSpec focus-mode, task 2.4): with time tracking a
// work stretch is one entry, breaks are never logged; without it nothing is written.

const T0 = new Date(2026, 9, 20, 9, 0).getTime()
const MIN = 60_000
const at = (m: number) => T0 + m * MIN
let n = 0
let task = ''
beforeEach(async () => {
  useDatabase(`focus-log-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
  task = await createTask({ title: 'Write the report' })
  await db.outbox.clear()
})
afterEach(() => { setFocusLogger(timeTrackingLogger) })

const entries = async () => (await db.timeEntries.toArray()).filter((e) => !e.deleted_at).sort((a, b) => a.started_at - b.started_at)

describe('with time tracking', () => {
  it('Session logged: a 25 minute session, then completed, is one entry of 25 minutes from the start', async () => {
    await startSession(task, FOCUS_DEFAULTS, at(0))
    expect((await readFocus())?.entryId).toBeTruthy()
    await completeSession(task, null, FOCUS_DEFAULTS, at(25))
    const list = await entries()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ task_id: task, started_at: at(0), ended_at: at(25) })
  })

  it('Pause is not work: ten paused minutes are covered by no entry', async () => {
    await startSession(task, FOCUS_DEFAULTS, at(0))
    await pauseSession(at(10))
    expect((await readFocus())?.entryId).toBeNull()
    await resumeSession(at(20))
    await finishIfDue(FOCUS_DEFAULTS, at(40))
    const list = await entries()
    expect(list.map((e) => [e.started_at, e.ended_at])).toEqual([[at(0), at(10)], [at(20), at(35)]])
  })

  it('Break not logged: the entry stops at the end of the session and the break adds none', async () => {
    await startSession(task, FOCUS_DEFAULTS, at(0))
    await finishIfDue(FOCUS_DEFAULTS, at(26))
    await breakSession(FOCUS_DEFAULTS, at(26))
    expect((await readFocus())?.phase).toBe('break')
    await finishIfDue(FOCUS_DEFAULTS, at(40))
    const list = await entries()
    expect(list.map((e) => [e.started_at, e.ended_at])).toEqual([[at(0), at(25)]])
  })

  it('Entry stopped elsewhere: the session pauses with the reason and Space starts a new entry', async () => {
    await startSession(task, FOCUS_DEFAULTS, at(0))
    const first = (await readFocus())!.entryId!
    await stopTracking({ now: at(5) })
    await noteEntryStopped(first, at(6))
    expect(await readFocus()).toMatchObject({ resumedAt: null, pausedReason: 'elsewhere', entryId: null })
    await resumeSession(at(7))
    const list = await entries()
    expect(list).toHaveLength(2)
    expect(list[1]).toMatchObject({ started_at: at(7), ended_at: null })
  })
})

// Session details on the time entry (OpenSpec focus-session-readable, task 2.1):
// the mode, the Pomodoro session number and the planned end travel with the entry.
describe('session details on the entry', () => {
  const outboxFields = async (entryId: string) =>
    Object.fromEntries((await db.outbox.toArray()).filter((o) => o.entity === 'time_entry' && o.entityId === entryId).map((o) => [o.field, o.value]))

  it('Third Pomodoro: mode, session 3 and the planned end 25 minutes after the start', async () => {
    await writeFocus(idleState(task, 'pomodoro', at(0), { cycle: 3, lengthMinutes: 25 }))
    await startSession(task, FOCUS_DEFAULTS, at(0))
    const [e] = await entries()
    expect(e).toMatchObject({ focus_mode: 'pomodoro', focus_session: 3, planned_end_at: at(25), ended_at: null })
    expect(await outboxFields(e.id)).toMatchObject({ focus_mode: 'pomodoro', focus_session: 3, planned_end_at: at(25) })
  })

  it('Resume after a pause: the new entry keeps session 3 and ends when the time left runs out', async () => {
    await writeFocus(idleState(task, 'pomodoro', at(0), { cycle: 3, lengthMinutes: 25 }))
    await startSession(task, FOCUS_DEFAULTS, at(0))
    await pauseSession(at(10))
    await resumeSession(at(20))
    const list = await entries()
    expect(list.map((e) => [e.started_at, e.ended_at, e.focus_session, e.planned_end_at])).toEqual([[at(0), at(10), 3, at(25)], [at(20), null, 3, at(35)]])
  })

  it('Flowtime: mode flowtime, session 0 and no planned end', async () => {
    await startSession(task, { ...FOCUS_DEFAULTS, mode: 'flowtime' }, at(0))
    const [e] = await entries()
    expect(e).toMatchObject({ focus_mode: 'flowtime', focus_session: 0, planned_end_at: null })
  })

  it('Countdown offline: the entry and its three fields are stored and queued together at once', async () => {
    await startSession(task, { ...FOCUS_DEFAULTS, mode: 'countdown' }, at(0), 40)
    const [e] = await entries()
    expect(e).toMatchObject({ focus_mode: 'countdown', focus_session: 0, planned_end_at: at(40) })
    expect(await outboxFields(e.id)).toMatchObject({ started_at: at(0), focus_mode: 'countdown', focus_session: 0, planned_end_at: at(40) })
  })

  it('Extended session: "+5 min" starts an entry that ends five minutes later', async () => {
    await startSession(task, FOCUS_DEFAULTS, at(0))
    await finishIfDue(FOCUS_DEFAULTS, at(25))
    await extendSession(5, at(26))
    const list = await entries()
    expect(list[1]).toMatchObject({ started_at: at(26), ended_at: null, focus_mode: 'pomodoro', planned_end_at: at(31) })
  })

  it('A plain timer keeps the defaults', async () => {
    const id = await startTracking(task, { now: at(0) })
    const row = await db.timeEntries.get(id)
    expect(row?.focus_mode ?? '').toBe('')
    expect(row?.planned_end_at ?? null).toBeNull()
  })
})

describe('without time tracking', () => {
  it('Degraded: a full session starts, pauses and ends the same and writes no op', async () => {
    setFocusLogger(noopLogger)
    await startSession(task, FOCUS_DEFAULTS, at(0))
    await pauseSession(at(5))
    await resumeSession(at(6))
    const done = await finishIfDue(FOCUS_DEFAULTS, at(30))
    expect(done?.ended).toMatchObject({ kind: 'work', workedMs: 25 * MIN })
    expect(await db.outbox.count()).toBe(0)
    expect(await entries()).toEqual([])
  })
})
