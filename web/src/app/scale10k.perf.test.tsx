// @vitest-environment happy-dom
// Count checks of the performance budgets at 10,000 tasks (OpenSpec change
// performance-10k, task 2.1): opening Today reads the tasks table at most once,
// a search keystroke reads nothing from IndexedDB, completing a task in a
// 2,000-row list re-renders at most 3 rows, each pulled page is applied in one
// local transaction, and two devices applying the same ops in different orders
// end with identical rows. Counts, not times: they cannot flake on a slow runner.
// The fixed waits are the measurement windows of the counts, as in
// listPerformance.perf.test.tsx.
/* eslint-disable test-hygiene/no-fixed-wait -- measurement windows of the scale budgets */
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import type { Op } from '../lib/types'
import { flush, mockFetch, noPublicLinks, render, type, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import CommandPalette from './palette/CommandPalette'
import { syncNow } from '../lib/sync'
import { markLongPull, withDeferredActivity } from '../lib/activity'
import { logicalToday } from '../lib/dates'
import { setListDisplay } from '../lib/listDisplay'

// TaskRow computes its field badges once per render: counting the calls counts row renders.
const rowRenders = vi.hoisted(() => ({ n: 0 }))
vi.mock('../lib/fields', async (orig) => {
  const m = await orig<typeof import('../lib/fields')>()
  return { ...m, fieldBadges: (...args: Parameters<typeof m.fieldBadges>) => { rowRenders.n++; return m.fieldBadges(...args) } }
})

// The list calls useListMotion once per render: counting the calls counts list renders.
const listRenders = vi.hoisted(() => ({ n: 0 }))
vi.mock('./task-list/ListGroups', async (orig) => {
  const m = await orig<typeof import('./task-list/ListGroups')>()
  return { ...m, useListMotion: (...args: Parameters<typeof m.useListMotion>) => { listRenders.n++; return m.useListMotion(...args) } }
})

// The sync loop talks to the server only through `api`: pages come from here.
const pages = vi.hoisted(() => ({ list: [] as Op[][], served: 0 }))
vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  api: {
    ...(await orig<typeof import('../lib/api')>()).api,
    sync: async (_device: string, cursor: number) => {
      const i = cursor
      pages.served++
      return { applied: 0, ops: pages.list[i] ?? [], cursor: i + 1, hasMore: i + 1 < pages.list.length, serverTime: Date.now(), rejected: [], memberships: [], purged: [], workspaces: [] }
    },
  },
}))

const TASKS = 10_000
// Not a hook: the database helper of lib/db, called again for a second device.
const openDatabase = useDatabase
const BIG = 2_000
const PROJECTS = 60
let run = 0
beforeEach(() => {
  useDatabase(`scale10k-${Date.now()}-${run++}`)
  resetDeviceId()
  localStorage.clear()
  mockFetch((method, path) => noPublicLinks(method, path) ?? (path === '/api/v1/notifications' ? { notifications: [] } : path === '/api/v1/task-pages' ? { pages: [] } : undefined))
  rowRenders.n = 0
})
afterEach(() => { vi.unstubAllGlobals() })

/**
 * The 10,000-task account's ops, the shape of internal/perfseed: 60 projects, the
 * first holding 2,000 open tasks, 6,000 open in all, 3,500 completed, 500 in the
 * Trash, every 20th due today.
 */
function fixtureOps(): Op[] {
  const today = logicalToday()
  const ops: Op[] = []
  let n = 0
  const op = (entity: Op['entity'], entityId: string, field: string, value: unknown): void => {
    ops.push({ id: `f${n++}`, entity, entityId, field, value, ts: 1_000 + n, device: 'seed' })
  }
  for (let p = 0; p < PROJECTS; p++) {
    op('project', `p${p}`, 'name', p === 0 ? 'Big backlog' : `Project ${p}`)
    op('project', `p${p}`, 'position', p + 1)
  }
  for (let i = 0; i < TASKS; i++) {
    const id = `t${String(i).padStart(5, '0')}`
    const project = i < BIG ? 'p0' : i % 10 === 0 ? null : `p${1 + (i % (PROJECTS - 1))}`
    op('task', id, 'title', i % 271 === 0 ? `Order the zephyr part ${i}` : `Task ${i}`)
    op('task', id, 'position', i + 1)
    op('task', id, 'created_at', 1_000 + i)
    op('task', id, 'priority', 1 + (i % 4))
    if (project) op('task', id, 'project_id', project)
    if (i % 20 === 0) op('task', id, 'due', { date: today })
    if (i % 5 === 0) op('task', id, 'description', `Notes about task ${i}, a sentence or two of them.`)
    if (i >= 6_000 && i < 9_500) op('task', id, 'completed_at', 2_000_000 + i)
    if (i >= 9_500) op('task', id, 'deleted_at', 2_000_000 + i)
  }
  return ops
}

