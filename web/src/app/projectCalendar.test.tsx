// @vitest-environment happy-dom
// A project's Calendar layout (OpenSpec change calendar-clarity, design D5; GitHub
// issue 556; task 4.3): Calendar after Timeline in the layout switch, the Calendar in
// its last mode narrowed to the project and its sub-projects inside the project page,
// range moves that stay in the page, and `v` cycling List, Board, Timeline, Calendar.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { loadViewMode, saveViewMode } from '../lib/sections'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { readTray } from './calendar/planSource'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wednesday 18 November 2026; the week runs Monday 16 to Sunday 22.
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  // Calendar events answer 404 (no subscriptions); the header's public links, none.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  mockFetch(noPublicLinks)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

async function seed() {
  const home = await createProject({ name: 'Home' })
  const kitchen = await createProject({ name: 'Kitchen', parent_id: home })
  const work = await createProject({ name: 'Work' })
  const ids = {
    home: await createTask({ title: 'Fix the door', project_id: home, due: { date: '2026-11-17', time: '10:00' } }),
    kitchen: await createTask({ title: 'Paint the wall', project_id: kitchen, due: { date: '2026-11-19', time: '15:00' } }),
    work: await createTask({ title: 'Quarterly report', project_id: work, due: { date: '2026-11-18', time: '09:00' } }),
    nextWeek: await createTask({ title: 'Buy tiles', project_id: kitchen, due: { date: '2026-11-24', time: '11:00' } }),
  }
  return { home, ids }
}

const blocks = (root: ParentNode) => [...root.querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))

describe('a project\'s Calendar layout', () => {
  it('shows this week with only the tasks of the project and its sub-projects, inside the project page', async () => {
    const { home, ids } = await seed()
    localStorage.setItem('ot.calendar.mode', 'week')
    await saveViewMode(home, 'calendar')
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => blocks(r.container).length === 2, 'the project\'s blocks')
    expect(blocks(r.container).sort()).toEqual([ids.home, ids.kitchen].sort())
    expect(r.container.querySelector(`[data-project-calendar="${home}"]`)).toBeTruthy()
    // The project header stays, with Calendar pressed after Timeline.
    expect(r.container.querySelector('[data-project-name]')!.textContent).toBe('Home')
    const layouts = [...r.container.querySelectorAll('[role="group"][aria-label="Project layout"] button')]
    expect(layouts.map((b) => b.textContent)).toEqual(['List', 'Board', 'Timeline', 'Calendar'])
    expect(layouts[3].getAttribute('aria-pressed')).toBe('true')
    // No filter chip for the project's own narrowing.
    expect(r.container.querySelector('[data-query-filter-chip]')).toBeNull()

    // Next week stays in the project page.
    const path = location.pathname
    await click(r.container.querySelector('[aria-label="Next week"]')!)
    await waitFor(() => blocks(r.container).includes(ids.nextWeek), 'next week')
    expect(location.pathname).toBe(path)

    // Plan from a list opens on the project.
    await click(r.container.querySelector('[data-calendar-options]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Plan from a list"]'), 'the calendar options')
    await click(document.querySelector('[data-menu-label="Plan from a list"]')!)
    expect(readTray()).toBe(`project:${home}`)
    await r.unmount()
  })

  it('combines with the calendar\'s filter', async () => {
    const { home, ids } = await seed()
    localStorage.setItem('ot.calendar.mode', 'week')
    await saveViewMode(home, 'calendar')
    await setMeta('calendar.filter', '#Kitchen')
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => blocks(r.container).length === 1, 'one block')
    expect(blocks(r.container)).toEqual([ids.kitchen])
    expect(r.container.querySelector('[data-query-filter-chip]')).toBeTruthy()
    await r.unmount()
  })

  it('v goes from Timeline to Calendar and from Calendar back to List', async () => {
    const { home } = await seed()
    await saveViewMode(home, 'timeline')
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => !!r.container.querySelector('[data-project-name]'), 'the project')
    await key(document.body, 'v')
    await waitFor(() => !!r.container.querySelector('[data-project-calendar]'), 'the calendar layout')
    expect(await loadViewMode(home)).toBe('calendar')
    await key(document.body, 'v')
    await waitFor(async () => (await loadViewMode(home)) === 'list', 'the list again')
    await waitFor(() => !r.container.querySelector('[data-project-calendar]'), 'the list shown')
    await r.unmount()
  })

  it('an unknown stored layout reads as the list, as an older device reads Calendar', async () => {
    const { home } = await seed()
    await setMeta(`view-mode:${home}`, 'gantt')
    expect(await loadViewMode(home)).toBe('list')
    await saveViewMode(home, 'calendar')
    expect(await getMeta(`view-mode:${home}`, '')).toBe('calendar')
  })
})
