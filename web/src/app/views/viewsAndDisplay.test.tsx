// @vitest-environment happy-dom
// Views and their display options (OpenSpec change views-and-display): the toolbar's
// chips, the display panel writing to the view, the board layout, hidden properties,
// completed tasks, Save as view in place and the addresses.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId, setTaskCompleted } from '../../lib/ops'
import { createView } from '../../lib/views'
import { click, render, type, waitFor } from '../../ui/test-utils'
import { FilterView } from '../FilterView'
import { SavedViewRoute } from '../SavedViewView'
import { canonicalPath, parseRoute, routePath } from '../router'
import { queryChips } from './FilterChips'

let n = 0
beforeEach(() => {
  useDatabase(`views-display-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  history.replaceState(null, '', '/')
})
afterEach(() => {
  document.body.innerHTML = ''
})

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const panel = () => document.querySelector('[data-display-panel]') as HTMLElement | null
const titles = (root: ParentNode) => [...root.querySelectorAll('[data-task-id] [data-row-title]')].map((x) => x.textContent?.trim())

async function choose(sel: HTMLSelectElement, value: string) {
  sel.value = value
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 0))
}

describe('toolbar chips', () => {
  it('one chip per condition of an "All of these" query, one for any other query', () => {
    expect(queryChips('@waiting & !@someday & (#Work | #Home)').map((c) => [c.text, c.not])).toEqual([
      ['Label is waiting', false], ['Label is someday', true], ['Any of 2 conditions', false],
    ])
    expect(queryChips('p1 | p2').map((c) => c.text)).toEqual(['Any of 2 conditions'])
    expect(queryChips('!!p1').map((c) => c.text)).toEqual(['Custom query'])
    expect(queryChips('p1 &')).toEqual([])
    expect(queryChips('')).toEqual([])
  })
})

describe('a saved view', () => {
  it('shows its conditions as chips, and the display panel writes layout, properties and completed tasks to the view', async () => {
    await createTask({ title: 'Call the bank', priority: 1, estimate_minutes: 30 })
    const done = await createTask({ title: 'Call the plumber', priority: 1 })
    await setTaskCompleted(done, true)
    const id = await createView({ name: 'Calls', query: 'p1' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => titles(r.container).length === 1, 'the open match')
    expect(r.container.querySelector('[data-views-crumb]')?.textContent).toBe('ViewsCalls')
    expect([...r.container.querySelectorAll('[data-toolbar-chip]')].map((c) => c.textContent)).toEqual(['Priority is P1'])
    // The filter panel is closed by default on a saved view.
    expect(r.container.querySelector('[data-filter-panel]')).toBeNull()
    expect(r.container.querySelector('[data-row-meta]')?.textContent).toContain('30m')

    await click(r.container.querySelector('[data-display-trigger]') as HTMLButtonElement)
    await waitFor(() => !!panel(), 'the display panel')
    await click(panel()!.querySelector('[data-prop="estimate"]') as HTMLButtonElement)
    await waitFor(async () => (await db.views.get(id))?.hidden_props?.join() === 'estimate', 'the hidden estimate')
    await waitFor(() => !(r.container.querySelector('[data-task-id]')?.textContent ?? '').includes('30m'), 'the row without its estimate')

    await choose(panel()!.querySelector('select[aria-label="Completed tasks"]') as HTMLSelectElement, 'show')
    await waitFor(() => titles(r.container).length === 2, 'the completed match')
    expect((await db.views.get(id))?.show_completed).toBe(true)

    await click(panel()!.querySelector('[data-layout="board"]') as HTMLButtonElement)
    await waitFor(() => !!r.container.querySelector('[data-view-board] [data-column]'), 'the board')
    expect((await db.views.get(id))?.layout).toBe('board')
    expect(r.container.querySelectorAll('[data-view-board] [data-task-id]')).toHaveLength(2)
    await r.unmount()
  })

  it('"Filter" opens the filter panel on a new condition, and / focuses the query', async () => {
    const id = await createView({ name: 'Calls', query: 'p1' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => !!r.container.querySelector('[data-toolbar-add]'), 'the toolbar')
    await click(r.container.querySelector('[data-toolbar-add]') as HTMLButtonElement)
    await waitFor(() => !!document.querySelector('[data-testid="condition-editor"]'), 'the condition editor')
    expect(r.container.querySelector('[data-filter-panel] input[aria-label="View query"]')).not.toBeNull()
    expect(localStorage.getItem('opentodo.filterBuilder.view')).toBe('open')
    await r.unmount()
  })
})

describe('the New view page', () => {
  it('saves the query with its display options from the header card', async () => {
    await createTask({ title: 'Plan sprint', priority: 1 })
    const r = await render(<FilterView />)
    expect(r.container.querySelector('[data-views-crumb]')?.textContent).toBe('ViewsNew view')
    await type(r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement, 'p1')
    await waitFor(() => titles(r.container).length === 1, 'the result')
    await click(r.container.querySelector('[data-display-trigger]') as HTMLButtonElement)
    await waitFor(() => !!panel(), 'the display panel')
    await choose(panel()!.querySelector('select[aria-label="Group by"]') as HTMLSelectElement, 'priority')
    await waitFor(() => (r.container.querySelector('[data-group-label]')?.textContent ?? '') === 'Priority 1', 'grouped by priority')

    await click(button(r.container, 'Save as view'))
    const name = r.container.querySelector('input[aria-label="View name"]') as HTMLInputElement
    expect(document.activeElement).toBe(name)
    // Results and conditions stay in sight while naming.
    expect(titles(r.container)).toEqual(['Plan sprint'])
    await type(name, 'Urgent')
    await click(button(r.container, 'Save view'))
    await waitFor(async () => (await db.views.count()) === 1, 'the saved view')
    const [v] = await db.views.toArray()
    expect(v).toMatchObject({ name: 'Urgent', query: 'p1', group_by: 'priority', pinned: true })
    await waitFor(() => location.pathname === `/views/${v.id}`, 'the view opens')
    await r.unmount()
  })

  it('Esc in the card cancels without saving', async () => {
    const r = await render(<FilterView />)
    await type(r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement, 'p1')
    await waitFor(() => !button(r.container, 'Save as view').disabled, 'saving allowed')
    await click(button(r.container, 'Save as view'))
    const name = r.container.querySelector('input[aria-label="View name"]') as HTMLInputElement
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => !r.container.querySelector('[data-save-view-card]'), 'the card closes')
    expect(await db.views.count()).toBe(0)
    expect(button(r.container, 'Save as view')).toBeTruthy()
    await r.unmount()
  })
})

describe('addresses', () => {
  it('/views/new and /views/<id>, with /filter and /view/<id> replaced in place', () => {
    expect(parseRoute('/views')).toEqual({ view: 'views' })
    expect(parseRoute('/views/new')).toEqual({ view: 'filter' })
    expect(parseRoute('/views/abc')).toEqual({ view: 'view', id: 'abc' })
    expect(parseRoute('/view/abc')).toEqual({ view: 'view', id: 'abc' })
    expect(routePath({ view: 'view', id: 'abc' })).toBe('/views/abc')
    expect(routePath({ view: 'filter' })).toBe('/views/new')
    expect(canonicalPath('/view/abc')).toBe('/views/abc')
    expect(canonicalPath('/filter')).toBe('/views/new')
    expect(canonicalPath('/views/abc')).toBeNull()
  })
})
