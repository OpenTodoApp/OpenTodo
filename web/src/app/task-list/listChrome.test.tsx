// @vitest-environment happy-dom
// The lists' empty views (OpenSpec change lean-chrome D7, task-list-presentation
// "Empty views"): one sentence, one primary action, at most one link, no icon and
// no printed key hint; the key is in the action's tooltip on fine pointers only.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setBlockedBy } from '../../lib/dependencies'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../../lib/ops'
import { loadShowCompleted } from '../../lib/sections'
import { click, flush, mockFetch, noPublicLinks, render } from '../../ui/test-utils'
import { TaskListView } from '../TaskListView'

const originalMatchMedia = window.matchMedia
function pointer(kind: 'fine' | 'coarse') {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('pointer') ? q.includes(kind) : q.includes('min-width'), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  mockFetch(noPublicLinks)
  pointer('coarse')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)

/** One region with the sentence as heading, one button, no icon and no printed key. */
function expectContract(empty: Element, title: string, action: string) {
  const region = empty.querySelector('section')!
  expect(region.querySelector('h2')!.textContent).toBe(title)
  expect(region.getAttribute('aria-labelledby')).toBe(region.querySelector('h2')!.id)
  expect(empty.querySelectorAll('.ui-btn')).toHaveLength(1)
  expect(empty.querySelector('[data-empty-action]')!.textContent).toBe(action)
  // No icon; a decorative illustration (design-system "Illustrations") is the one drawing allowed.
  expect(empty.querySelector('svg:not([data-illustration])')).toBeNull()
  expect(empty.querySelector('kbd')).toBeNull()
  expect(empty.querySelector('[data-empty-hint]')).toBeNull()
}

describe('empty views', () => {
  it('Empty Today on a phone: one sentence, Add a task, the Open Upcoming link, no icon and no key hint', async () => {
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => q('[data-empty-state="today"]') !== null)
    const empty = q('[data-empty-state="today"]')!
    expectContract(empty, 'Nothing due today.', 'Add a task')
    expect(empty.querySelector('[data-empty-secondary]')!.textContent).toBe('Open Upcoming')
    // Without a Shell to open the quick-add sheet, the view's own field takes focus.
    await click(empty.querySelector('[data-empty-action]')!)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add a task')
    await click(empty.querySelector('[data-empty-secondary]')!)
    expect(location.pathname).toBe('/upcoming')
    await r.unmount()
  })

  it('Empty Today on a desktop: the same sentence, button and link, nothing printed, "Press q" in the tooltip', async () => {
    pointer('fine')
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => q('[data-empty-state="today"]') !== null)
    const empty = q('[data-empty-state="today"]')!
    expectContract(empty, 'Nothing due today.', 'Add a task')
    const button = empty.querySelector('[data-empty-action]')!
    await act(async () => { button.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(q('[role="tooltip"]')!.textContent).toBe('Press q')
    await r.unmount()
  })

  it('Everything waits: "Nothing is ready to start today." with the link "3 waiting for other tasks" to Waiting', async () => {
    const blocker = await createTask({ title: 'Confirm dates' })
    for (const title of ['Book flights', 'Book hotel', 'Rent a car']) {
      const id = await createTask({ title, due: { date: '2026-10-14' } })
      await setBlockedBy(id, [blocker])
    }
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => q('[data-empty-state="today"] [data-empty-secondary]')?.textContent === '3 waiting for other tasks')
    const empty = q('[data-empty-state="today"]')!
    expectContract(empty, 'Nothing is ready to start today.', 'Add a task')
    expect(empty.querySelector('[data-empty-secondary]')!.textContent).toBe('3 waiting for other tasks')
    await click(empty.querySelector('[data-empty-secondary]')!)
    expect(location.pathname).toBe('/waiting')
    await r.unmount()
  })

  it('Project with completed tasks only: "Show 4 completed" turns the Completed group on', async () => {
    const pid = await createProject({ name: 'Groceries' })
    for (const title of ['Milk', 'Eggs', 'Bread', 'Apples']) await setTaskCompleted(await createTask({ title, project_id: pid }), true)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => q('[data-empty-state="project"] [data-empty-secondary]') !== null)
    const empty = q('[data-empty-state="project"]')!
    expectContract(empty, 'This project has no open tasks.', 'Add a task')
    expect(empty.querySelector('[data-empty-secondary]')!.textContent).toBe('Show 4 completed')
    await click(empty.querySelector('[data-empty-secondary]')!)
    await waitFor(() => !!r.container.querySelector('[data-completed-group]'))
    expect(await loadShowCompleted(pid)).toBe(true)
    await r.unmount()
  })

  it('Completed has no quick add: "Nothing completed yet." with Open Today', async () => {
    pointer('fine')
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => q('[data-empty-state="completed"]') !== null)
    const empty = q('[data-empty-state="completed"]')!
    expectContract(empty, 'Nothing completed yet.', 'Open Today')
    expect(empty.querySelector('[data-empty-secondary]')).toBeNull()
    await act(async () => { empty.querySelector('[data-empty-action]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(q('[role="tooltip"]')!.textContent).toBe('Press g t')
    await r.unmount()
  })

  it('every list view has its sentence and action', async () => {
    const pid = await createProject({ name: 'Home' })
    const cases = [
      [{ view: 'inbox' }, 'Inbox zero: every task has a place.', 'Add a task'],
      [{ view: 'upcoming' }, 'Nothing scheduled yet.', 'Add a task'],
      [{ view: 'anytime' }, 'Nothing waiting for a free moment.', 'Add a task'],
      [{ view: 'someday' }, 'Nothing parked for later.', 'Add a task'],
      [{ view: 'assigned' }, 'Nothing is assigned to you.', 'Open Inbox'],
      [{ view: 'project', id: pid }, 'This project has no open tasks.', 'Add a task'],
    ] as const
    for (const [route, title, action] of cases) {
      const r = await render(<TaskListView route={route} userId="u1" />)
      await waitFor(() => q(`[data-empty-state="${route.view}"]`) !== null)
      const empty = q(`[data-empty-state="${route.view}"]`)!
      expectContract(empty, title, action)
      expect(empty.querySelector('[data-empty-secondary]')).toBeNull()
      await r.unmount()
    }
  })
})
