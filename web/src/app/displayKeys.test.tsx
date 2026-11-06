// @vitest-environment happy-dom
// Group and order from the keyboard (OpenSpec change display-keys, issue #842): the
// `r` sequences change the synced Display options of a project's list, a label's
// page and a saved view through the panel's own write, say what they set, offer
// only what the page offers and never fire while typing.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createView } from '../lib/views'
import { key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { SavedViewRoute } from './SavedViewView'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  mockFetch(noPublicLinks)
  useDatabase(`display-keys-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  hideBulkToast()
})
afterEach(() => { vi.unstubAllGlobals() })

const headings = () => [...document.querySelectorAll('[data-group-label]')].map((e) => e.textContent)
const titles = () => [...document.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent?.trim())

async function keys(seq: string) {
  for (const k of seq.split(' ')) await key(document.body, k)
}

describe('a project list', () => {
  it('r g p groups by priority, r o t orders by title, r r reverses: stored for the project and announced', async () => {
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'Wash car', project_id: pid, priority: 2 })
    await createTask({ title: 'Call plumber', project_id: pid, priority: 1 })
    await createTask({ title: 'Buy bulbs', project_id: pid, priority: 2 })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().length === 3, 'rows')
    await keys('r g p')
    await waitFor(() => headings().join() === 'Priority 1,Priority 2', 'priority groups')
    expect(bulkToast()?.label).toBe('Group by: Priority')
    await keys('r o t')
    await waitFor(() => titles().join() === 'Call plumber,Buy bulbs,Wash car', 'title order in the groups')
    expect(bulkToast()?.label).toBe('Order by: Title · Ascending')
    await keys('r r')
    await waitFor(() => titles().join() === 'Call plumber,Wash car,Buy bulbs', 'reversed')
    expect(bulkToast()?.label).toBe('Order by: Title · Descending')
    await waitFor(async () => (await db.prefs.get(pid))?.sort_dir === 'desc', 'stored')
    expect(await db.prefs.get(pid)).toMatchObject({ group_by: 'priority', sort_by: 'title', sort_dir: 'desc' })
    // The writes went through the op log, like the panel's.
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'project_prefs').map((o) => o.field)
    expect(ops).toEqual(expect.arrayContaining(['group_by', 'sort_by', 'sort_dir']))
    await keys('r g s')
    await waitFor(async () => (await db.prefs.get(pid))?.group_by === 'section', 'back to sections')
    await r.unmount()
  })

  it('keys typed in a field stay text', async () => {
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'A', project_id: pid })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().length === 1, 'rows')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    for (const k of ['r', 'g', 'p']) await key(input, k)
    expect((await db.prefs.get(pid))?.group_by ?? '').toBe('')
    input.remove()
    await r.unmount()
  })
})

describe('a label page', () => {
  it('groups by project with r g j and has no section grouping', async () => {
    const lid = await createLabel({ name: 'errand' })
    await createTask({ title: 'Stamps', labels: [lid], priority: 3 })
    const r = await render(<TaskListView route={{ view: 'label', id: lid }} />)
    await waitFor(() => titles().length === 1, 'rows')
    await keys('r g p')
    await waitFor(async () => (await db.labels.get(lid))?.group_by === 'priority', 'priority')
    await keys('r g s')
    await keys('r g l')
    expect((await db.labels.get(lid))?.group_by).toBe('priority')
    await keys('r g j')
    await waitFor(async () => (await db.labels.get(lid))?.group_by === 'project', 'project')
    await r.unmount()
  })
})

describe('a saved view', () => {
  it('r o p orders by priority and r g n removes the grouping, on the view', async () => {
    await createTask({ title: 'A', priority: 3, due: { date: '2026-10-20' } })
    await createTask({ title: 'B', priority: 1, due: { date: '2026-10-21' } })
    const id = await createView({ name: 'Soon', query: 'due before 2026-11-01', group_by: 'project', sort_by: 'due' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => titles().join() === 'A,B', 'by due date')
    await keys('r o p')
    await keys('r r')
    await waitFor(() => titles().join() === 'B,A', 'priority 1 first')
    expect(bulkToast()?.label).toBe('Order by: Priority · Descending (p1 first)')
    await keys('r g n')
    await waitFor(async () => (await db.views.get(id))?.group_by === 'none', 'no grouping')
    expect(await db.views.get(id)).toMatchObject({ sort_by: 'priority', sort_dir: 'desc', group_by: 'none' })
    await r.unmount()
  })
})
