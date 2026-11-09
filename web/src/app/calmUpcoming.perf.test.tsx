// @vitest-environment happy-dom
// Calm Upcoming at scale (OpenSpec change sidebar-brand-and-row-grid, design D8; docs/performance.md):
// the 10,000-task account with 2,000 tasks spread over the next 30 days. With Later days
// summarised only the first three days draw rows, the row grid's list-wide slots are
// worked out once, and completing a task still re-renders at most 3 rows. Counts, not times.
/* eslint-disable test-hygiene/no-fixed-wait -- measurement windows of the scale budgets */
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import type { Op } from '../lib/types'
import { flush, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { markLongPull, withDeferredActivity } from '../lib/activity'

// TaskRow computes its field badges once per render: counting the calls counts row renders.
const rowRenders = vi.hoisted(() => ({ n: 0 }))
vi.mock('../lib/fields', async (orig) => {
  const m = await orig<typeof import('../lib/fields')>()
  return { ...m, fieldBadges: (...args: Parameters<typeof m.fieldBadges>) => { rowRenders.n++; return m.fieldBadges(...args) } }
})

const TASKS = 10_000
const DATED = 2_000
const DAYS = 30
// Not a hook: the database helper of lib/db.
const openDatabase = useDatabase
let run = 0

beforeEach(() => {
  openDatabase(`calm-upcoming-scale-${Date.now()}-${run++}`)
  resetDeviceId()
  localStorage.clear()
  mockFetch((method, path) => noPublicLinks(method, path) ?? (path === '/api/v1/notifications' ? { notifications: [] } : path === '/api/v1/task-pages' ? { pages: [] } : undefined))
  rowRenders.n = 0
})
afterEach(() => { vi.unstubAllGlobals() })

const dayAfter = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fixtureOps(): Op[] {
  const ops: Op[] = []
  let n = 0
  const op = (entity: Op['entity'], entityId: string, field: string, value: unknown): void => {
    ops.push({ id: `f${n++}`, entity, entityId, field, value, ts: 1_000 + n, device: 'seed' })
  }
  for (let p = 0; p < 20; p++) op('project', `p${p}`, 'name', `Project ${p}`)
  for (let i = 0; i < TASKS; i++) {
    const id = `t${String(i).padStart(5, '0')}`
    op('task', id, 'title', `Task ${i}`)
    op('task', id, 'position', i + 1)
    op('task', id, 'project_id', `p${i % 20}`)
    if (i < DATED) op('task', id, 'due', { date: dayAfter(1 + (i % DAYS)) })
    if (i % 7 === 0) op('task', id, 'estimate_minutes', 30)
    if (i >= 6_000 && i < 9_500) op('task', id, 'completed_at', 2_000_000 + i)
  }
  return ops
}

describe(`Upcoming with ${TASKS} tasks`, () => {
  it(`summarised: the later days draw no rows, and a completion re-renders at most 3 rows`, async () => {
    const ops = fixtureOps()
    await withDeferredActivity(async () => {
      markLongPull()
      for (let i = 0; i < ops.length; i += 5_000) await applyOps(ops.slice(i, i + 5_000))
    })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-day-summary-bar]').length >= DAYS - 10, 'the summarised days', 120_000)
    await flush(300)
    const shown = r.container.querySelectorAll('li[data-task-id]').length
    // About 67 tasks on each of the first three days; the later days are bars.
    expect(shown).toBeLessThan(DATED / 5)
    expect(shown).toBeGreaterThan(0)
    rowRenders.n = 0
    const button = r.container.querySelector('li[data-task-id] button[aria-label^="Complete"]') as HTMLButtonElement
    const id = button.closest('li')!.getAttribute('data-task-id')!
    act(() => button.click())
    await waitFor(async () => !!(await db.tasks.get(id))?.completed_at, 'the completion stored', 30_000)
    await flush(500)
    console.info(`[performance-10k] Upcoming summarised: ${shown} rows drawn of ${DATED}, row renders to complete one task ${rowRenders.n}`)
    expect(rowRenders.n).toBeLessThanOrEqual(3)
    await r.unmount()
  }, 180_000)
})
