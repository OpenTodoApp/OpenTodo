// @vitest-environment happy-dom
// The Focus session handed to a native shell (OpenSpec change focus-live-activity,
// task 1.2): the payload per state, the title rule, one publication per
// transition, and none at sign-out before the local data goes.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, setMeta, useDatabase } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { resetModuleState } from '../moduleState'
import { setCurrentUserId } from '../sharing'
import type { ShellFocus } from '../shell'
import { flush, waitFor } from '../../ui/test-utils'
import { FOCUS_DEFAULTS, type FocusPrefs } from './prefs'
import { breakSession, pauseSession, resumeSession, startSession } from './session'
import { focusPayload, startFocusPublisher } from './shellPublish'
import { idleState, start, pause, finish } from './timer'

const T0 = Date.UTC(2026, 9, 20, 9, 0)
const MIN = 60_000
let n = 0
let task = ''
let sent: ShellFocus[] = []

/** Waits for the `count`th publication; a later exact check of the list catches extra ones. */
const settle = (count: number) => waitFor(() => sent.length >= count, `publication ${count}`)

beforeEach(async () => {
  useDatabase(`focus-shell-${Date.now()}-${n++}`)
  resetDeviceId()
  resetModuleState()
  await setCurrentUserId('u1')
  task = await createTask({ title: 'Write the report' })
  sent = []
  window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.7.0', capabilities: ['focus'], publishFocus: (json) => void sent.push(JSON.parse(json)) }
})
afterEach(() => {
  delete window.opentodoShell
})

const pomodoro: FocusPrefs = { ...FOCUS_DEFAULTS, mode: 'pomodoro' }

describe('focusPayload', () => {
  it('a running Pomodoro: cycle, planned end and since when it runs', () => {
    const s = start(idleState('t', 'pomodoro', T0), T0, pomodoro)
    expect(focusPayload(s, pomodoro, 'Write')).toEqual({
      v: 1, state: 'running', taskId: 't', title: 'Write', mode: 'pomodoro', phase: 'work', cycle: 1, cycleLength: 4,
      phaseStartedAt: T0, runningSince: T0, elapsedMs: 0, plannedEndAt: T0 + 25 * MIN, plannedMs: 25 * MIN,
    })
  })

  it('paused: no planned end, no running since, the time so far', () => {
    const s = pause(start(idleState('t', 'pomodoro', T0), T0, pomodoro), T0 + 10 * MIN)
    const p = focusPayload(s, pomodoro)
    expect(p).toMatchObject({ state: 'paused', elapsedMs: 10 * MIN, plannedMs: 25 * MIN })
    expect(p.plannedEndAt).toBeUndefined()
    expect(p.runningSince).toBeUndefined()
    expect(p.title).toBeUndefined()
  })

  it('Flowtime has no planned end and no cycle', () => {
    const flow = { ...FOCUS_DEFAULTS, mode: 'flowtime' as const }
    const p = focusPayload(start(idleState('t', 'flowtime', T0), T0, flow), flow)
    expect(p).toMatchObject({ state: 'running', mode: 'flowtime', phase: 'work' })
    expect(p.plannedEndAt).toBeUndefined()
    expect(p.cycle).toBeUndefined()
  })

  it('a break, the done state, and nothing stored', () => {
    const work = start(idleState('t', 'pomodoro', T0), T0, pomodoro)
    const auto = finish(work, { ...pomodoro, autoStartBreaks: true })
    expect(focusPayload(auto, pomodoro)).toMatchObject({ state: 'running', phase: 'break', breakKind: 'short', plannedEndAt: T0 + 30 * MIN })
    const done = finish(work, pomodoro)
    const p = focusPayload(done, pomodoro)
    expect(p).toMatchObject({ state: 'done', phase: 'work' })
    expect(p.plannedEndAt).toBeUndefined()
    expect(focusPayload(null, pomodoro)).toEqual({ v: 1, state: 'none' })
    expect(focusPayload(idleState('t', 'pomodoro', T0), pomodoro)).toEqual({ v: 1, state: 'none' })
  })
})

describe('startFocusPublisher', () => {
  it('publishes the stored state at start, then once per transition, with the title', async () => {
    const stop = startFocusPublisher()
    await settle(1)
    expect(sent).toEqual([{ v: 1, state: 'none' }])
    const t = Date.now()
    await startSession(task, pomodoro, t)
    await settle(2)
    await pauseSession(t + MIN)
    await settle(3)
    await resumeSession(t + 2 * MIN)
    await settle(4)
    await breakSession(pomodoro, t + 3 * MIN)
    await settle(5)
    await breakSession(pomodoro, t + 8 * MIN)
    await settle(6)
    expect(sent.map((p) => `${p.state}:${p.phase ?? ''}`)).toEqual(['none:', 'running:work', 'paused:work', 'running:work', 'running:break', 'done:break'])
    expect(sent[1].title).toBe('Write the report')
    // An unrelated write publishes nothing: the next publication is the next transition's.
    await createTask({ title: 'Something else' })
    await startSession(task, pomodoro, t + 9 * MIN)
    await settle(7)
    await flush()
    expect(sent.map((p) => p.state)).toEqual(['none', 'running', 'paused', 'running', 'running', 'done', 'running'])
    stop()
  })

  it('no title with the device\'s titles option off', async () => {
    await setMeta('push:includeContent', false)
    const stop = startFocusPublisher()
    await startSession(task, pomodoro, Date.now())
    await waitFor(() => sent.at(-1)?.state === 'running', 'the running session')
    expect(sent.at(-1)?.title).toBeUndefined()
    stop()
  })

  it('a reload hands the stored state over again, even unchanged', async () => {
    await startSession(task, pomodoro, Date.now())
    let stop = startFocusPublisher()
    await settle(1)
    stop()
    resetModuleState()
    stop = startFocusPublisher()
    await settle(2)
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    stop()
  })

  it('sign-out publishes none before the local data goes', async () => {
    await startSession(task, pomodoro, Date.now())
    const stop = startFocusPublisher()
    await settle(1)
    const before = sent.length
    const clearing = clearLocalData()
    // Handed over synchronously, before the transaction that empties the tables.
    expect(sent.slice(before)).toEqual([{ v: 1, state: 'none' }])
    await clearing
    stop()
  })

  it('a shell without focus is handed nothing', async () => {
    window.opentodoShell = { bridge: 1, platform: 'ios', app: '1.7.0', capabilities: ['reminders'], publishFocus: (json) => void sent.push(JSON.parse(json)) }
    const stop = startFocusPublisher()
    await startSession(task, pomodoro, Date.now())
    await flush()
    expect(sent).toEqual([])
    stop()
  })
})
