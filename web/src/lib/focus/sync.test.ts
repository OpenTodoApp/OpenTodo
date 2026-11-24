import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../db'
import { hlcSeedOffset, serverNow } from '../hlc'
import { applyOps, createTask, getDeviceId, mutate, resetDeviceId } from '../ops'
import { setCurrentUserId } from '../sharing'
import { FOCUS_DEFAULTS } from './prefs'
import { adoptSession, breakSession, finishIfDue, pauseSession, resumeSession, startSession, stopSession } from './session'
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
/** Each device's correction to server time (its clock's error, reversed). */
let offsets: Record<'A' | 'B', number> = { A: 0, B: 0 }

async function on(device: 'A' | 'B'): Promise<void> {
  useDatabase(names[device])
  resetDeviceId()
  await setCurrentUserId('u1')
  await getDeviceId()
  hlcSeedOffset(offsets[device])
}

/** Takes `from`'s outbox (only the ops `keep` keeps) and ends on `to` with them applied, as a pull would, before any adoption. */
async function pull(from: 'A' | 'B', to: 'A' | 'B', keep: (field: string) => boolean = () => true): Promise<void> {
  await on(from)
  const ops = (await db.outbox.toArray()).map(({ local: _l, ...op }) => op).filter((o) => keep(o.field))
  await db.outbox.clear()
  await on(to)
  await applyOps(ops)
}

/** A pull and then the engine's adoption there; ends on `to`. */
async function sync(from: 'A' | 'B', to: 'A' | 'B', keep?: (field: string) => boolean): Promise<void> {
  await pull(from, to, keep)
  await adoptSession()
}

const storedRev = async () => parseRun((await db.userPrefs.get('me'))?.focus_run)?.rev

const runOps = async () => (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'focus_run')
const entry = (id: string | null | undefined) => db.timeEntries.get(id ?? '')

afterEach(() => {
  vi.useRealTimers()
  hlcSeedOffset(0)
})

beforeEach(async () => {
  offsets = { A: 0, B: 0 }
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
    await adoptSession()
    for (const device of ['A', 'B'] as const) {
      await on(device)
      expect(await readFocus()).toMatchObject({ taskId: anna, mode: 'flowtime', startedAt: at(1), plannedMs: null, rev: later?.rev })
    }
  })

  it('The device\'s own record is not adopted, and a record it cannot read is ignored and kept', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const first = runRecord((await readFocus())!)
    await pauseSession(at(5))
    expect(await adoptRun()).toBeNull()
    expect((await readFocus())?.resumedAt).toBeNull()
    for (const junk of ['{"v":2,"rev":"x"}', 'not json', JSON.stringify({ ...JSON.parse(first), phase: 'sprint' })]) {
      await mutate('user_prefs', 'me', { focus_run: junk })
      expect(await adoptRun()).toBeNull()
      expect((await db.userPrefs.get('me'))?.focus_run).toBe(junk)
    }
    expect(parseRun(first)).toMatchObject({ taskId: report, phase: 'work' })
  })

  it('A remote session arriving while this device writes: the row always ends on the stored record (no lost publish)', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    await sync('A', 'B')
    await startSession(anna, FOCUS_DEFAULTS, at(3))
    const remote = (await db.outbox.toArray()).map(({ local: _l, ...op }) => op)
    await db.outbox.clear()
    for (const order of [0, 1]) {
      await on('A')
      const write = () => (order ? pauseSession(at(5)) : resumeSession(at(6)))
      await Promise.all([write(), applyOps(remote).then(() => adoptSession())])
      await adoptSession()
      const row = await readFocus()
      expect(row?.rev).toBe(await storedRev())
    }
  })

  it('Pause on the phone before the entry reached it: the laptop ends its entry at the pause when it adopts', async () => {
    await startSession(report, FOCUS_DEFAULTS, at(0))
    const entryId = (await readFocus())?.entryId
    await sync('A', 'B', (f) => f === 'focus_run')
    expect(await entry(entryId)).toBeUndefined()
    await pauseSession(at(12))
    await sync('B', 'A')
    expect(await readFocus()).toMatchObject({ resumedAt: null, accumulatedMs: 12 * MIN, remote: true })
    expect((await entry(entryId))?.ended_at).toBe(at(12))
  })

  it('A laptop that slept never writes its auto-started session over the phone\'s newer one: it stops nothing new and adopts', async () => {
    const auto = { ...FOCUS_DEFAULTS, autoStartWork: true }
    await startSession(report, auto, at(0))
    await finishIfDue(auto, at(25))
    await breakSession(auto, at(25))
    await sync('A', 'B')
    await startSession(anna, FOCUS_DEFAULTS, at(27))
    const phone = await readFocus()
    await pull('B', 'A')
    await db.outbox.clear()
    const before = await db.timeEntries.count()
    await finishIfDue(auto, at(40))
    expect(await readFocus()).toMatchObject({ taskId: anna, rev: phone?.rev, remote: true })
    expect(await runOps()).toEqual([])
    expect(await db.timeEntries.count()).toBe(before)
  })

  it.each([3, -3])('Clock %i minutes off on the phone: both devices read the same time left, and its pause counts true minutes', async (minutes) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const error = minutes * MIN
    offsets.B = -error
    vi.setSystemTime(at(0))
    await on('A')
    await startSession(report, FOCUS_DEFAULTS)
    await sync('A', 'B')
    vi.setSystemTime(at(10) + error)
    expect(serverNow()).toBe(at(10))
    expect(remaining((await readFocus())!, serverNow())).toBe(15 * MIN)
    await pauseSession()
    vi.setSystemTime(at(11))
    await sync('B', 'A')
    expect(await readFocus()).toMatchObject({ accumulatedMs: 10 * MIN, resumedAt: null })
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
