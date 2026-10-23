// @vitest-environment happy-dom
// The filter builder on its two screens (OpenSpec change filter-builder, tasks
// 3.1 and 3.2): open by default in the Filter view and remembered per device,
// closed by default on a saved filter, whose draft it edits and counts.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { createView } from '../../lib/views'
import { click, render, type, waitFor } from '../../ui/test-utils'
import { FilterView } from '../FilterView'
import { SavedViewRoute } from '../SavedViewView'

let n = 0
beforeEach(() => {
  useDatabase(`filter-builder-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const editor = () => document.querySelector('[data-testid="condition-editor"]') as HTMLElement | null

async function choose(sel: HTMLSelectElement, value: string) {
  sel.value = value
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 0))
}

describe('Filter view', () => {
  it('shows the builder, follows the typed query and remembers the toggle on this device', async () => {
    await createTask({ title: 'Plan sprint', priority: 1 })
    const r = await render(<FilterView />)
    expect(r.container.querySelector('[data-filter-builder]')).not.toBeNull()
    const input = r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement
    await type(input, 'p1')
    await waitFor(() => r.container.textContent?.includes('Priority is P1') ?? false, 'the condition chip')
    await waitFor(() => r.container.querySelector('[data-filter-count]')?.textContent === '1 task matches', 'the count')
    await click(button(r.container, 'Builder'))
    expect(r.container.querySelector('[data-filter-builder]')).toBeNull()
    expect(localStorage.getItem('opentodo.filterBuilder.filter')).toBe('closed')
    await r.unmount()
    const again = await render(<FilterView />)
    expect(again.container.querySelector('[data-filter-builder]')).toBeNull()
    await again.unmount()
  })
})

describe('Saved filter', () => {
  it('edits the draft with the builder, counts it, and saves the text', async () => {
    await createTask({ title: 'Call the bank', priority: 1 })
    await createTask({ title: 'Someday call', priority: 1, start: 'someday' })
    const id = await createView({ name: 'Calls', query: 'p1' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => r.container.textContent?.includes('Calls') ?? false, 'the view')
    // Closed by default on a saved filter.
    expect(r.container.querySelector('[data-filter-builder]')).toBeNull()
    await click(button(r.container, 'Builder'))
    await waitFor(() => !!r.container.querySelector('[data-filter-builder]'), 'the builder')
    await click(r.container.querySelector('[data-add-condition]') as HTMLButtonElement)
    await waitFor(() => !!editor(), 'the condition dialog')
    const selects = () => editor()!.querySelectorAll('select')
    await choose(selects()[0], 'state')
    await choose(selects()[1], 'someday')
    await click(editor()!.querySelector('[role="switch"]') as HTMLElement)
    await click(button(editor()!, 'Add'))
    const input = r.container.querySelector('input[aria-label="View query"]') as HTMLInputElement
    await waitFor(() => input.value === 'p1 & !someday', 'the draft')
    expect(r.container.querySelector('[data-filter-count]')?.textContent).toBe('1 task matches')
    await click(button(r.container, 'Save'))
    await waitFor(async () => (await db.views.get(id))?.query === 'p1 & !someday', 'the stored query')
    await r.unmount()
  })
})
