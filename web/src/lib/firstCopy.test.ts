import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// OpenSpec change notes-compaction-at-scale D3: the first copy of the account
// asks the server to leave out note history, until its last page.
const syncCalls = vi.fn()
vi.mock('./api', async (orig) => ({
  FIRST_COPY_FEATURE: (await orig<typeof import('./api')>()).FIRST_COPY_FEATURE,
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

import { getMeta, setMeta, useDatabase } from './db'
import { resetDeviceId } from './ops'
import { FIRST_COPY_META, syncNow } from './sync'

let n = 0
beforeEach(() => {
  useDatabase(`first-copy-${Date.now()}-${n++}`)
  resetDeviceId()
  syncCalls.mockReset()
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const page = (cursor: number, hasMore: boolean) => async () => ({ applied: 0, ops: [], cursor, hasMore, serverTime: Date.now(), rejected: [] })
const firstCopyFlags = () => syncCalls.mock.calls.map((c) => c[6])

describe('first copy of the account', () => {
  it('asks for the latest note documents from cursor 0 to the last page, then never again', async () => {
    syncCalls.mockImplementationOnce(page(1000, true)).mockImplementationOnce(page(2000, true)).mockImplementationOnce(page(2500, false))
    await syncNow()
    expect(firstCopyFlags()).toEqual([true, true, true])
    expect(await getMeta<boolean>(FIRST_COPY_META, true)).toBe(false)
    syncCalls.mockImplementationOnce(page(2600, false))
    await syncNow()
    expect(firstCopyFlags()[3]).toBe(false)
  })

  it('continues an interrupted first copy after a reload', async () => {
    syncCalls.mockImplementationOnce(page(1000, true)).mockImplementationOnce(async () => {
      throw new Error('offline')
    })
    await syncNow().catch(() => undefined)
    expect(await getMeta<boolean>(FIRST_COPY_META, false)).toBe(true)
    syncCalls.mockImplementationOnce(page(2000, false))
    await syncNow()
    expect(firstCopyFlags()).toEqual([true, true, true])
    expect(await getMeta<boolean>(FIRST_COPY_META, true)).toBe(false)
  })

  it('does not ask on a device that already holds the account', async () => {
    await setMeta('cursor', 500)
    syncCalls.mockImplementationOnce(page(600, false))
    await syncNow()
    expect(firstCopyFlags()).toEqual([false])
  })
})
