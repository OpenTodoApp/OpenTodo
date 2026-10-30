// @vitest-environment happy-dom
// Manual order in label pages and saved views (OpenSpec change view-manual-order,
// issue #623): the keyboard moves a task within the page's own order, written on
// the label or the view with Undo, never on the tasks; the New view page offers no
// Manual order.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createView } from '../lib/views'
import { undoBatch } from '../lib/undo'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { FilterView } from './FilterView'
import { SavedViewRoute } from './SavedViewView'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  mockFetch(noPublicLinks)
  useDatabase(`view-manual-order-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => { vi.unstubAllGlobals() })

const titles = () => [...document.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent?.trim())

describe('a label page in Manual order', () => {
  it('Alt+Up moves the selected task within its own order; the project keeps its order; Undo restores', async () => {
    const pid = await createProject({ name: 'Town' })
    const lid = await createLabel({ name: 'errand' })
    const pharmacy = await createTask({ title: 'Pharmacy', project_id: pid, labels: [lid] })
    await createTask({ title: 'Bakery', project_id: pid, labels: [lid] })
    const post = await createTask({ title: 'Post office', project_id: pid, labels: [lid] })
    const positions = (await db.tasks.toArray()).map((x) => [x.id, x.position])
    const r = await render(<TaskListView route={{ view: 'label', id: lid }} />)
    await waitFor(() => titles().join() === 'Pharmacy,Bakery,Post office', 'rows by position')
    // Select Post office and move it to the top.
    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'j')
    await key(document.body, 'ArrowUp', { altKey: true, shiftKey: true })
    await waitFor(() => titles().join() === 'Post office,Pharmacy,Bakery', 'moved to the top')
    const stored = (await db.labels.get(lid))?.manual_order
    expect(stored).toEqual([post])
    expect((await db.tasks.toArray()).map((x) => [x.id, x.position])).toEqual(positions)
    // Every row can be picked up and takes drops (a manually ordered list).
    expect(document.querySelector(`[data-drop-target="task:${pharmacy}"]`)).toBeTruthy()
    const entry = (await db.assistantUndo.toArray()).find((e) => e.label === 'Order changed')!
    await undoBatch(entry.id)
    await waitFor(() => titles().join() === 'Pharmacy,Bakery,Post office', 'undone')
    await r.unmount()
  })
})

describe('a saved view', () => {
  it('Alt+Down under another order switches the view to Manual order and moves the task within its group', async () => {
    await createTask({ title: 'A', priority: 1, due: { date: '2026-10-20' } })
    await createTask({ title: 'B', priority: 1, due: { date: '2026-10-21' } })
    const id = await createView({ name: 'Urgent', query: 'p1', group_by: 'none', sort_by: 'due' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => titles().join() === 'A,B', 'by due date')
    await key(document.body, 'j')
    await key(document.body, 'ArrowDown', { altKey: true })
    await waitFor(async () => (await db.views.get(id))?.sort_by === 'position', 'manual order')
    await waitFor(() => titles().join() === 'B,A', 'moved down')
    expect((await db.views.get(id))?.manual_order?.length).toBe(2)
    await r.unmount()
  })
})

describe('the New view page', () => {
  it('offers no Manual order', async () => {
    const r = await render(<FilterView />)
    await click(document.querySelector('[data-display-trigger]')!)
    const options = [...document.querySelectorAll('[data-display-panel] select[aria-label="Order by"] option')].map((o) => o.textContent)
    expect(options).not.toContain('Manual order')
    expect(options).toContain('Due date')
    await r.unmount()
  })
})
