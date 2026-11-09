// @vitest-environment happy-dom
// The side panel following the cursor at scale (OpenSpec change row-click-modes, D4):
// beside a 2,000-row project, each j or k shows the next task in the panel, draws the
// list once and re-renders only the two rows whose selection changed, as without the
// panel. Its own file, so its 2,000 rows and docked task get a worker of their own.
// The fixed waits are the measurement windows of the counts, as in
// listPerformance.perf.test.tsx.
/* eslint-disable test-hygiene/no-fixed-wait -- measurement windows of the render budget */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { applyOps, createProject, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Op } from '../lib/types'
import { setTaskOpen } from '../lib/userPrefs'
import { flush, key, minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { PanelHost } from './PanelHost'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

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

const ROWS = 2000
beforeEach(() => {
  useDatabase(`side-panel-follow-${Date.now()}`)
  resetDeviceId()
  localStorage.clear()
  mockFetch(noPublicLinks)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= 1440,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
  resetPanel()
  setCurrentUserId('u1')
})
afterEach(() => {
  resetPanel()
  vi.unstubAllGlobals()
})

/** `count` open tasks in one project, seeded as remote ops in one transaction. */
async function seed(count: number, projectId: string) {
  const ops: Op[] = []
  for (let i = 0; i < count; i++) {
    const id = `t${String(i).padStart(5, '0')}`
    ops.push({ id: `s-${i}-t`, entity: 'task', entityId: id, field: 'title', value: `Task ${i}`, ts: 100, device: 'seed' })
    ops.push({ id: `s-${i}-p`, entity: 'task', entityId: id, field: 'position', value: i + 1, ts: 100, device: 'seed' })
    ops.push({ id: `s-${i}-j`, entity: 'task', entityId: id, field: 'project_id', value: projectId, ts: 100, device: 'seed' })
  }
  await applyOps(ops)
}

describe('the side panel at scale', () => {
  it(`j and k draw the list once and two rows per press (${ROWS} rows)`, async () => {
    await setTaskOpen('panel')
    const project = await createProject({ name: 'Big' })
    await seed(ROWS, project)
    const r = await render(<><TaskListView route={{ view: 'project', id: project }} /><PanelHost user={{ id: 'u1' }} /></>)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === ROWS, 'every row rendered', 60_000)
    await flush(50)
    const docked = () => document.querySelector('[data-detail-variant="panel"]')?.getAttribute('data-detail-for') ?? null
    const rows: number[] = [], lists: number[] = []
    for (const k of ['j', 'j', 'j', 'k']) {
      const before = docked()
      rowRenders.n = 0
      listRenders.n = 0
      await key(document.activeElement ?? document.body, k)
      await waitFor(() => docked() !== null && docked() !== before, 'the panel follows', 10_000)
      await flush(20)
      rows.push(rowRenders.n)
      lists.push(listRenders.n)
    }
    console.info(`[row-click-modes] with the side panel, per j/k press with ${ROWS} rows: row renders ${rows.join(', ')}; list renders ${lists.join(', ')}`)
    for (const n of rows) expect(n).toBeLessThanOrEqual(4)
    // The first press also opens the panel's first task (the list's click-away starts listening); every later one draws the list once.
    expect(lists[0]).toBeLessThanOrEqual(2)
    for (const n of lists.slice(1)) expect(n).toBeLessThanOrEqual(1)
    await r.unmount()
  }, 120_000)
})
