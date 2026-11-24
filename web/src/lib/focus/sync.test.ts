import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../db'
import { applyOps, createTask, resetDeviceId } from '../ops'
import { setCurrentUserId } from '../sharing'
import { FOCUS_DEFAULTS } from './prefs'
import { finishIfDue, pauseSession, resumeSession, startSession, stopSession } from './session'
import { adoptRun, parseRun, readFocus, runRecord } from './state'
import { plannedEnd, remaining } from './timer'
import { focusPayload } from './shellPublish'
import { NO_FOCUS } from '../shell'

// One Focus session on every device (OpenSpec sync-focus-sessions, tasks 2.1 and
// 2.2): two devices, each its own database and device id, exchange their outbox
// as a sync would (the ops applied, then the engine's adoption of the record).

const T0 = new Date(2026, 10, 24, 10, 0).getTime()
const MIN = 60_000
const at = (m: number) => T0 + m * MIN
let n = 0
let names: Record<'A' | 'B', string> = { A: '', B: '' }
let report = ''
let anna = ''

async function on(device: 'A' | 'B'): Promise<void> {
  useDatabase(names[device])
  resetDeviceId()
  await setCurrentUserId('u1')
}

/** Delivers `from`'s outbox to `to` and runs the engine's adoption there; ends on `to`. */
async function sync(from: 'A' | 'B', to: 'A' | 'B'): Promise<void> {
  await on(from)
  const ops = (await db.outbox.toArray()).map(({ local: _l, ...op }) => op)
  await db.outbox.clear()
  await on(to)
  await applyOps(ops)
  await adoptRun((await db.userPrefs.get('me'))?.focus_run)
}

const runOps = async () => (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'focus_run')
const entry = (id: string | null | undefined) => db.timeEntries.get(id ?? '')

beforeEach(async () => {
  names = { A: `focus-sync-a-${Date.now()}-${n++}`, B: `focus-sync-b-${Date.now()}-${n++}` }
  await on('A')
  report = await createTask({ title: 'Write the report' })
  anna = await createTask({ title: 'Email Anna' })
  await sync('A', 'B')
  await on('A')
})

describe('one session on every device', () => {
  it('Started on the laptop, seen on the phone: the same run, counting from the stored times, with nothing written while it counts', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const started = await readFocus()
    await sync('A', 'B')
    const s = await readFocus()
    expect(s).toMatchObject({ taskId: report, phase: 'work', startedAt: at(0), resumedAt: at(0), plannedMs: 25 * MIN, entryId: started?.entryId, rev: started?.rev, remote: true })
    expect(remaining(s!, at(10))).toBe(15 * MIN)
    expect(await db.outbox.count()).toBe(0)
  })

  it('Ended on time: both devices derive the done state and neither writes the end', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const entryId = (await readFocus())?.entryId
    await sync('A', 'B')
    expect((await finishIfDue(FOCUS_DEFAULTS, at(25)))?.phase).toBe('done')
    expect(await runOps()).toEqual([])
    await on('A')
    await db.outbox.clear()
    expect((await finishIfDue(FOCUS_DEFAULTS, at(26)))?.ended).toMatchObject({ kind: 'work', at: at(25) })
    expect(await runOps()).toEqual([])
    expect((await entry(entryId))?.ended_at).toBe(at(25))
  })

  it('Paused on the phone: the laptop\'s entry ends at the pause, both show 13 minutes left, and a resume continues from there', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const entryId = (await readFocus())?.entryId
    await sync('A', 'B')
    await pauseSession(at(12))
    expect((await entry(entryId))?.ended_at).toBe(at(12))
    await sync('B', 'A')
    const paused = await readFocus()
    expect(paused).toMatchObject({ phase: 'work', resumedAt: null, accumulatedMs: 12 * MIN, entryId: null, remote: true })
    expect(remaining(paused!, at(30))).toBe(13 * MIN)
    expect((await entry(entryId))?.ended_at).toBe(at(12))
    await resumeSession(at(20))
    const resumed = await readFocus()
    expect(resumed?.remote).toBe(false)
    expect(plannedEnd(resumed!)).toBe(at(33))
    await sync('A', 'B')
    const s = await readFocus()
    expect(s).toMatchObject({ resumedAt: at(20), accumulatedMs: 12 * MIN, entryId: resumed?.entryId, remote: true })
    expect(plannedEnd(s!)).toBe(at(33))
  })

  it('Stopped on the phone: a Flowtime session started on the laptop ends with the time worked on both', async () => {
    const flow = { ...FOCUS_DEFAULTS, mode: 'flowtime' as const }
    await startSession(report, flow, at(0))
    const entryId = (await readFocus())?.entryId
    await sync('A', 'B')
    await stopSession(at(40))
    await sync('B', 'A')
    expect(await readFocus()).toMatchObject({ phase: 'done', ended: { kind: 'work', workedMs: 40 * MIN }, remote: true })
    expect((await entry(entryId))?.ended_at).toBe(at(40))
  })

  it('Two devices start offline: both converge on the later session as a whole, whichever syncs first', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    await on('B')
    await startSession(anna, { ...FOCUS_DEFAULTS, mode: 'flowtime' }, at(1))
    const later = await readFocus()
    await on('A')
    const a = (await db.outbox.toArray()).map(({ local: _l, ...op }) => op)
    await db.outbox.clear()
    await sync('B', 'A')
    await on('B')
    await applyOps(a)
    await adoptRun((await db.userPrefs.get('me'))?.focus_run)
    for (const device of ['A', 'B'] as const) {
      await on(device)
      expect(await readFocus()).toMatchObject({ taskId: anna, mode: 'flowtime', startedAt: at(1), plannedMs: null, rev: later?.rev })
    }
  })

  it('A record this device already held is not adopted again, and a record it cannot read is ignored', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const first = runRecord((await readFocus())!)
    await pauseSession(at(5))
    expect(await adoptRun(first)).toBeNull()
    expect((await readFocus())?.resumedAt).toBeNull()
    expect(await adoptRun('{"v":2,"rev":"x"}')).toBeNull()
    expect(await adoptRun('not json')).toBeNull()
    expect(parseRun(JSON.stringify({ ...JSON.parse(first), phase: 'sprint' }))).toBeNull()
    expect(parseRun(first)).toMatchObject({ taskId: report, phase: 'work' })
  })
})

describe('the owner rings (D4)', () => {
  it('a native shell is handed only a session this device owns', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    expect(focusPayload(await readFocus(), FOCUS_DEFAULTS).state).toBe('running')
    await sync('A', 'B')
    expect(focusPayload(await readFocus(), FOCUS_DEFAULTS)).toEqual(NO_FOCUS)
  })
})
