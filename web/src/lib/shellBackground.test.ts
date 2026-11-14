// @vitest-environment happy-dom
// A shell's background run says when it is done (OpenSpec change shell-reminders-on,
// native-shells "A background run ends when the app is done", design D4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { resetModuleState } from './moduleState'
import type { OpenTodoShell } from './shell'
import { BACKGROUND_LIMIT_MS, BACKGROUND_NO_SYNC_MS, backgroundSettled, startBackgroundRun, type BackgroundState } from './shellBackground'

const state = (over: Partial<BackgroundState> = {}): BackgroundState => ({ elapsed: 1000, sync: { state: 'idle', lastSyncedAt: 1 }, actionPending: false, outbox: 0, ...over })

describe('backgroundSettled', () => {
  it('is settled once sync finished with nothing left to send', () => {
    expect(backgroundSettled(state())).toBe(true)
    expect(backgroundSettled(state({ sync: { state: 'limited', lastSyncedAt: 1 } }))).toBe(true)
  })

  it('waits while sync runs, and while operations wait to be sent', () => {
    expect(backgroundSettled(state({ sync: { state: 'syncing', lastSyncedAt: null } }))).toBe(false)
    expect(backgroundSettled(state({ sync: { state: 'syncing', lastSyncedAt: 1 } }))).toBe(false)
    expect(backgroundSettled(state({ outbox: 2 }))).toBe(false)
  })

  it('does not wait for a sync that cannot run: offline or failing, the device keeps what it has', () => {
    expect(backgroundSettled(state({ sync: { state: 'offline', lastSyncedAt: null }, outbox: 3 }))).toBe(true)
    expect(backgroundSettled(state({ sync: { state: 'error', lastSyncedAt: 1 }, outbox: 3 }))).toBe(true)
  })

  it('gives a sync that never starts (signed out, a login wall) ten seconds', () => {
    const never = { state: 'idle', lastSyncedAt: null }
    expect(backgroundSettled(state({ sync: never, elapsed: BACKGROUND_NO_SYNC_MS - 1 }))).toBe(false)
    expect(backgroundSettled(state({ sync: never, elapsed: BACKGROUND_NO_SYNC_MS }))).toBe(true)
  })

  it('waits for a notification action to be stored, whatever sync says', () => {
    expect(backgroundSettled(state({ actionPending: true }))).toBe(false)
    expect(backgroundSettled(state({ actionPending: true, sync: { state: 'offline', lastSyncedAt: null } }))).toBe(false)
  })

  it('stops waiting at the limit', () => {
    expect(backgroundSettled(state({ elapsed: BACKGROUND_LIMIT_MS, actionPending: true, sync: { state: 'syncing', lastSyncedAt: null }, outbox: 9 }))).toBe(true)
  })
})

describe('startBackgroundRun', () => {
  let done: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    await db.delete()
    await db.open()
    resetModuleState()
    done = vi.fn()
    window.opentodoShell = { bridge: 1, platform: 'android', app: '1.6.0', capabilities: ['reminders', 'widgets', 'background'], backgroundDone: done } as unknown as OpenTodoShell
  })
  afterEach(() => { delete window.opentodoShell })

  /** A clock the run's own sleeps advance, so no test waits for real time. */
  const clock = () => {
    let t = 0
    return { now: () => t, sleep: async (ms: number) => { t += ms }, at: () => t }
  }

  it('tells the shell after the wait for a sync that never started, not at the limit', async () => {
    const c = clock()
    await startBackgroundRun({ ...c, search: '' })
    expect(done).toHaveBeenCalledTimes(1)
    expect(c.at()).toBeGreaterThanOrEqual(BACKGROUND_NO_SYNC_MS)
    expect(c.at()).toBeLessThan(BACKGROUND_LIMIT_MS)
  })

  it('waits for the action of the address it was opened at, up to the limit', async () => {
    const c = clock()
    await startBackgroundRun({ ...c, search: '?reminder=r1&action=done' })
    expect(done).toHaveBeenCalledTimes(1)
    expect(c.at()).toBeGreaterThanOrEqual(BACKGROUND_LIMIT_MS)
  })

  it('runs once per page', async () => {
    const c = clock()
    await Promise.all([startBackgroundRun({ ...c, search: '' }), startBackgroundRun({ ...c, search: '' })])
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('calls nothing in a shell that does not list the capability', async () => {
    window.opentodoShell = { bridge: 1, platform: 'android', app: '1.4.0', capabilities: ['reminders'], backgroundDone: done } as unknown as OpenTodoShell
    await startBackgroundRun({ ...clock(), search: '' })
    expect(done).not.toHaveBeenCalled()
  })
})
