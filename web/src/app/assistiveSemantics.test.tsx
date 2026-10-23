// @vitest-environment happy-dom
// Lists for assistive technology (OpenSpec assistive-tech-semantics): the keyboard
// cursor is real focus on the row, the subtask hierarchy is exposed with aria-level,
// aria-posinset and aria-setsize, and every complete button names its task.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { flush, key, mockFetch, noPublicLinks, render, spokenText, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const rowOf = (root: Element, title: string) =>
  [...root.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.querySelector('[data-row-title]')?.textContent === title)!

async function project() {
  const pid = await createProject({ name: 'Home' })
  const trip = await createTask({ title: 'Plan trip', project_id: pid })
  await createTask({ title: 'Book flights', project_id: pid, parent_id: trip })
  await createTask({ title: 'Pack', project_id: pid, parent_id: trip })
  await createTask({ title: 'Water plants', project_id: pid })
  return pid
}

describe('list semantics', () => {
  it('rows carry their level and their place among their siblings', async () => {
    const pid = await project()
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.querySelectorAll('li[data-task-id]').length === 4, 'four rows')
    const attrs = (title: string) => {
      const li = rowOf(r.container, title)
      return [li.getAttribute('aria-level'), li.getAttribute('aria-posinset'), li.getAttribute('aria-setsize')]
    }
    expect(attrs('Plan trip')).toEqual(['1', '1', '2'])
    expect(attrs('Book flights')).toEqual(['2', '1', '2'])
    expect(attrs('Pack')).toEqual(['2', '2', '2'])
    expect(attrs('Water plants')).toEqual(['1', '2', '2'])
    await r.unmount()
  })

  it('complete buttons name their task', async () => {
    const pid = await project()
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.querySelectorAll('li[data-task-id]').length === 4, 'four rows')
    expect(rowOf(r.container, 'Pack').querySelector('[data-row-controls] button')!.getAttribute('aria-label')).toBe('Complete Pack')
    await r.unmount()
  })

  it('the keyboard cursor moves focus to the row, and leaves focus alone when it is elsewhere', async () => {
    const pid = await project()
    const r = await render(<><TaskListView route={{ view: 'project', id: pid }} /><aside data-detail-for="x"><button type="button" data-elsewhere>Panel</button></aside></>)
    await waitFor(() => r.container.querySelectorAll('li[data-task-id]').length === 4, 'four rows')
    await flush(20)
    await key(document.body, 'j')
    await flush(20)
    const first = rowOf(r.container, 'Plan trip')
    expect(first.getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(first.querySelector('[data-row-open]'))
    // From the focused row, j moves on and focus follows.
    await key(document.activeElement!, 'j')
    await flush(20)
    const second = rowOf(r.container, 'Book flights')
    expect(document.activeElement).toBe(second.querySelector('[data-row-open]'))
    expect(first.hasAttribute('aria-current')).toBe(false)
    // Focus in the panel stays there while the cursor moves.
    const panel = r.container.querySelector<HTMLButtonElement>('[data-elsewhere]')!
    panel.focus()
    await key(panel, 'j')
    await flush(20)
    expect(rowOf(r.container, 'Pack').getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(panel)
    await r.unmount()
  })
})

describe('row text for screen readers', () => {
  const task = (over: Partial<Task>): Task => ({
    id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
  } as Task)

  it('the open button reads the title, its marks and its line; an undecryptable title is read as the warning', async () => {
    // The counts sit beside the title inside the open button and are read with it (precision-rows D1).
    const c = await render(<ul><TaskRow task={task({ title: 'Buy milk', description: 'two litres' })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const open = spokenText(c.container.querySelector('[data-row-open]')!)
    expect([open.startsWith('Buy milk'), open.endsWith('Has notes')]).toEqual([true, true])
    expect(c.container.querySelector('[data-row-controls] button')!.getAttribute('aria-label')).toBe('Complete Buy milk')
    expect(spokenText(c.container.querySelector('[data-row-counts]')!)).toBe('Has notes')
    await c.unmount()
    const e = await render(<ul><TaskRow task={task({ title: 'b64:AAAA', _e2ee: { raw: { title: 'b64:AAAA' } } } as Partial<Task>)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(spokenText(e.container.querySelector('[data-row-title]')!)).toBe("This title could not be decrypted with this device's key")
    // The ciphertext is never read out as the task's name.
    expect(e.container.querySelector('[data-row-controls] button')!.getAttribute('aria-label')).toBe('Complete Untitled')
    await e.unmount()
  })
})
