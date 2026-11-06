import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FUTURE_SKEW_MS } from './hlc'
import type { Entity, Op } from './types'

// Randomized convergence test of the client (external-security-review 5.8), the
// TypeScript side of internal/sync/convergence_property_test.go. Each device is
// its own copy of the client modules (its own IndexedDB and its own clock,
// hlc.ts), with a wall clock that runs fast or slow. Devices edit the same
// fields, apply their edits and every pulled page through the real applyOps,
// and stamp refused ops again through the real restampSkewed. A small model
// server accepts ops up to five minutes ahead of its clock and refuses the rest
// with clock_skew, like internal/sync. Pages arrive in random sizes and orders,
// with older ops delivered again. Once every outbox is drained, every replica,
// and two fresh ones fed the whole log in other orders, must hold the same
// values and clocks: the last writer by (timestamp, device) of the server's
// log, computed here without wins(). The clock itself is pinned to the Go
// model by hlc.vectors.json.
//
// OPENTODO_PROPERTY_SEED=<n> replays one run; every run's seed is in the test
// name and in each failure message.

const T = 1_800_000_000_000

/** mulberry32: a small seeded generator, so a failing run reproduces. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One device's copy of the client: modules loaded afresh, so state is not shared. */
interface Client {
  db: typeof import('./db')
  ops: typeof import('./ops')
  hlc: typeof import('./hlc')
  clockSkew: typeof import('./clockSkew')
}

async function client(name: string): Promise<Client> {
  vi.resetModules()
  const [db, ops, hlc, clockSkew] = await Promise.all([import('./db'), import('./ops'), import('./hlc'), import('./clockSkew')])
  db.useDatabase(name)
  return { db, ops, hlc, clockSkew }
}

interface Device {
  id: string
  c: Client
  skew: number // how far its wall clock runs ahead of the server's
  outbox: Op[]
  cursor: number
  seq: number
}

type Kind = 'task' | 'project' | 'label'

/** The edited fields, by entity, with a generator of random values for each. */
const FIELDS: Record<Kind, Record<string, (r: () => number, who: string) => unknown>> = {
  task: {
    title: (r, who) => `${who} ${Math.floor(r() * 1000)}`,
    priority: (r) => 1 + Math.floor(r() * 4),
    labels: (r) => [[], ['l0'], ['l0', 'l1']][Math.floor(r() * 3)],
    due: (r) => (r() < 0.3 ? null : { date: `2026-11-${10 + Math.floor(r() * 9)}` }),
    completed_at: (r) => (r() < 0.5 ? null : T + Math.floor(r() * 1000)),
    'fields.f1': (r) => (r() < 0.3 ? null : Math.floor(r() * 100)), // a field family (custom-fields D2)
  },
  project: {
    name: (r, who) => `${who} project ${Math.floor(r() * 100)}`,
    color: (r) => ['#ff0000', '#00ff00', '#0000ff'][Math.floor(r() * 3)],
  },
  label: {
    name: (r, who) => `${who} label ${Math.floor(r() * 100)}`,
  },
}
const IDS: Record<Kind, string[]> = { task: ['t0', 't1', 't2'], project: ['p0'], label: ['l0', 'l1'] }

/** The model server: the accepted ops in arrival order; clocks too far ahead are refused. */
class Server {
  log: Op[] = []
  ids = new Set<string>()
  now = T

  accept(batch: Op[]): string[] {
    const refused: string[] = []
    for (const o of batch) {
      if (o.ts > this.now + MAX_FUTURE_SKEW_MS) refused.push(o.id)
      else if (!this.ids.has(o.id)) {
        this.ids.add(o.id)
        this.log.push(o)
      }
    }
    return refused
  }
}

type Cell = { value: unknown; ts: number; device: string }

/** The last writer of each field in a log, by timestamp and then device id. */
function lwwOf(log: Op[]): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const o of log) {
    const k = `${o.entity}/${o.entityId}/${o.field}`
    const c = out[k]
    if (!c || o.ts > c.ts || (o.ts === c.ts && o.device > c.device)) out[k] = { value: o.value ?? null, ts: o.ts, device: o.device }
  }
  return out
}

/** Every field a replica holds a clock for, with its value and clock. */
async function snapshot(c: Client): Promise<Record<string, Cell>> {
  const out: Record<string, Cell> = {}
  for (const entity of Object.keys(FIELDS) as Entity[]) {
    for (const row of (await c.db.tableOf(entity).toArray()) as unknown as Record<string, unknown>[]) {
      const clock = (row._clock ?? {}) as Record<string, { ts: number; device: string }>
      for (const [field, k] of Object.entries(clock)) {
        out[`${entity}/${String(row.id)}/${field}`] = { value: c.ops.readField(row, field) ?? null, ts: k.ts, device: k.device }
      }
    }
  }
  return out
}

