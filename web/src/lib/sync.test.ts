import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The sync loop talks to the server only through `api`; stub it so each test
// controls the cursor the server reports.
const serverCursor = { value: 5 }
const syncCalls = vi.fn(async () => ({ applied: 0, ops: [], cursor: serverCursor.value, hasMore: false, serverTime: Date.now() }))
// In-app notifications (task-assignment): the server's list and read calls.
const serverNotifications = { value: [] as Record<string, unknown>[] }
const listNotifications = vi.fn(async () => ({ notifications: serverNotifications.value, unread: 0 }))
const readNotification = vi.fn(async (id: string) => {
  serverNotifications.value = serverNotifications.value.map((n) => (n.id === id ? { ...n, readAt: 99 } : n))
})
vi.mock('./api', () => ({
  api: {
    sync: (...args: unknown[]) => syncCalls(...(args as [])),
    listNotifications: () => listNotifications(),
    readNotification: (id: string) => readNotification(id),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message)
    }
  },
}))

import { db, getMeta, setMeta } from './db'
import { useDatabase } from './db'
import { applyOps, mutate, resetDeviceId } from './ops'
import { ApiError } from './api'
import { markTaskNotificationsRead, unreadCount, unreadNotifications } from './notifications'
import { describeRejected } from './sharing'
import { dismissRejected, startSync, stopSync, syncNow, syncSnapshot } from './sync'

/** Minimal stand-in for the browser's EventSource with manual event injection. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  static get last(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]
  }
  url: string
  closed = false
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  private handlers = new Map<string, Set<(ev: MessageEvent) => void>>()
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: (ev: MessageEvent) => void) {
    this.handlers.get(type)?.delete(fn)
  }
  close() {
    this.closed = true
  }
  open() {
    this.onopen?.(new Event('open'))
  }
  fail() {
    this.onerror?.(new Event('error'))
  }
  emit(type: string, data: unknown) {
    for (const fn of this.handlers.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent)
  }
}

// Node's setImmediate is a real macrotask hop that fake-indexeddb also relies on;
// it stays unfaked below, so awaiting it lets IndexedDB work and promise chains
// settle without moving the fake clock. (Not in the DOM lib, hence the cast.)
const { setImmediate: nextTask } = globalThis as unknown as { setImmediate: (fn: () => void) => void }

async function settle(rounds = 25): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => nextTask(r))
}

async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return
    await new Promise<void>((r) => nextTask(r))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Advance fake time, then let the resulting async work finish. */
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

/** Start syncing and wait for the stream to be opened and the first exchange to run. */
async function startConnected(): Promise<FakeEventSource> {
  startSync()
  await until(() => FakeEventSource.instances.length === 1, 'the stream to be created')
  const es = FakeEventSource.last
  es.open()
  await tick(0)
  await until(() => syncCalls.mock.calls.length >= 1, 'the first exchange')
  await settle()
  return es
}

let n = 0
beforeEach(() => {
  useDatabase(`sync-${Date.now()}-${n++}`)
  resetDeviceId()
  FakeEventSource.instances = []
  syncCalls.mockClear()
  listNotifications.mockClear()
  readNotification.mockClear()
  serverNotifications.value = []
  serverCursor.value = 5
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('navigator', { onLine: true })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.spyOn(Math, 'random').mockReturnValue(0.5) // jitter factor exactly 1.0
})

