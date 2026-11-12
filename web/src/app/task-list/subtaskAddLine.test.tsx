// @vitest-environment happy-dom
// quick-subtask-add (GitHub issue 1191): the muted "Add a subtask" line at the end
// of a parent's visible subtasks in tree lists — shown for the selected parent or
// under the pointer (index.css), a ghost that swaps to the same input `a` opens;
// none for childless, folded, completed, read-only or departing rows.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createSubtask, createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { resetTaskPage } from '../taskPage.testkit'
import { TaskListView } from '../TaskListView'

beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  resetPanel()
  resetTaskPage()
  localStorage.clear()
  history.replaceState(null, '', '/')
})
afterEach(() => {
  resetPanel()
  vi.unstubAllGlobals()
})

const row = (title: string) => [...document.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.querySelector('[data-row-title]')?.textContent === title)!
const addLines = () => [...document.querySelectorAll<HTMLElement>('[data-subtask-add-line]')]
const addInput = () => document.querySelector<HTMLInputElement>('[data-add-line] input')
const shownLine = () => document.querySelector<HTMLElement>('[data-subtask-add-line][data-line-selected]')

async function typeLine(input: HTMLInputElement, title: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, title)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { input.form!.requestSubmit() })
}

async function projectView(...titles: string[]) {
  const pid = await createProject({ name: 'Home' })
  const parent = await createTask({ title: 'Plan trip', project_id: pid })
  const subs: string[] = []
  for (const title of titles) subs.push(await createSubtask(parent, title))
  const r = await render(<main><TaskListView route={{ view: 'project', id: pid }} /></main>)
  await waitFor(() => document.querySelectorAll('li[data-task-id]').length >= titles.length + 1, 'the rows')
  return { pid, parent, subs, r }
}

