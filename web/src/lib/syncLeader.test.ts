// One tab syncs (OpenSpec change client-sync-robustness): of the tabs of one
// browser, only the one holding the Web Lock runs the sync loop; the others ask
// it over a BroadcastChannel, and the lock passes on when the leader stops.
// Each "tab" is a fresh copy of the modules sharing one IndexedDB, one lock
// manager and one BroadcastChannel name, as tabs do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor as until } from '../ui/test-utils'

type Sync = typeof import('./sync')

/** A minimal exclusive Web Locks manager: FIFO, with abortable requests and `steal`. */
class FakeLocks {
  private queue: { cb: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = []
  private holder: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null
  request(_name: string, a: unknown, b?: unknown): Promise<unknown> {
    const cb = (typeof a === 'function' ? a : b) as () => Promise<unknown>
    const opts = (typeof a === 'function' ? {} : a) as { signal?: AbortSignal; steal?: boolean }
    return new Promise((resolve, reject) => {
      const entry = { cb, resolve, reject }
      opts.signal?.addEventListener('abort', () => {
        const i = this.queue.indexOf(entry)
        if (i >= 0) {
          this.queue.splice(i, 1)
          reject(new DOMException('aborted', 'AbortError'))
        }
      })
      if (opts.steal && this.holder) {
        // The holder loses the lock at once and its request rejects, as in the browser.
        this.holder.reject(new DOMException('stolen', 'AbortError'))
        this.holder = null
        this.queue.unshift(entry)
      } else this.queue.push(entry)
      this.pump()
    })
  }
  private pump() {
    if (this.holder) return
    const e = this.queue.shift()
    if (!e) return
    const mine = { resolve: e.resolve, reject: e.reject }
    this.holder = mine
    void Promise.resolve().then(() => e.cb()).then(
      (v) => { if (this.holder === mine) { this.holder = null; e.resolve(v); this.pump() } },
      (err) => { if (this.holder === mine) { this.holder = null; e.reject(err); this.pump() } },
    )
  }
}

const syncRequests = { count: 0 }

async function tab(): Promise<Sync> {
  vi.resetModules()
  return import('./sync')
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

    // B's "sync now" runs on A and resolves once A is done.
    const before = syncRequests.count
    await b.syncNow()
    expect(syncRequests.count).toBeGreaterThan(before)
    // B shows the status A broadcasts.
    await until(() => b.syncSnapshot().state === 'idle' && b.syncSnapshot().lastSyncedAt !== null, 'the leader status in B')
    // B settled as a follower while A leads.
    expect(b.isSyncLeader()).toBe(false)

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

  // sync-leader-takeover D1, D2: a holder that never answers (a frozen tab) does not stop the browser's sync.
  it('a follower takes the lock from a silent holder and syncs, and a stolen leader steps down', async () => {
    // A client that took the lock and went quiet: no channel, never releases it.
    void navigator.locks.request('opentodo-sync', () => new Promise(() => {})).catch(() => undefined)
    const b = await tab()
    tabs.push(b)
    Object.assign(b.LEADER_PROBE, { everyMs: 30, waitMs: 20, misses: 2 })
    b.startSync()
    await until(() => b.isSyncLeader() && syncRequests.count >= 1, 'tab B to take over and sync')
    // A tab that answers keeps the lead: C follows B, and B is not displaced.
    const c = await tab()
    tabs.push(c)
    Object.assign(c.LEADER_PROBE, { everyMs: 30, waitMs: 200, misses: 2 })
    const watch = new BroadcastChannel('opentodo-sync')
    let pongs = 0
    watch.onmessage = (e: MessageEvent<{ type?: string }>) => { if (e.data?.type === 'pong') pongs++ }
    c.startSync()
    await until(() => pongs >= 3, 'B to answer three of C\'s checks')
    watch.close()
    expect(b.isSyncLeader()).toBe(true)
    expect(c.isSyncLeader()).toBe(false)
    // Another silent client steals the lock from B: B steps down, and one working tab leads again.
    void (navigator.locks.request as (n: string, o: object, f: () => Promise<void>) => Promise<void>)('opentodo-sync', { steal: true }, () => new Promise(() => {})).catch(() => undefined)
    await until(() => !b.isSyncLeader(), 'B to step down')
    await until(() => b.isSyncLeader() !== c.isSyncLeader(), 'exactly one working tab to lead again', 5_000)
  })

  it('without Web Locks every tab syncs on its own', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const a = await tab()
    tabs.push(a)
    a.startSync()
    expect(a.isSyncLeader()).toBe(true)
  })
})