/** Applies ops page by page, as a long pull does (the activity log keeps only the newest). */
async function pull(ops: Op[], page: number): Promise<void> {
  await withDeferredActivity(async () => {
    markLongPull()
    for (let i = 0; i < ops.length; i += page) await applyOps(ops.slice(i, i + page))
  })
}

async function seed(): Promise<Op[]> {
  const ops = fixtureOps()
  await pull(ops, 5_000)
  return ops
}

/** Counts rows read from every table while `fn` runs. */
async function readsDuring(fn: () => Promise<void>): Promise<Record<string, number>> {
  const reads: Record<string, number> = {}
  const hooks = db.tables.map((table) => {
    const h = (row: unknown) => { reads[table.name] = (reads[table.name] ?? 0) + 1; return row }
    table.hook('reading', h)
    return () => table.hook('reading').unsubscribe(h)
  })
  try {
    await fn()
  } finally {
    for (const off of hooks) off()
  }
  return reads
}

describe(`${TASKS} tasks`, () => {
  it('opening Today reads the tasks table at most once', async () => {
    await seed()
    let r: Awaited<ReturnType<typeof render>> | null = null
    const reads = await readsDuring(async () => {
      r = await render(<TaskListView route={{ view: 'today' }} />)
      await waitFor(() => r!.container.querySelectorAll('[data-task-id]').length > 0, 'Today listed', 60_000)
      await flush(300)
    })
    console.info(`[performance-10k] rows read to open Today with ${TASKS} tasks: ${JSON.stringify(reads)}`)
    // One read of the table (every stored row), and the few rows writes on the way changed.
    expect(reads.tasks ?? 0).toBeLessThanOrEqual(TASKS + 20)
    await r!.unmount()
  }, 180_000)

  it('a search keystroke reads nothing from IndexedDB', async () => {
    await seed()
    const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as never
    const r = await render(<CommandPalette user={user} onClose={() => {}} showShortcuts={() => {}} />)
    const field = () => document.querySelector('input[aria-label="Search tasks, projects and commands"]') as HTMLInputElement
    await waitFor(() => !!field(), 'the palette', 30_000)
    await flush(500)
    await type(field(), 'z')
    await flush(300)
    const typed: number[] = []
    for (const text of ['ze', 'zep', 'zeph', 'zephy', 'zephyr']) {
      const reads = await readsDuring(async () => {
        await type(field(), text)
        await flush(100)
      })
      typed.push(Object.values(reads).reduce((a, b) => a + b, 0))
    }
    await waitFor(() => [...document.querySelectorAll('[data-palette] [role="option"]')].some((o) => o.textContent?.includes('zephyr')), 'the matches', 30_000)
    console.info(`[performance-10k] IndexedDB rows read per search keystroke with ${TASKS} tasks: ${typed.join(', ')}`)
    for (const n of typed) expect(n).toBe(0)
    await r.unmount()
  }, 180_000)

  it(`completing a task in the ${BIG}-row list re-renders at most 3 rows`, async () => {
    await seed()
    const r = await render(<TaskListView route={{ view: 'project', id: 'p0' }} />)
    await waitFor(() => r.container.querySelectorAll('li[data-task-id]').length === BIG, 'every row', 120_000)
    await flush(300)
    rowRenders.n = 0
    listRenders.n = 0
    const button = r.container.querySelector('li[data-task-id="t00100"] button[aria-label^="Complete"]') as HTMLButtonElement
    let click = { rows: 0, list: 0 }
    const reads = await readsDuring(async () => {
      // The frame of the click draws the clicked row and not the list (list-rendering-at-scale D7).
      act(() => button.click())
      click = { rows: rowRenders.n, list: listRenders.n }
      await waitFor(async () => !!(await db.tasks.get('t00100'))?.completed_at, 'the completion stored', 30_000)
      await flush(500)
    })
    console.info(`[performance-10k] row renders to complete one task in a ${BIG}-row list: ${rowRenders.n} (in the click: ${click.rows} rows, ${click.list} list); rows read: ${JSON.stringify(reads)}`)
    expect(rowRenders.n).toBeLessThanOrEqual(3)
    expect(click).toEqual({ rows: 1, list: 0 })
    // Not the table: the task's subtree and the changed rows (list-rendering-at-scale D5;
    // reading every task here queued the next writes behind it). The rest of the reads
    // vary with the timing of the window, a few hundred rows; the whole table is 10,000.
    expect(reads.tasks ?? 0).toBeLessThan(TASKS / 4)
    await r.unmount()
  }, 180_000)

  it('Today grouped by project and ordered by title: one read to open, a completion re-renders at most 3 rows (builtin-view-options)', async () => {
    await seed()
    await setListDisplay({ kind: 'today' }, { groupBy: 'project', sortBy: 'title', subtasks: true })
    let r: Awaited<ReturnType<typeof render>> | null = null
    const reads = await readsDuring(async () => {
      r = await render(<TaskListView route={{ view: 'today' }} />)
      await waitFor(() => !!r!.container.querySelector('li[data-task-id="t00100"]'), 'Today listed by project', 60_000)
      await flush(300)
    })
    expect(reads.tasks ?? 0).toBeLessThanOrEqual(TASKS + 20)
    rowRenders.n = 0
    const button = r!.container.querySelector('li[data-task-id="t00100"] button[aria-label^="Complete"]') as HTMLButtonElement
    act(() => button.click())
    await waitFor(async () => !!(await db.tasks.get('t00100'))?.completed_at, 'the completion stored', 30_000)
    await flush(500)
    console.info(`[performance-10k] Today by project: rows read to open ${JSON.stringify(reads)}, row renders to complete one task ${rowRenders.n}`)
    expect(rowRenders.n).toBeLessThanOrEqual(3)
    await r!.unmount()
  }, 180_000)

  it('each pulled page is applied in one local transaction', async () => {
    const ops = fixtureOps()
    pages.list = []
    for (let i = 0; i < ops.length; i += 1_000) pages.list.push(ops.slice(i, i + 1_000))
    pages.served = 0
    // Read-write transactions that write the tasks table, as IndexedDB sees them.
    let writes = 0
    db.use({
      stack: 'dbcore', name: 'count-writes',
      create: (down) => ({ ...down, transaction: (stores, mode, opts) => { if (mode === 'readwrite' && stores.includes('tasks')) writes++; return down.transaction(stores, mode, opts) } }),
    })
    await syncNow()
    expect(pages.served).toBe(pages.list.length)
    expect(await db.tasks.count()).toBe(TASKS)
    console.info(`[performance-10k] ${pages.list.length} pulled pages written in ${writes} transactions on the tasks table`)
    expect(writes).toBeLessThanOrEqual(pages.list.length)
  }, 300_000)

  it('two devices applying the ops in different orders end with identical rows', async () => {
    const ops = fixtureOps()
    // Concurrent edits from two devices, so the order decides nothing.
    for (let i = 0; i < 500; i++) {
      const id = `t${String(i * 7).padStart(5, '0')}`
      ops.push({ id: `a${i}`, entity: 'task', entityId: id, field: 'title', value: `A ${i}`, ts: 5_000_000 + i, device: 'devA' })
      ops.push({ id: `b${i}`, entity: 'task', entityId: id, field: 'title', value: `B ${i}`, ts: 5_000_000 + i, device: 'devB' })
    }
    const rowsAfter = async (order: Op[], page: number) => {
      openDatabase(`scale10k-converge-${run++}`)
      await pull(order, page)
      return db.tasks.orderBy('id').toArray()
    }
    const first = await rowsAfter(ops, 1_000)
    const second = await rowsAfter([...ops].reverse(), 700)
    expect(second.length).toBe(TASKS)
    expect(second).toEqual(first)
  }, 300_000)
})
