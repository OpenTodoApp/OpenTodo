// @vitest-environment happy-dom
// Nest subtasks in a saved view's List layout (GitHub issue 1108): the switch is the
// view's own and synced; a matching subtask sits under its matching parent and folds
// with it, one whose parent does not match keeps its path.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { createView, updateView } from '../lib/views'
import { click, flush, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
})

const titles = () => [...document.querySelectorAll('li[data-task-id]')].map((li) => `${li.getAttribute('data-depth') ?? '0'}:${li.querySelector('[data-row-title]')?.textContent}`)

describe('Nest subtasks in a saved view', () => {
  it('is a switch of the List layout that nests matching subtasks and folds them', async () => {
    const trip = await createTask({ title: 'Plan trip', priority: 1 })
    await createTask({ title: 'Book flights', priority: 1, parent_id: trip })
    const other = await createTask({ title: 'Garden', priority: 3 })
    await createTask({ title: 'Buy seeds', priority: 1, parent_id: other })
    const id = await createView({ name: 'Urgent', query: 'p1' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => titles().length === 3, 'three matches')
    expect(titles().every((s) => s.startsWith('0:'))).toBe(true)

    await click(document.querySelector('[data-display-trigger]')!)
    await click(document.querySelector('[data-display-subtasks] [role="switch"], [data-display-subtasks] input')!)
    await waitFor(async () => (await db.views.get(id))?.subtasks === 'nested', 'the switch is stored on the view')
    await waitFor(() => titles().includes('1:Book flights'), 'nested')
    expect(titles()).toContain('0:Plan trip')
    // Buy seeds' parent does not match: top-level, with its parent's path.
    expect(titles()).toContain('0:Buy seeds')
    const seeds = [...document.querySelectorAll('li[data-task-id]')].find((li) => li.textContent?.includes('Buy seeds'))!
    expect(seeds.textContent).toContain('Garden')

    const fold = document.querySelector(`li[data-task-id="${trip}"] button[aria-expanded]`) as HTMLButtonElement
    await click(fold)
    await waitFor(() => !titles().includes('1:Book flights'), 'folded')
    await flush()
    await r.unmount()
  })

  it('is not offered on the Board layout', async () => {
    await createTask({ title: 'Plan trip', priority: 1 })
    const id = await createView({ name: 'Urgent', query: 'p1' })
    await updateView(id, { layout: 'board' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => !!document.querySelector('[data-display-trigger]'), 'the view')
    await click(document.querySelector('[data-display-trigger]')!)
    expect(document.querySelector('[data-display-subtasks]')).toBeNull()
    await flush()
    await r.unmount()
  })
})
