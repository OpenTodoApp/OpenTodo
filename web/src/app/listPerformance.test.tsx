// @vitest-environment happy-dom
// Large lists (OpenSpec change large-list-performance): moving the cursor with j/k
// re-renders only the two rows whose selection changed, and one write reads the
// tasks table once for every list, count and badge on screen, not once per component.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { publishEncryption } from '../lib/e2ee'
import { applyOps, createProject, resetDeviceId, updateTask } from '../lib/ops'
import type { Op } from '../lib/types'
import { flush, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { Sidebar } from './Sidebar'
import { TaskListView } from './TaskListView'

// TaskRow computes its field badges once per render: counting the calls counts row renders.
const rowRenders = vi.hoisted(() => ({ n: 0 }))
vi.mock('../lib/fields', async (orig) => {
  const m = await orig<typeof import('../lib/fields')>()
  return { ...m, fieldBadges: (...args: Parameters<typeof m.fieldBadges>) => { rowRenders.n++; return m.fieldBadges(...args) } }
})

const ROWS = 2000
let run = 0
beforeEach(() => {
  useDatabase(`list-perf-${Date.now()}-${run++}`)
  resetDeviceId()
  localStorage.clear()
  mockFetch(noPublicLinks)
})
afterEach(() => {
  publishEncryption({ enabled: false })
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** `count` open tasks in one project (or the Inbox), seeded as remote ops in one transaction. */
async function seed(count: number, projectId: string | null) {
  const ops: Op[] = []
  for (let i = 0; i < count; i++) {
    const id = `t${String(i).padStart(5, '0')}`
    ops.push({ id: `s-${i}-t`, entity: 'task', entityId: id, field: 'title', value: `Task ${i}`, ts: 100, device: 'seed' })
    ops.push({ id: `s-${i}-p`, entity: 'task', entityId: id, field: 'position', value: i + 1, ts: 100, device: 'seed' })
    if (projectId) ops.push({ id: `s-${i}-j`, entity: 'task', entityId: id, field: 'project_id', value: projectId, ts: 100, device: 'seed' })
  }
  await applyOps(ops)
}

describe('large lists', () => {
  it(`j and k re-render only the rows whose selection changed (${ROWS} rows)`, async () => {
    await seed(ROWS, null)
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === ROWS, 'every row rendered', 60_000)
    await flush(50)
    const presses: number[] = []
    for (const k of ['j', 'j', 'j', 'k']) {
      rowRenders.n = 0
      await key(document.body, k)
      await flush(20)
      presses.push(rowRenders.n)
    }
    console.info(`[large-list-performance] row renders per j/k press with ${ROWS} rows: ${presses.join(', ')}`)
    // The first press selects one row; every later press deselects one and selects the next.
    expect(presses[0]).toBeLessThanOrEqual(2)
    for (const n of presses.slice(1)) expect(n).toBeLessThanOrEqual(4)
    expect(r.container.querySelector('[data-task-id="t00001"]')!.className).toContain('ring-1')
    await r.unmount()
  }, 120_000)

  it(`a running entry's minute tick re-renders only its row (${ROWS} rows, time-tracking 3.4)`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 10 ms before a minute boundary, so the one shared timer fires at once.
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 59, 990))
    await db.meta.put({ key: 'userId', value: 'u1' })
    await seed(ROWS, null)
    const e = (f: string, value: unknown): Op => ({ id: `e-${f}`, entity: 'time_entry', entityId: 'e1', field: f, value, ts: 100, device: 'seed' })
    await applyOps([e('task_id', 't00005'), e('user_id', 'u1'), e('started_at', new Date(2026, 9, 14, 11, 50).getTime()), e('ended_at', null)])
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === ROWS, 'every row rendered', 60_000)
    await waitFor(() => !!r.container.querySelector('[data-task-id="t00005"] [data-tracked]'), 'the tracked figure', 10_000)
    await flush(50)
    rowRenders.n = 0
    vi.setSystemTime(new Date(2026, 9, 14, 12, 1, 30))
    await waitFor(() => r.container.querySelector('[data-task-id="t00005"] [data-tracked]')!.textContent!.includes('11m'), 'the tick', 10_000)
    await flush(50)
    console.info(`[large-list-performance] row renders for one minute tick with ${ROWS} rows: ${rowRenders.n}`)
    expect(rowRenders.n).toBeLessThanOrEqual(2)
    vi.useRealTimers()
    await r.unmount()
  }, 120_000)

  it(`one write reads the tasks table once for the list, the sidebar and the project header (${ROWS} tasks)`, async () => {
    const project = await createProject({ name: 'Big' })
    await seed(ROWS, project)
    const r = await render(<>
      <Sidebar route={{ view: 'project', id: project }} user={{ id: 'u1', email: 'u@example.com', name: 'U', role: 'owner' } as never} />
      <TaskListView route={{ view: 'project', id: project }} />
    </>)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === ROWS, 'every row rendered', 60_000)
    await flush(200)
    let reads = 0
    const count = (row: unknown) => { reads++; return row }
    db.tasks.hook('reading', count)
    try {
      await updateTask('t00010', { title: 'Renamed' })
      await waitFor(() => r.container.textContent!.includes('Renamed'), 'the write shown', 30_000)
      await flush(300)
    } finally {
      db.tasks.hook('reading').unsubscribe(count)
    }
    console.info(`[large-list-performance] task rows read after one write with ${ROWS} tasks: ${reads} (${(reads / ROWS).toFixed(1)} table scans)`)
    expect(reads).toBeLessThan(ROWS * 1.5)
    await r.unmount()
  }, 120_000)

  it('with encryption on, rows share one membership lookup instead of a live query each (300 rows)', async () => {
    const project = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: project, role: 'owner', ownerId: 'u1', members: [] })
    await seed(300, project)
    publishEncryption({ enabled: true })
    let reads = 0
    const count = (row: unknown) => { reads++; return row }
    db.memberships.hook('reading', count)
    try {
      const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
      await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 300, 'every row rendered', 60_000)
      await flush(200)
      // Shared projects keep plaintext on the server, so no row is marked as not yet encrypted.
      expect(r.container.textContent).not.toContain('not yet encrypted')
      await r.unmount()
    } finally {
      db.memberships.hook('reading').unsubscribe(count)
    }
    console.info(`[large-list-performance] membership rows read to render 300 rows with encryption on: ${reads}`)
    expect(reads).toBeLessThan(20)
  }, 120_000)
})
