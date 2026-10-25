// @vitest-environment happy-dom
// Display options on project and label pages (OpenSpec change list-display-options,
// issue #368): the panel in the header, groups and order applied at once and stored
// per project and per label, and a keyboard move under another order switching the
// project back to manual order.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setListDisplay } from '../lib/listDisplay'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const headings = () => [...document.querySelectorAll('[data-group-label]')].map((e) => e.textContent)
const titles = () => [...document.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent)

async function choose(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`[data-display-panel] select[aria-label="${label}"]`)!
  expect(select).toBeTruthy()
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flush(30)
}

describe('Display options on a project page', () => {
  it('groups by priority and orders by title from the panel, stored for this project', async () => {
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'Wash car', project_id: pid, priority: 2 })
    await createTask({ title: 'Call plumber', project_id: pid, priority: 1 })
    await createTask({ title: 'Buy bulbs', project_id: pid, priority: 2 })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().length === 3, 'rows')
    expect(titles()).toEqual(['Wash car', 'Call plumber', 'Buy bulbs'])
    await click(document.querySelector('[data-display-trigger]')!)
    const panel = document.querySelector('[data-display-panel]')!
    // The project's panel: grouping and order, no layout or row properties of a view.
    expect(panel.querySelector('[data-display-layout]')).toBeNull()
    expect([...panel.querySelectorAll('select[aria-label="Group by"] option')].map((o) => o.textContent)).toEqual(['Section', 'None', 'Due date', 'Priority', 'Label'])
    expect([...panel.querySelectorAll('select[aria-label="Order by"] option')].map((o) => o.textContent)).toEqual(['Manual order', 'Priority', 'Due date', 'Created', 'Deadline', 'Title'])
    await choose('Group by', 'priority')
    await choose('Order by', 'title')
    await waitFor(() => headings().join() === 'Priority 1,Priority 2', 'priority groups')
    expect(titles()).toEqual(['Call plumber', 'Buy bulbs', 'Wash car'])
    expect(await db.prefs.get(pid)).toMatchObject({ group_by: 'priority', sort_by: 'title' })
    await r.unmount()
  })

  it('a keyboard move under another order switches the project to manual order, then moves the task', async () => {
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'B', project_id: pid })
    await createTask({ title: 'A', project_id: pid })
    await setListDisplay({ kind: 'project', id: pid }, { sortBy: 'title' })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().join() === 'A,B', 'title order')
    await key(document.body, 'j')
    await key(document.body, 'ArrowDown', { altKey: true })
    await waitFor(async () => (await db.prefs.get(pid))?.sort_by === 'position', 'manual order')
    // Manual order again, with A moved below B.
    await waitFor(() => titles().join() === 'B,A', 'moved')
    await r.unmount()
  })
})

describe('Display options on a label page', () => {
  it('offers no grouping by label or section and stores the choice on the label', async () => {
    const lid = await createLabel({ name: 'errand' })
    await createTask({ title: 'Stamps', labels: [lid], priority: 3 })
    await createTask({ title: 'Bank', labels: [lid], priority: 1 })
    const r = await render(<TaskListView route={{ view: 'label', id: lid }} />)
    await waitFor(() => titles().length === 2, 'rows')
    await click(document.querySelector('[data-display-trigger]')!)
    expect([...document.querySelectorAll('[data-display-panel] select[aria-label="Group by"] option')].map((o) => o.textContent)).toEqual(['Project', 'None', 'Due date', 'Priority'])
    await choose('Order by', 'priority')
    await click(document.querySelector('[data-display-more]')!)
    await choose('Sort direction', 'desc')
    expect(await db.labels.get(lid)).toMatchObject({ sort_by: 'priority', sort_dir: 'desc', name: 'errand' })
    await waitFor(() => titles().join() === 'Bank,Stamps', 'priority 1 first')
    await r.unmount()
  })
})
