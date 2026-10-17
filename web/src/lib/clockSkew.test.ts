import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// OpenSpec change sync-convergence: clock_skew refusals and confirmed backfill pages.
const syncCalls = vi.fn()
vi.mock('./api', () => ({
  api: {
    sync: (...args: unknown[]) => syncCalls(...args),
    calendarEvents: async () => ({ events: [], subscriptions: [] }),
    listNotifications: async () => ({ notifications: [], unread: 0 }),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  },
}))

import { db, getMeta, useDatabase } from './db'
import { MAX_FUTURE_SKEW_MS, hlcClockRefused, hlcLast, hlcNow, hlcObserveServerTime, hlcReset, hlcSeed } from './hlc'
import { mutate, resetDeviceId } from './ops'
import { syncNow, syncSnapshot } from './sync'
import type { Op } from './types'

const HOUR = 3_600_000
const SERVER = 1_800_000_000_000

let n = 0
beforeEach(() => {
  useDatabase(`skew-${Date.now()}-${n++}`)
  resetDeviceId()
  hlcReset()
  syncCalls.mockReset()
  vi.stubGlobal('navigator', { onLine: true })
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('hlc', () => {
  it('follows a large skew and drops the offset once the clock is right again', () => {
    vi.setSystemTime(SERVER + HOUR)
    hlcObserveServerTime(SERVER)
    expect(hlcNow()).toBe(SERVER)
    // The system clock was fixed: within the tolerance the offset goes back to zero.
    vi.setSystemTime(SERVER + 10_000)
    hlcObserveServerTime(SERVER + 10_500)
    expect(hlcNow()).toBe(SERVER + 10_000)
  })

  it('brings a seed far ahead of the server back to server time', () => {
    vi.setSystemTime(SERVER)
    hlcSeed(SERVER + HOUR)
    hlcObserveServerTime(SERVER)
    expect(hlcLast()).toBe(SERVER)
    expect(hlcNow()).toBe(SERVER + 1)
    // A seed within the accepted window is kept, so timestamps stay increasing.
    hlcSeed(SERVER + MAX_FUTURE_SKEW_MS - 1)
    hlcObserveServerTime(SERVER)
    expect(hlcNow()).toBe(SERVER + MAX_FUTURE_SKEW_MS)
  })

  it('restarts from server time after a clock_skew refusal', () => {
    vi.setSystemTime(SERVER + HOUR)
    hlcNow()
    hlcClockRefused(SERVER)
    const ts = hlcNow()
    expect(ts).toBeGreaterThan(SERVER)
    expect(ts).toBeLessThanOrEqual(SERVER + MAX_FUTURE_SKEW_MS)
  })
})

describe('sync with a fast clock', () => {
  /** A server whose clock reads SERVER and refuses ops stamped too far ahead. */
  const stored: Op[] = []
  function server(extra: Record<string, unknown> = {}) {
    return async (_device: string, _cursor: number, ops: Op[]) => {
      const rejected = []
      for (const o of ops) {
        if (o.ts > SERVER + MAX_FUTURE_SKEW_MS) rejected.push({ id: o.id, reason: 'clock_skew', serverTime: SERVER })
        else stored.push(o)
      }
      return { applied: ops.length - rejected.length, ops: [], cursor: 1, hasMore: false, serverTime: SERVER, rejected, ...extra }
    }
  }

  it('stamps refused ops again, re-sends them and keeps the edit', async () => {
    stored.length = 0
    vi.setSystemTime(SERVER + HOUR)
    await mutate('task', 't1', { title: 'Written with a fast clock' })
    syncCalls.mockImplementation(server())
    await syncNow()

    expect(syncCalls).toHaveBeenCalledTimes(2)
    const [first, second] = syncCalls.mock.calls.map((c) => c[2] as Op[])
    expect(first.every((o) => o.ts > SERVER + HOUR - 1000)).toBe(true)
    // The same ops (same ids) went out again with a timestamp the server accepts.
    expect(second.map((o) => o.id).sort()).toEqual(first.map((o) => o.id).sort())
    expect(second.every((o) => o.ts > SERVER && o.ts <= SERVER + MAX_FUTURE_SKEW_MS)).toBe(true)
    expect(new Set(second.map((o) => o.ts)).size).toBe(1)
    expect(stored.map((o) => o.id).sort()).toEqual(first.map((o) => o.id).sort())

    // Nothing was dropped: the row keeps the edit, its clock follows the new stamp.
    const row = await db.tasks.get('t1')
    expect(row?.title).toBe('Written with a fast clock')
    expect(row?._clock.title.ts).toBe(second[0].ts)
    expect(await db.outbox.count()).toBe(0)
    expect(syncSnapshot().rejected).toBeNull()
    expect(await getMeta<number>('hlc', 0)).toBe(second[0].ts)
    // The request announces the protocol additions.
    expect(syncCalls.mock.calls[0]).toHaveLength(6)
  })

  it('confirms a backfill page with the next exchange', async () => {
    syncCalls.mockImplementationOnce(async () => ({ applied: 0, ops: [], cursor: 1, hasMore: true, serverTime: Date.now(), backfillSeq: 42 }))
    syncCalls.mockImplementationOnce(async () => ({ applied: 0, ops: [], cursor: 1, hasMore: false, serverTime: Date.now() }))
    await syncNow()
    expect(syncCalls.mock.calls[0][4]).toBe(0)
    expect(syncCalls.mock.calls[1][4]).toBe(42)
    expect(await getMeta<number>('backfillAck', -1)).toBe(0)
  })
})