describe('add-subtask line in lists (issue 1191)', () => {
  it('shows for the selected parent under its last subtask; the ghost opens the input, Enter adds above it and it stays, Escape hands focus back', async () => {
    const { parent, subs, r } = await projectView('Flights', 'Hotel')
    await createTask({ title: 'Buy milk', project_id: (await db.tasks.get(parent))!.project_id })
    await waitFor(() => document.querySelectorAll('li[data-task-id]').length === 4, 'all rows')
    // Only the parent with visible subtasks has a line, and nothing shows until its row is selected.
    expect(addLines().length).toBe(1)
    expect(shownLine()).toBeNull()
    const line = addLines()[0].closest('li')!
    expect(line.previousElementSibling?.getAttribute('data-task-id')).toBe(subs[1])
    await key(document.body, 'j')
    await waitFor(() => shownLine() === addLines()[0], 'the line shown for the selected parent')
    await click(addLines()[0].querySelector('button')!)
    await waitFor(() => !!addInput() && document.activeElement === addInput(), 'the input focused')
    await typeLine(addInput()!, 'Insurance')
    await waitFor(() => !!row('Insurance'), 'the new subtask')
    // The line moved under the new last subtask and the input stayed for the next entry.
    await waitFor(() => addInput()?.closest('li')?.previousElementSibling?.textContent?.includes('Insurance') ?? false, 'the line under Insurance')
    act(() => { addInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await waitFor(() => !addInput() && addLines().length === 1, 'the ghost back')
    // Focus went back to the line's button, not the page.
    expect(document.activeElement).toBe(addLines()[0].querySelector('button'))
    await r.unmount()
  })

  it('stacks innermost-first lines where nested subtrees end at the same row, shown for whichever parent is selected', async () => {
    const pid = await createProject({ name: 'Home' })
    const parent = await createTask({ title: 'Plan trip', project_id: pid })
    const hotel = await createSubtask(parent, 'Hotel')
    await createSubtask(hotel, 'Compare prices')
    const r = await render(<main><TaskListView route={{ view: 'project', id: pid }} /></main>)
    await waitFor(() => addLines().length === 2, 'both lines')
    const labels = addLines().map((b) => b.querySelector('button')!.getAttribute('aria-label'))
    expect(labels).toEqual([
      expect.stringContaining('Hotel'),
      expect.stringContaining('Plan trip'),
    ])
    await key(document.body, 'j')
    await waitFor(() => shownLine()?.querySelector('button')!.getAttribute('aria-label')?.includes('Plan trip') ?? false, "Plan trip's line")
    await key(document.body, 'j')
    await waitFor(() => shownLine()?.querySelector('button')!.getAttribute('aria-label')?.includes('Hotel') ?? false, "Hotel's line")
    expect(addLines().filter((l) => l.hasAttribute('data-line-selected')).length).toBe(1)
    await r.unmount()
  })

  it('shows no line for a folded parent or a completed one', async () => {
    const pid = await createProject({ name: 'Home' })
    const parent = await createTask({ title: 'Plan trip', project_id: pid })
    await createSubtask(parent, 'Flights')
    const done = await createTask({ title: 'Already done', project_id: pid, completed: true })
    await createSubtask(done, 'Packed')
    const r = await render(<main><TaskListView route={{ view: 'project', id: pid }} /></main>)
    await waitFor(() => !!row('Flights'), 'the rows')
    // The completed parent's subtasks list gets no line; the open one does.
    expect(addLines().length).toBe(1)
    // Fold the parent's subtasks: the line leaves with the hidden list.
    await key(document.body, 'j')
    await key(document.activeElement ?? document.body, 'ArrowLeft')
    await waitFor(() => !row('Flights'), 'the subtasks folded')
    await waitFor(() => addLines().length === 0, 'no lines while folded')
    await r.unmount()
  })

  it('shows no line to a viewer', async () => {
    const { pid, r } = await projectView('Flights')
    await db.memberships.put({ projectId: pid, role: 'viewer', ownerId: 'someone', members: [] })
    await waitFor(() => addLines().length === 0, 'no line for a viewer')
    await r.unmount()
  })

  it('shows no line in a flat view', async () => {
    const today = new Date()
    const due = { date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` }
    const parent = await createTask({ title: 'Pay rent', due })
    await createTask({ title: 'Call the agent', due, parent_id: parent })
    const r = await render(<main><TaskListView route={{ view: 'today' }} /></main>)
    await waitFor(() => document.querySelectorAll('li[data-task-id]').length === 2, 'the flat rows')
    expect(addLines().length).toBe(0)
    await r.unmount()
  })

  it('keeps one line while the last subtask departs, and closes the input when the fold hides the line', async () => {
    const { subs, r } = await projectView('Flights', 'Hotel')
    await waitFor(() => addLines().length === 1, 'the line')
    // Open it, then fold the parent: the input goes away with the line and does not come back.
    await key(document.body, 'j')
    await waitFor(() => !!shownLine(), 'the line shown')
    await click(shownLine()!.querySelector('button')!)
    await waitFor(() => !!addInput(), 'the input open')
    await click(row('Plan trip').querySelector('[aria-label="Collapse subtasks"]')!)
    await waitFor(() => !row('Flights'), 'the subtasks folded')
    await waitFor(() => addLines().length === 0 && !addInput(), 'the open line folded away')
    await click(row('Plan trip').querySelector('[aria-label="Expand subtasks"]')!)
    await waitFor(() => addLines().length === 1, 'unfolded again')
    expect(addInput()).toBeNull()
    // Tick off the last subtask: while its ghost departs, the parent keeps one line, not two.
    await click(row('Hotel').querySelector('[aria-label^="Complete"]')!)
    await waitFor(() => !!document.querySelector('li[data-departing]'), 'the departing row')
    expect(addLines().length).toBe(1)
    expect(addLines()[0].closest('li')!.previousElementSibling?.getAttribute('data-task-id')).toBe(subs[0])
    await r.unmount()
  })
})
