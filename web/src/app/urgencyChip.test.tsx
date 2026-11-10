// @vitest-environment happy-dom
// The urgency order on a project page (OpenSpec change urgency-sort): chosen in
// Display options it orders most urgent first and stores urgency, ascending;
// top-level rows show the score, which explains itself on focus and Enter; a
// blocker completed by another device moves the task it blocked up at once.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { logicalToday } from '../lib/dates'
import { setBlockedBy } from '../lib/dependencies'
import { setListDisplay } from '../lib/listDisplay'
import { applyOps, createProject, createSubtask, createTask, resetDeviceId } from '../lib/ops'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const titles = () => [...document.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent)
const chips = () => [...document.querySelectorAll<HTMLButtonElement>('[data-urgency-chip]')]

async function choose(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`[data-display-panel] select[aria-label="${label}"]`)!
  expect(select).toBeTruthy()
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Urgency order on a project page', () => {
  it('orders most urgent first from the panel and stores urgency, ascending: the default a client without it reads as its own order', async () => {
    const pid = await createProject({ name: 'Work' })
    await createTask({ title: 'Plain', project_id: pid })
    await createTask({ title: 'Today p1', project_id: pid, priority: 1, due: { date: logicalToday() } })
    await createTask({ title: 'Priority 3', project_id: pid, priority: 3 })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().length === 3, 'rows')
    expect(chips()).toHaveLength(0)
    await click(document.querySelector('[data-display-trigger]')!)
    await waitFor(() => !!document.querySelector('[data-display-panel] option[value="urgency"]'), 'the choice')
    await choose('Order by', 'urgency')
    await waitFor(() => titles().join() === 'Today p1,Priority 3,Plain', 'most urgent first')
    await waitFor(async () => (await db.prefs.get(pid))?.sort_by === 'urgency', 'stored')
    expect(await db.prefs.get(pid)).toMatchObject({ sort_by: 'urgency', sort_dir: 'asc' })
    // The direction reads in the order's own words; Least urgent first reverses it.
    await click(document.querySelector('[data-display-more]')!)
    const dir = document.querySelector<HTMLSelectElement>('[data-display-panel] select[aria-label="Sort direction"]')!
    expect([...dir.options].map((o) => o.textContent)).toEqual(['Most urgent first', 'Least urgent first'])
    await choose('Sort direction', 'desc')
    await waitFor(() => titles().join() === 'Plain,Priority 3,Today p1', 'least urgent first')
    await r.unmount()
  })

  it('shows the score on top-level rows, explains it on focus and Enter, and Escape returns focus', async () => {
    const pid = await createProject({ name: 'Work' })
    const parent = await createTask({ title: 'Trip', project_id: pid, priority: 1, due: { date: logicalToday() } })
    await createSubtask(parent, 'Pack')
    await setListDisplay({ kind: 'project', id: pid }, { sortBy: 'urgency' })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => chips().length === 1, 'one chip: the subtask has none')
    const chip = chips()[0]
    expect(chip.textContent).toBe('14.8')
    expect(chip.getAttribute('aria-label')).toBe('Urgency 14.8, show why')
    await act(async () => { chip.focus() })
    await waitFor(() => !!document.querySelector('[role="tooltip"]')?.textContent?.includes('Due today +8.80 · Priority 1 +6.00 = 14.80'), 'the breakdown in one line')
    await click(chip)
    await waitFor(() => !!document.querySelector('[data-urgency-breakdown]'), 'the popover')
    expect(document.querySelector('[data-urgency-breakdown]')!.textContent).toContain('Due today')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => !document.querySelector('[data-urgency-breakdown]'), 'closed')
    await waitFor(() => document.activeElement === chips()[0], 'focus back on the score')
    await r.unmount()
  })

  it('moves a task up at once when its blocker is completed on another device', async () => {
    const pid = await createProject({ name: 'Trip' })
    const visa = await createTask({ title: 'Visa', project_id: pid, priority: 3 })
    const flights = await createTask({ title: 'Book flights', project_id: pid, priority: 2 })
    await createTask({ title: 'Plain', project_id: pid })
    await setBlockedBy(flights, [visa])
    await setListDisplay({ kind: 'project', id: pid }, { sortBy: 'urgency' })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    // Visa 1.80 + 8 for blocking; Plain 0; Book flights 3.90 - 5 while blocked.
    await waitFor(() => titles().join() === 'Visa,Plain,Book flights', 'blocked last')
    const ts = Date.now() + 60_000
    await act(async () => {
      await applyOps([{ id: crypto.randomUUID(), entity: 'task', entityId: visa, field: 'completed_at', value: ts, ts, device: 'phone' }])
    })
    await waitFor(() => titles().join() === 'Book flights,Plain', 'unblocked, it moves up')
    await r.unmount()
  })

  it('shows no score in another order', async () => {
    const pid = await createProject({ name: 'Work' })
    await createTask({ title: 'A', project_id: pid, priority: 1 })
    await setListDisplay({ kind: 'project', id: pid }, { sortBy: 'priority' })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => titles().length === 1, 'rows')
    expect(chips()).toHaveLength(0)
    await r.unmount()
  })
})