function shuffle<V>(r: () => number, a: V[]): V[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function run(seed: number): Promise<void> {
  const r = prng(seed)
  const pick = <V,>(a: readonly V[]): V => a[Math.floor(r() * a.length)]
  const server = new Server()
  const tag = `seed ${seed} (replay with OPENTODO_PROPERTY_SEED=${seed})`
  const db = (who: string) => `convergence-${seed}-${who}-${Math.random()}`
  // From ten minutes slow to an hour fast, some within the tolerance. Device
  // ids decide a tie, and two devices on the same clock tie often.
  const skews = [0, 0, 1500, -600_000, 240_000, 3_600_000]
  const devices: Device[] = []
  for (const id of ['dev-a', 'dev-b', 'dev-c', 'dev-d']) devices.push({ id, c: await client(db(id)), skew: pick(skews), outbox: [], cursor: 0, seq: 0 })
  const wall = (d: Device) => vi.setSystemTime(server.now + d.skew)

  async function edit(d: Device): Promise<void> {
    const entity = pick(Object.keys(FIELDS) as Kind[])
    const id = pick(IDS[entity])
    const names = Object.keys(FIELDS[entity]).filter(() => r() < 0.5)
    if (names.length === 0) names.push(pick(Object.keys(FIELDS[entity])))
    wall(d)
    // One change: its ops share a timestamp, like mutateMany.
    const ts = d.c.hlc.hlcNow()
    const ops = names.map((field): Op => ({ id: `${d.id}-${++d.seq}`, entity, entityId: id, field, value: FIELDS[entity][field](r, d.id), ts, device: d.id }))
    await d.c.ops.applyOps(ops, { local: true })
    d.outbox.push(...ops)
  }

  async function exchange(d: Device): Promise<void> {
    wall(d)
    // Upload the outbox oldest first, like sync.ts; refused ops are stamped again.
    const sent = d.outbox
    d.outbox = []
    const refused = server.accept(sent)
    if (refused.length) {
      const again = await d.c.clockSkew.restampSkewed(sent, refused.map((id) => ({ id, reason: d.c.clockSkew.CLOCK_SKEW, serverTime: server.now })), server.now)
      d.outbox.push(...again)
      // A refused edit is kept, stamped again inside the accepted window.
      for (const o of again) expect(o.ts, `${tag}: ${d.id} restamped ${o.id}`).toBeLessThanOrEqual(server.now + MAX_FUTURE_SKEW_MS)
    }
    // Pull in random pages, each shuffled, some with an older op delivered again.
    let newest = 0
    while (d.cursor < server.log.length) {
      const page = server.log.slice(d.cursor, d.cursor + 1 + Math.floor(r() * 6))
      const next = d.cursor + page.length
      if (d.cursor > 0 && r() < 0.3) page.push(server.log[Math.floor(r() * d.cursor)])
      await d.c.ops.applyOps(shuffle(r, page))
      d.cursor = next
      newest = Math.max(newest, ...page.map((o) => o.ts))
    }
    // The receive rule: the next local edit is stamped after every pulled op.
    expect(d.c.hlc.hlcLast(), `${tag}: ${d.id} clock after a pull`).toBeGreaterThanOrEqual(newest)
    d.c.hlc.hlcObserveServerTime(server.now)
    // After a sync the clock is inside the window the server accepts.
    expect(d.c.hlc.hlcLast(), `${tag}: ${d.id} clock after a sync`).toBeLessThanOrEqual(server.now + MAX_FUTURE_SKEW_MS)
  }

  for (let step = 0; step < 150; step++) {
    const d = pick(devices)
    const x = r()
    if (x < 0.5) await edit(d)
    else if (x < 0.85) await exchange(d)
    else server.now += pick([0, 1, 1000, 60_000, 180_000])
  }
  // Quiesce: exchange until no outbox is left, then once more for everyone.
  for (let round = 0; devices.some((d) => d.outbox.length > 0); round++) {
    expect(round, `${tag}: outboxes never drained`).toBeLessThan(10)
    server.now += 1000
    for (const d of devices) await exchange(d)
  }
  for (const d of devices) await exchange(d)

  // No edit is lost: every op a device stamped reached the server.
  for (const d of devices) {
    for (let i = 1; i <= d.seq; i++) expect(server.ids.has(`${d.id}-${i}`), `${tag}: ${d.id}-${i} never accepted`).toBe(true)
  }

  // Two fresh replicas: the whole log at once, shuffled with duplicates, and
  // one op at a time, newest first.
  const all = await client(db('all'))
  await all.ops.applyOps(shuffle(r, [...server.log, ...server.log.filter(() => r() < 0.3)]))
  const one = await client(db('one'))
  for (const o of [...server.log].reverse()) await one.ops.applyOps([o])

  const want = lwwOf(server.log)
  expect(Object.keys(want).length, tag).toBeGreaterThan(0)
  for (const [name, c] of [...devices.map((d) => [d.id, d.c] as const), ['all', all] as const, ['one', one] as const]) {
    expect(await snapshot(c), `${tag}: replica ${name}`).toEqual(want)
  }
}

describe('client convergence (randomized)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const fixed = process.env.OPENTODO_PROPERTY_SEED
  const base = fixed ? Number(fixed) : Date.now() % 2 ** 31
  for (const seed of fixed ? [base] : [base, base + 1, base + 2]) {
    it(`converges on every replica, seed ${seed}`, async () => {
      await run(seed)
    })
  }
})
