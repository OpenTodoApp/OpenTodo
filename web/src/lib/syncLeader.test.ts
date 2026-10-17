// One tab syncs (OpenSpec change client-sync-robustness): of the tabs of one
// browser, only the one holding the Web Lock runs the sync loop; the others ask
// it over a BroadcastChannel, and the lock passes on when the leader stops.
// Each "tab" is a fresh copy of the modules sharing one IndexedDB, one lock
// manager and one BroadcastChannel name, as tabs do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Sync = typeof import('./sync')

/** A minimal exclusive Web Locks manager: FIFO, with abortable requests. */
class FakeLocks {
  private queue: { cb: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = []
  private held = false
  request(_name: string, a: unknown, b?: unknown): Promise<unknown> {
    const cb = (typeof a === 'function' ? a : b) as () => Promise<unknown>
    const signal = typeof a === 'function' ? undefined : (a as { signal?: AbortSignal }).signal
    return new Promise((resolve, reject) => {
      const entry = { cb, resolve, reject }
      signal?.addEventListener('abort', () => {
        const i = this.queue.indexOf(entry)
        if (i >= 0) {
          this.queue.splice(i, 1)
          reject(new DOMException('aborted', 'AbortError'))
        }
      })
      this.queue.push(entry)
      this.pump()
    })
  }
  private pump() {
    if (this.held) return
    const e = this.queue.shift()
    if (!e) return
    this.held = true
    void Promise.resolve().then(() => e.cb()).then(
      (v) => { this.held = false; e.resolve(v); this.pump() },
      (err) => { this.held = false; e.reject(err); this.pump() },
    )
  }
}

const syncRequests = { count: 0 }

async function tab(): Promise<Sync> {
  vi.resetModules()
  return import('./sync')
}

async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const tabs: Sync[] = []

beforeEach(() => {
  syncRequests.count = 0
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('navigator', { onLine: true, locks: new FakeLocks() })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/v1/sync') {
      syncRequests.count++
      return new Response(JSON.stringify({ applied: 0, ops: [], cursor: syncRequests.count, hasMore: false, serverTime: Date.now() }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }))
})

afterEach(() => {
  for (const s of tabs.splice(0)) s.stopSync()
  vi.unstubAllGlobals()
})

describe('one tab syncs', () => {
  it('the second tab follows, asks the leader to sync, and takes over when it stops', async () => {
    const a = await tab()
    tabs.push(a)
    a.startSync()
    await until(() => a.isSyncLeader() && syncRequests.count >= 1, 'tab A to lead and sync')
    const b = await tab()
    tabs.push(b)
    b.startSync()
    await new Promise((r) => setTimeout(r, 50))
    expect(b.isSyncLeader()).toBe(false)

    // B's "sync now" runs on A and resolves once A is done.
    const before = syncRequests.count
    await b.syncNow()
    expect(syncRequests.count).toBeGreaterThan(before)
    // B shows the status A broadcasts.
    await until(() => b.syncSnapshot().state === 'idle' && b.syncSnapshot().lastSyncedAt !== null, 'the leader status in B')

    // A stops (its tab closes or signs out): B takes the lock and syncs itself.
    a.stopSync()
    await until(() => b.isSyncLeader(), 'tab B to lead')
    const now = syncRequests.count
    await b.syncNow()
    expect(syncRequests.count).toBeGreaterThan(now)
  })

  it('a sign-out in one tab reaches the others, and the clear waits for the sync lock', async () => {
    const a = await tab()
    tabs.push(a)
    a.startSync()
    await until(() => a.isSyncLeader(), 'tab A to lead')
    const b = await tab()
    tabs.push(b)
    b.startSync()
    const heard = vi.fn(() => a.stopSync())
    a.onSignOutElsewhere(heard)
    b.announceSignOut()
    await until(() => heard.mock.calls.length === 1, 'tab A to hear the sign-out')
    // B clears as App's clearDeviceData does: stop here, then inside the lock,
    // which it gets only after A released it.
    await b.stopSyncAndWait()
    let cleared = false
    await b.withSyncLock(async () => { cleared = true })
    expect(cleared).toBe(true)
    expect(a.isSyncLeader()).toBe(false)
  })

  it('without Web Locks every tab syncs on its own', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const a = await tab()
    tabs.push(a)
    a.startSync()
    expect(a.isSyncLeader()).toBe(true)
  })
})