afterEach(() => {
  stopSync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('live channel lifecycle', () => {
  it('opens after start', async () => {
    const es = await startConnected()
    expect(es.url).toMatch(/^\/api\/v1\/sync\/events\?device=[^&]+$/)
    expect(es.closed).toBe(false)
  })

  it('closes on stop', async () => {
    const es = await startConnected()
    stopSync()
    expect(es.closed).toBe(true)
    // No reconnection is attempted after sign-out.
    await tick(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('does not connect while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    startSync()
    await settle(50)
    expect(FakeEventSource.instances).toHaveLength(0)
    await tick(30_000)
    expect(FakeEventSource.instances).toHaveLength(0)
    // The network returns: connect right away.
    vi.stubGlobal('navigator', { onLine: true })
    ;(globalThis.window as unknown as EventTarget).dispatchEvent(new Event('online'))
    await until(() => FakeEventSource.instances.length === 1, 'a connection after online')
  })
})

describe('wake-ups', () => {
  it('wake-up with stale cursor does not sync', async () => {
    const es = await startConnected()
    expect(await getMeta<number>('cursor', 0)).toBe(5)
    const before = syncCalls.mock.calls.length
    es.emit('ops', { cursor: 5 })
    await tick(10)
    es.emit('ops', { cursor: 3 })
    await tick(10)
    expect(syncCalls.mock.calls.length).toBe(before)
  })

  it('wake-up with newer cursor syncs', async () => {
    const es = await startConnected()
    const before = syncCalls.mock.calls.length
    serverCursor.value = 6
    es.emit('ops', { cursor: 6 })
    await tick(10)
    expect(syncCalls.mock.calls.length).toBe(before + 1)
    expect(await getMeta<number>('cursor', 0)).toBe(6)
  })
})

describe('reconnection', () => {
  it('reconnects with capped backoff', async () => {
    const first = await startConnected()
    first.fail()
    expect(first.closed).toBe(true)
    let count = 1
    for (const expected of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      await tick(expected - 1)
      expect(FakeEventSource.instances, `no attempt before ${expected} ms`).toHaveLength(count)
      await tick(1)
      expect(FakeEventSource.instances, `attempt at ${expected} ms`).toHaveLength(count + 1)
      count++
      FakeEventSource.last.fail()
    }
    // A successful open resets the backoff: the next failure retries after 1 s again.
    await tick(30_000)
    const reopened = FakeEventSource.last
    reopened.open()
    await tick(0)
    reopened.fail()
    await tick(999)
    expect(FakeEventSource.instances).toHaveLength(count + 1)
    await tick(1)
    expect(FakeEventSource.instances).toHaveLength(count + 2)
  })

  it('treats a stream that never opens as a failed attempt', async () => {
    startSync()
    await until(() => FakeEventSource.instances.length === 1, 'the stream to be created')
    await tick(9_999)
    expect(FakeEventSource.instances).toHaveLength(1)
    await tick(1)
    expect(FakeEventSource.instances[0].closed).toBe(true)
    await tick(1_000)
    expect(FakeEventSource.instances).toHaveLength(2)
  })

  it('syncs on reconnect', async () => {
    const first = await startConnected()
    const before = syncCalls.mock.calls.length
    first.fail()
    await tick(1_000)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(syncCalls.mock.calls.length).toBe(before)
    FakeEventSource.last.open()
    await tick(0)
    expect(syncCalls.mock.calls.length).toBe(before + 1)
  })
})

describe('polling fallback', () => {
  it('interval relaxes when live and restores on disconnect', async () => {
    const es = await startConnected()
    const before = syncCalls.mock.calls.length
    // Connected: the 30 s poll is silent, the 5 min safety net still fires.
    await tick(30_000)
    expect(syncCalls.mock.calls.length).toBe(before)
    await tick(270_000)
    expect(syncCalls.mock.calls.length).toBe(before + 1)
    // Disconnected (the server stays unreachable: every attempt fails): back to 30 s.
    es.fail()
    const afterDrop = syncCalls.mock.calls.length
    const failer = setInterval(() => {
      const last = FakeEventSource.last
      if (last && !last.closed) last.fail()
    }, 100)
    await tick(30_000)
    clearInterval(failer)
    expect(syncCalls.mock.calls.length).toBe(afterDrop + 1)
    expect(FakeEventSource.instances.length).toBeGreaterThan(1)
  })
})

describe('restore re-seed (log generation)', () => {
  type SentOp = { id: string; entity: string; entityId: string; field: string; value: unknown; ts: number; device: string }
  const sent = () => syncCalls.mock.calls.map((c) => (c as unknown as [string, number, SentOp[]]))

  /** Local state written by two devices, as if synced long ago. */
  async function seedLocal() {
    await applyOps([
      { id: 'a1', entity: 'project', entityId: 'p1', field: 'name', value: 'Home', ts: 100, device: 'devA' },
      { id: 'a2', entity: 'task', entityId: 't1', field: 'title', value: 'Buy milk', ts: 200, device: 'devA' },
      { id: 'a3', entity: 'task', entityId: 't1', field: 'project_id', value: 'p1', ts: 201, device: 'devA' },
      { id: 'b1', entity: 'task', entityId: 't1', field: 'title', value: 'Buy oat milk', ts: 300, device: 'devB' },
      { id: 'b2', entity: 'task', entityId: 't2', field: 'title', value: 'Created after the backup', ts: 400, device: 'devB' },
      { id: 'b3', entity: 'label', entityId: 'l1', field: 'name', value: 'errand', ts: 410, device: 'devB' },
      { id: 'b4', entity: 'view', entityId: 'v1', field: 'name', value: 'Work', ts: 420, device: 'devB' },
    ])
    await setMeta('generation', 'gen-before')
    await setMeta('cursor', 42)
  }

  /** The restored server: new generation, cursor 2 after the re-seed pull. */
  function restoredServer() {
    syncCalls.mockImplementation((async (...args: unknown[]) => {
      const cursor = args[1] as number
      return { applied: (args[2] as unknown[]).length, ops: [], cursor: cursor === 0 ? 2 : cursor, hasMore: false, serverTime: Date.now(), generation: 'gen-after' }
    }) as never)
  }

  it('reseedsAfterGenerationChange', async () => {
    await seedLocal()
    // An edit made offline is still waiting in the outbox; it must survive.
    await db.outbox.add({ id: 'pending-1', entity: 'task', entityId: 't2', field: 'priority', value: 1, ts: 500, device: 'me' })
    restoredServer()
    await syncNow()
    const calls = sent()
    // First exchange: old cursor, discovers the new generation.
    expect(calls[0][1]).toBe(42)
    expect(calls[0][2].map((o) => o.id)).toContain('pending-1')
    // Then everything is re-sent from cursor 0.
    const reseed = calls.slice(1)
    expect(reseed.length).toBeGreaterThan(0)
    expect(reseed[0][1]).toBe(0)
    const ops = reseed.flatMap((c) => c[2])
    const fields = ops.map((o) => `${o.entity}:${o.entityId}:${o.field}`).sort()
    expect(fields).toEqual(['label:l1:name', 'project:p1:name', 'task:t1:project_id', 'task:t1:title', 'task:t2:title', 'view:v1:name'])
    expect(await getMeta('generation', '')).toBe('gen-after')
    expect(await getMeta('cursor', -1)).toBe(2)
    expect(await db.outbox.count()).toBe(0)
    // Steady state: the next exchange does not re-seed again.
    syncCalls.mockClear()
    await syncNow()
    expect(sent()).toHaveLength(1)
    expect(sent()[0][2]).toHaveLength(0)
  })

  it('reseedKeepsOriginalClocks', async () => {
    await seedLocal()
    restoredServer()
    await syncNow()
    const ops = sent().slice(1).flatMap((c) => c[2])
    const title = ops.find((o) => o.entityId === 't1' && o.field === 'title')!
    expect(title).toMatchObject({ value: 'Buy oat milk', ts: 300, device: 'devB' })
    const project = ops.find((o) => o.entityId === 't1' && o.field === 'project_id')!
    expect(project).toMatchObject({ value: 'p1', ts: 201, device: 'devA' })
    // Fresh op ids, so the server does not drop them as duplicates of pre-restore ops.
    expect(ops.every((o) => !['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].includes(o.id))).toBe(true)
  })

  it('reseedDoesNotDuplicateEntities', async () => {
    await seedLocal()
    restoredServer()
    await syncNow()
    const ops = sent().slice(1).flatMap((c) => c[2])
    expect(await db.tasks.count()).toBe(2)
    expect(await db.projects.count()).toBe(1)
    expect(await db.labels.count()).toBe(1)
    // Replaying the re-seed on another device yields the same entities and values.
    const local = await db.tasks.toArray()
    useDatabase(`sync-other-${Date.now()}-${n++}`)
    await applyOps(ops as never)
    const other = await db.tasks.toArray()
    expect(other.map((t) => t.id).sort()).toEqual(local.map((t) => t.id).sort())
    expect(other.find((t) => t.id === 't1')?.title).toBe('Buy oat milk')
    expect(await db.projects.count()).toBe(1)
  })

  it('two devices re-seeding concurrently converge on the greatest timestamp', async () => {
    // Device A edited t1.title at ts 300 after the backup; device B holds ts 250.
    const a = [{ id: 'x1', entity: 'task', entityId: 't1', field: 'title', value: 'A wins', ts: 300, device: 'devA' }]
    const b = [{ id: 'y1', entity: 'task', entityId: 't1', field: 'title', value: 'B loses', ts: 250, device: 'devB' }]
    const reseeded: SentOp[] = []
    for (const local of [a, b]) {
      useDatabase(`sync-dev-${Date.now()}-${n++}`)
      resetDeviceId()
      await applyOps(local as never)
      await setMeta('generation', 'gen-before')
      syncCalls.mockClear()
      restoredServer()
      await syncNow()
      reseeded.push(...sent().slice(1).flatMap((c) => c[2]))
    }
    // The server (and every device) applies the union by last-writer-wins.
    for (const order of [reseeded, [...reseeded].reverse()]) {
      useDatabase(`sync-merge-${Date.now()}-${n++}`)
      await applyOps(order as never)
      expect((await db.tasks.get('t1'))?.title).toBe('A wins')
    }
  })

  it('adopts the first generation it sees without re-seeding', async () => {
    await applyOps([{ id: 'a1', entity: 'task', entityId: 't1', field: 'title', value: 'x', ts: 1, device: 'd' }])
    restoredServer()
    await syncNow()
    expect(sent()).toHaveLength(1)
    expect(await getMeta('generation', '')).toBe('gen-after')
  })
})

describe('second-factor policy (mfa-totp)', () => {
  it('maps mfa_enrolment_required to the restricted state and uploads queued edits after enrolment', async () => {
    await db.outbox.add({ id: 'queued-1', entity: 'task', entityId: 't9', field: 'title', value: 'Written while restricted', ts: 900, device: 'me' })
    syncCalls.mockImplementationOnce((async () => {
      throw new ApiError(403, 'mfa_enrolment_required', 'set up two-factor authentication')
    }) as never)
    await syncNow()
    expect(syncSnapshot().state).toBe('restricted')
    expect(syncSnapshot().error).toContain('two-factor')
    // Nothing was accepted, so the edit is still queued.
    expect(await db.outbox.count()).toBe(1)

    // After enrolment the next exchange uploads it.
    await syncNow()
    const sentOps = (syncCalls.mock.calls.at(-1) as unknown as [string, number, { id: string }[]])[2]
    expect(sentOps.map((o) => o.id)).toEqual(['queued-1'])
    expect(await db.outbox.count()).toBe(0)
    expect(syncSnapshot().state).toBe('idle')
  })
})

describe('demo write budget (demo-sandboxes)', () => {
  it('maps demo_limit to the limited state and keeps the queue', async () => {
    await db.outbox.add({ id: 'queued-2', entity: 'task', entityId: 't8', field: 'title', value: 'Over the budget', ts: 901, device: 'me' })
    syncCalls.mockImplementationOnce((async () => {
      throw new ApiError(429, 'demo_limit', 'this demo sandbox may save at most 600 changes per hour; try again later')
    }) as never)
    await syncNow()
    expect(syncSnapshot().state).toBe('limited')
    expect(syncSnapshot().error).toContain('600 changes')
    expect(await db.outbox.count()).toBe(1)
    // When the budget allows again the queued edit goes out.
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    expect(syncSnapshot().state).toBe('idle')
  })
})

describe('project sharing', () => {
  type SentOp = { id: string; entity: string; entityId: string; field: string; value: unknown; ts: number; device: string }
  const membership = (projectId: string, role: string) => ({
    projectId, role, ownerId: 'alice', members: [{ userId: 'alice', name: 'Alice', email: 'a@example.com', role: 'owner' }],
  })
  /** The server answers with the given extras on every exchange. */
  function server(extra: (sent: SentOp[]) => Record<string, unknown>) {
    syncCalls.mockImplementation((async (...args: unknown[]) => {
      const sentOps = args[2] as SentOp[]
      return { applied: 0, ops: [], cursor: serverCursor.value, hasMore: false, serverTime: Date.now(), ...extra(sentOps) }
    }) as never)
  }

  it('stores memberships', async () => {
    server(() => ({ memberships: [membership('p1', 'editor')] }))
    await syncNow()
    expect(await db.memberships.toArray()).toEqual([membership('p1', 'editor')])
    // The server's list replaces the cache on every sync (role changed elsewhere).
    server(() => ({ memberships: [membership('p1', 'viewer')] }))
    await syncNow()
    expect((await db.memberships.get('p1'))?.role).toBe('viewer')
    // An older server sends no list: the cache is kept as is.
    server(() => ({}))
    await syncNow()
    expect(await db.memberships.count()).toBe(1)
  })

  it('purges removed project locally', async () => {
    await applyOps([
      { id: 's1', entity: 'project', entityId: 'shared', field: 'name', value: 'Home', ts: 1, device: 'A' },
      { id: 's2', entity: 'task', entityId: 'st', field: 'project_id', value: 'shared', ts: 1, device: 'A' },
      { id: 's3', entity: 'task', entityId: 'sub', field: 'project_id', value: 'shared', ts: 1, device: 'A' },
      { id: 'm1', entity: 'project', entityId: 'mine', field: 'name', value: 'Mine', ts: 1, device: 'B' },
      { id: 'm2', entity: 'task', entityId: 'mt', field: 'project_id', value: 'mine', ts: 1, device: 'B' },
      { id: 'm3', entity: 'task', entityId: 'inbox', field: 'title', value: 'Inbox task', ts: 1, device: 'B' },
    ])
    server(() => ({ memberships: [membership('shared', 'editor')] }))
    await syncNow()
    // Removed: the next response no longer lists the project.
    server(() => ({ memberships: [] }))
    await syncNow()
    expect(await db.projects.get('shared')).toBeUndefined()
    expect(await db.tasks.get('st')).toBeUndefined()
    expect(await db.tasks.get('sub')).toBeUndefined()
    expect(await db.memberships.count()).toBe(0)
    // Personal data is untouched.
    expect((await db.projects.get('mine'))?.name).toBe('Mine')
    expect(await db.tasks.get('mt')).toBeDefined()
    expect(await db.tasks.get('inbox')).toBeDefined()
  })

  it('rejected op restores server value', async () => {
    await applyOps([
      { id: 'w1', entity: 'task', entityId: 't1', field: 'title', value: 'Milk', ts: 1, device: 'alice-dev' },
      { id: 'w2', entity: 'task', entityId: 't1', field: 'project_id', value: 'p1', ts: 1, device: 'alice-dev' },
      { id: 'w3', entity: 'project', entityId: 'p1', field: 'name', value: 'Home', ts: 1, device: 'alice-dev' },
    ])
    // Offline edits: one to an existing task, one task created from scratch.
    await mutate('task', 't1', { title: 'Oat milk' })
    await mutate('task', 'local-only', { title: 'Viewer draft', project_id: 'p1' })
    server((sentOps) => ({
      rejected: sentOps.map((o) => ({ id: o.id, reason: 'forbidden' })),
      // The server's winning op for the refused field travels in the same response.
      ops: [{ id: 'w1', entity: 'task', entityId: 't1', field: 'title', value: 'Milk', ts: 1, device: 'alice-dev', seq: 3 }],
      memberships: [membership('p1', 'viewer')],
    }))
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    const t1 = await db.tasks.get('t1')
    expect(t1?.title).toBe('Milk')
    expect(t1?._clock.title).toEqual({ ts: 1, device: 'alice-dev' })
    // A task that only ever existed on this device is gone.
    expect(await db.tasks.get('local-only')).toBeUndefined()
    // One exchange, then the loop stops: nothing is retried.
    expect(syncCalls).toHaveBeenCalledTimes(1)
    // The user is told what was refused, naming the project and the tasks.
    const notice = syncSnapshot().rejected
    expect(notice?.count).toBe(3)
    expect(notice?.projects).toEqual(['Home'])
    expect(notice?.tasks).toContain('Oat milk')
    dismissRejected()
    expect(syncSnapshot().rejected).toBeNull()
  })
})

describe('notifications', () => {
  const assigned = (id: string, taskId: string, createdAt: number) => ({
    id, kind: 'assigned', createdAt, readAt: null,
    payload: { assigneeId: 'bob', actorId: 'alice', actorName: 'Alice', taskId, taskTitle: 'Milk', projectId: 'p', projectName: 'Home', at: createdAt },
  })

  it('caches notifications and counts unread', async () => {
    syncCalls.mockImplementation(async () => ({ applied: 0, ops: [], cursor: serverCursor.value, hasMore: false, serverTime: Date.now() }))
    serverNotifications.value = [assigned('n1', 't1', 10), assigned('n2', 't2', 20)]
    // The first exchange of a session fetches the list even without new ops.
    await syncNow()
    expect(listNotifications).toHaveBeenCalledTimes(1)
    expect(await unreadCount()).toBe(2)
    expect((await unreadNotifications()).map((n) => n.id)).toEqual(['n2', 'n1'])
    // A quiet exchange does not fetch again; one that brings ops does.
    await syncNow()
    expect(listNotifications).toHaveBeenCalledTimes(1)
    serverNotifications.value = [assigned('n3', 't3', 30), ...serverNotifications.value]
    syncCalls.mockImplementationOnce((async () => ({
      applied: 0, cursor: 6, hasMore: false, serverTime: Date.now(),
      ops: [{ id: 'a1', entity: 'task', entityId: 't3', field: 'assignee_id', value: 'bob', ts: 5, device: 'alice-dev', seq: 6 }],
    })) as never)
    await syncNow()
    expect(listNotifications).toHaveBeenCalledTimes(2)
    expect(await unreadCount()).toBe(3)
    // Opening a task marks its notifications read locally at once, then on the server.
    vi.stubGlobal('navigator', { onLine: false })
    readNotification.mockRejectedValueOnce(new TypeError('offline'))
    expect(await markTaskNotificationsRead('t1')).toBe(1)
    expect(await unreadCount()).toBe(2)
    await settle()
    // Still read after a refresh that happens before the server confirmed it...
    vi.stubGlobal('navigator', { onLine: true })
    syncCalls.mockImplementationOnce((async () => ({
      applied: 0, cursor: 7, hasMore: false, serverTime: Date.now(),
      ops: [{ id: 'a2', entity: 'task', entityId: 't9', field: 'title', value: 'x', ts: 6, device: 'alice-dev', seq: 7 }],
    })) as never)
    await syncNow()
    expect(readNotification).toHaveBeenCalledWith('n1')
    expect(await unreadCount()).toBe(2)
    expect((serverNotifications.value.find((n) => n.id === 'n1') as { readAt: number | null }).readAt).toBe(99)
    // ...and the server state wins once confirmed.
    expect((await db.notifications.get('n1'))?.readPending).toBeFalsy()
  })

  it('a refused assignment falls back to unassigned with a membership notice', async () => {
    await applyOps([
      { id: 'w1', entity: 'task', entityId: 't1', field: 'project_id', value: 'p1', ts: 1, device: 'alice-dev' },
      { id: 'w2', entity: 'project', entityId: 'p1', field: 'name', value: 'Home', ts: 1, device: 'alice-dev' },
    ])
    await mutate('task', 't1', { assignee_id: 'bob' })
    syncCalls.mockImplementationOnce((async (...args: unknown[]) => ({
      applied: 0, ops: [], cursor: 5, hasMore: false, serverTime: Date.now(),
      rejected: (args[2] as { id: string }[]).map((o) => ({ id: o.id, reason: 'not_a_member' })),
    })) as never)
    await syncNow()
    expect((await db.tasks.get('t1'))?.assignee_id).toBeNull()
    const notice = syncSnapshot().rejected
    expect(notice?.assignments).toBe(1)
    expect(describeRejected(notice!)).toMatch(/no longer a member of Home/)
  })
})

describe('trash-and-history', () => {
  it('purged ids are removed locally', async () => {
    await applyOps([
      { id: 'p1', entity: 'task', entityId: 'gone', field: 'title', value: 'Purged', ts: 1, device: 'A' },
      { id: 'p2', entity: 'task', entityId: 'gone', field: 'deleted_at', value: 5, ts: 2, device: 'A' },
      { id: 'p3', entity: 'task', entityId: 'kept', field: 'title', value: 'Kept', ts: 1, device: 'A' },
    ])
    // A stale offline edit for the purged task is still queued.
    await mutate('task', 'gone', { title: 'Offline edit' })
    let first = true
    syncCalls.mockImplementation((async () => {
      const purged = first ? [{ entity: 'task', entityId: 'gone' }] : []
      first = false
      return { applied: 0, duplicates: 1, ops: [], cursor: serverCursor.value, hasMore: false, serverTime: Date.now(), purged, trashRetentionDays: 7 }
    }) as never)
    await syncNow()
    expect(await db.tasks.get('gone')).toBeUndefined()
    expect(await db.tasks.get('kept')).toBeDefined()
    expect(await db.outbox.count()).toBe(0)
    expect(await getMeta('trashRetentionDays', 30)).toBe(7)
  })
})
