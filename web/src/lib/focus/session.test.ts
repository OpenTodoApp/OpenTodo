import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { setCurrentUserId } from '../sharing'
import { FOCUS_DEFAULTS, type FocusPrefs } from './prefs'
import { breakSession, canExtend, extendSession, finishIfDue, resumeLeft, startFocus, startSession } from './session'
import { readFocus } from './state'

// Start focus and extending a session (OpenSpec focus-everywhere, tasks 2.1 and
// 3.1): the four paths of startFocus, Undo of a left session, and "+5 min".

const T0 = new Date(2026, 9, 20, 9, 0).getTime()
const MIN = 60_000
const at = (m: number) => T0 + m * MIN
let n = 0
let report = ''
let anna = ''
beforeEach(async () => {
  useDatabase(`focus-session-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
  report = await createTask({ title: 'Write the report' })
  anna = await createTask({ title: 'Email Anna' })
  await db.outbox.clear()
})

const entries = async () => (await db.timeEntries.toArray()).filter((e) => !e.deleted_at).sort((a, b) => a.started_at - b.started_at)
const countdown: FocusPrefs = { ...FOCUS_DEFAULTS, mode: 'countdown' }

describe('startFocus', () => {
  it('Start: no session runs, so a Pomodoro work session starts on the task with a running entry', async () => {
    const r = await startFocus(report, FOCUS_DEFAULTS, { now: at(0) })
    expect(r).toMatchObject({ kind: 'started', left: null })
    const s = await readFocus()
    expect(s).toMatchObject({ taskId: report, phase: 'work', plannedMs: 25 * MIN })
    expect(s?.entryId).toBeTruthy()
    expect((await entries()).map((e) => e.task_id)).toEqual([report])
  })

  it('Already running here: nothing changes, the timer and the entry stay', async () => {
    await startFocus(report, FOCUS_DEFAULTS, { now: at(0) })
    const before = await readFocus()
    expect(await startFocus(report, FOCUS_DEFAULTS, { now: at(3) })).toEqual({ kind: 'here' })
    expect(await readFocus()).toEqual(before)
    expect(await entries()).toHaveLength(1)
  })

  it('Countdown asks first: nothing starts until a length is given, then it starts with that length', async () => {
    expect(await startFocus(report, countdown, { now: at(0) })).toEqual({ kind: 'ask' })
    expect(await readFocus()).toBeNull()
    const r = await startFocus(report, countdown, { now: at(0), lengthMinutes: 40 })
    expect(r.kind).toBe('started')
    expect(await readFocus()).toMatchObject({ phase: 'work', plannedMs: 40 * MIN, lengthMinutes: 40 })
  })

  it('Switching from another task: its entry stops, the new session starts, and Undo brings it back with a new running entry', async () => {
    await startFocus(anna, FOCUS_DEFAULTS, { now: at(0) })
    const r = await startFocus(report, FOCUS_DEFAULTS, { now: at(10) })
    if (r.kind !== 'started') throw new Error('not started')
    expect(r.left).toMatchObject({ taskId: anna, running: true })
    expect(r.left?.state.accumulatedMs).toBe(10 * MIN)
    let list = await entries()
    expect(list.map((e) => [e.task_id, e.started_at, e.ended_at])).toEqual([[anna, at(0), at(10)], [report, at(10), null]])
    const back = await resumeLeft(r.left!, at(12))
    expect(back).toMatchObject({ taskId: anna, phase: 'work', resumedAt: at(12), accumulatedMs: 10 * MIN })
    list = await entries()
    expect(list.map((e) => [e.task_id, e.started_at, e.ended_at])).toEqual([[anna, at(0), at(10)], [report, at(10), at(12)], [anna, at(12), null]])
    // The left session keeps its time: 15 minutes left at 9:12, so it ends at 9:27.
    expect(await finishIfDue(FOCUS_DEFAULTS, at(27))).toMatchObject({ phase: 'done' })
  })

  it('works offline: the only writes are the entry ops in the outbox', async () => {
    await startFocus(report, FOCUS_DEFAULTS, { now: at(0) })
    const ops = await db.outbox.toArray()
    expect(ops.length).toBeGreaterThan(0)
    expect(new Set(ops.map((o) => o.entity))).toEqual(new Set(['time_entry']))
  })
})

describe('extend a finished session', () => {
  it('Five more minutes: same task and cycle, a new entry from now, and the break offered after it is still the short one', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    await finishIfDue(FOCUS_DEFAULTS, at(25))
    await breakSession(FOCUS_DEFAULTS, at(25))
    await finishIfDue(FOCUS_DEFAULTS, at(30))
    await startSession(report, FOCUS_DEFAULTS, at(30))
    await finishIfDue(FOCUS_DEFAULTS, at(55))
    const done = await readFocus()
    expect(done).toMatchObject({ phase: 'done', cycle: 2 })
    expect(canExtend(done, at(56))).toBe(true)
    const next = await extendSession(5, at(56))
    expect(next).toMatchObject({ phase: 'work', taskId: report, cycle: 2, plannedMs: 5 * MIN, startedAt: at(56) })
    const list = await entries()
    expect(list.map((e) => [e.started_at, e.ended_at])).toEqual([[at(0), at(25)], [at(30), at(55)], [at(56), null]])
    const end = await finishIfDue(FOCUS_DEFAULTS, at(61))
    expect(end).toMatchObject({ phase: 'done', cycle: 2, ended: { kind: 'work', nextBreak: 'short' } })
  })

  it('Gone after ten minutes, after a break, and on Flowtime', async () => {
    await startSession(report, countdown, at(0), 20)
    await finishIfDue(countdown, at(20))
    expect(canExtend(await readFocus(), at(29))).toBe(true)
    expect(canExtend(await readFocus(), at(31))).toBe(false)
    expect(await extendSession(5, at(31))).toBeNull()
    await breakSession(countdown, at(31))
    expect(canExtend(await readFocus(), at(31))).toBe(false)
    const flow: FocusPrefs = { ...FOCUS_DEFAULTS, mode: 'flowtime' }
    const s = await startSession(report, flow, at(40))
    expect(canExtend({ ...s, phase: 'done', ended: { kind: 'work', workedMs: MIN, at: at(41), runStartedAt: s.startedAt } }, at(42))).toBe(false)
  })

  it('Automatic break cancelled: "+15 min" over the break that started on its own runs work for 15 minutes', async () => {
    const auto: FocusPrefs = { ...FOCUS_DEFAULTS, autoStartBreaks: true }
    await startSession(report, auto, at(0))
    const b = await finishIfDue(auto, at(25))
    expect(b).toMatchObject({ phase: 'break', ended: { kind: 'work', auto: true } })
    expect(canExtend(b, at(26))).toBe(true)
    const next = await extendSession(15, at(26))
    expect(next).toMatchObject({ phase: 'work', plannedMs: 15 * MIN, breakKind: null, cycle: 1 })
    // A break the user started is not extended.
    await breakSession(auto, at(30))
    expect(canExtend(await readFocus(), at(30))).toBe(false)
  })
})
