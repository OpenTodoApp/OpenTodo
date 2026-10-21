// @vitest-environment happy-dom
// The interface budget (OpenSpec change ux-overhaul, design-system "Interface
// budget", app-shell "Three columns, three scrollers"): measurable limits every
// screen change must stay inside. Two of them are checked here over seeded
// fixtures; the last one (primary sidebar items) arrives with task 4.1.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createComment } from '../lib/comments'
import { setCurrentUserId } from '../lib/sharing'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { TaskListView } from './TaskListView'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

/** At most the sidebar, the content column and the panel scroll vertically. */
export const MAX_SCROLLERS = 3
/** Above the first task of a list: the header and the quick add, nothing else. */
export const MAX_CHROME_ROWS = 2
/** The project page keeps its header, layout toggle and quick add until task 4.4 moves the toggle into the header. */
const PROJECT_CHROME_ALLOWANCE = 3
/** An empty task's panel: the breadcrumb, Do on, Priority and Add, never a form of empty rows. */
export const MAX_EMPTY_TASK_ITEMS = 7
/** A Calm row in Today: at most four metadata items at full contrast; the counts are quiet (calm-rows D10). */
export const MAX_CALM_ROW_ITEMS = 4

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

/** Elements that scroll vertically on their own, outside designated regions and overlays. */
export function scrollers(root: ParentNode): Element[] {
  return [...root.querySelectorAll('*')].filter((el) => /\boverflow-y-auto\b|\boverflow-auto\b|\boverflow-y-scroll\b/.test(el.className) && !el.closest('[data-scroll-y], [data-overlay-root], [data-overlay]'))
}

/** The list page's children before the one holding its first task row. */
export function chromeRows(root: ParentNode): Element[] {
  const page = root.querySelector('[data-list-page]')
  if (!page) return []
  const out: Element[] = []
  for (const child of page.children) {
    if (child.querySelector('[data-task-id]')) break
    out.push(child)
  }
  return out
}

async function seed() {
  const project = await createProject({ name: 'Home' })
  await createLabel({ name: 'errand' })
  for (let i = 0; i < 12; i++) await createTask({ title: `Inbox task ${i}`, due: i % 3 === 0 ? { date: '2026-10-14' } : i % 3 === 1 ? { date: '2026-10-20' } : null })
  for (let i = 0; i < 8; i++) await createTask({ title: `Home task ${i}`, project_id: project, estimate_minutes: 30 })
  return { project }
}

describe('scroll regions', () => {
  it('the shell has at most three vertical scrollers with a task open, in every list view', async () => {
    const { project } = await seed()
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Inbox task 11'))
    expect(scrollers(r.container).length).toBeLessThanOrEqual(MAX_SCROLLERS)
    for (const route of [{ view: 'inbox' } as const, { view: 'today' } as const, { view: 'upcoming' } as const, { view: 'project', id: project } as const]) {
      navigate(route)
      await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
      const row = r.container.querySelector<HTMLElement>('[data-task-id] button.min-w-0')!
      row.click()
      await waitFor(() => !!document.querySelector('aside[data-detail-for]'))
      const found = scrollers(document.body)
      expect(found.length, `${route.view}: ${found.map((e) => e.className).join(' | ')}`).toBeLessThanOrEqual(MAX_SCROLLERS)
    }
    await r.unmount()
  })
})

describe('the Focus screen (focus-mode)', () => {
  it('Phone width: one row of chrome above the timer, and no scroll region of its own', async () => {
    const id = await createTask({ title: 'Write the report', description: Array.from({ length: 80 }, (_, i) => `Line ${i} of long notes.`).join('\n\n') })
    navigate({ view: 'focus', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!r.container.querySelector('[data-focus-timer]'))
    const page = r.container.querySelector('[data-focus]')!
    const before: Element[] = []
    for (const child of page.children) {
      if (child.querySelector('[data-focus-timer]') || child.matches('[data-focus-timer]')) break
      if (!child.classList.contains('sr-only')) before.push(child)
    }
    expect(before.map((e) => e.tagName)).toEqual(['HEADER'])
    expect(scrollers(page)).toEqual([])
    expect(scrollers(r.container).length).toBeLessThanOrEqual(MAX_SCROLLERS)
    await r.unmount()
  })
})

describe('Statistics (stats-dashboard)', () => {
  it('nothing between the header and the tiles, and no vertical scroll region of its own', async () => {
    await createTask({ title: 'Done', due: { date: '2026-10-13' } })
    navigate({ view: 'stats' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!r.container.querySelector('[data-stats-content] [data-testid="stats-tiles"]'))
    const page = r.container.querySelector('[data-stats-page]')!
    expect([...page.children].map((e) => e.tagName)).toEqual(['HEADER', 'DIV'])
    expect(page.children[1].firstElementChild!.getAttribute('data-testid')).toBe('stats-tiles')
    expect(scrollers(page)).toEqual([])
    expect(scrollers(r.container).length).toBeLessThanOrEqual(MAX_SCROLLERS)
    await r.unmount()
  })
})

describe('the Plan (planner-view)', () => {
  it('one row of chrome above the columns, and no scroll region of its own', async () => {
    await createTask({ title: 'Planned', due: { date: '2026-10-15' }, estimate_minutes: 30 })
    navigate({ view: 'plan' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!r.container.querySelector('[data-plan-grid] [data-plan-task]'))
    const page = r.container.querySelector('[data-calendar-page="plan"]')!
    const before: Element[] = []
    for (const child of page.children) {
      if (child.matches('[data-plan-grid], [data-plan-agenda]')) break
      if (!child.classList.contains('sr-only')) before.push(child)
    }
    expect(before.map((e) => e.tagName)).toEqual(['HEADER'])
    expect(scrollers(page)).toEqual([])
    expect(scrollers(r.container).length).toBeLessThanOrEqual(MAX_SCROLLERS)
    await r.unmount()
  })
})

describe('chrome above the first task', () => {
  it('flat lists have the header and the quick add only; the project page stays within its allowance', async () => {
    const { project } = await seed()
    for (const route of [{ view: 'inbox' } as const, { view: 'today' } as const, { view: 'upcoming' } as const]) {
      const r = await render(<TaskListView route={route} />)
      await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
      const rows = chromeRows(r.container)
      expect(rows.length, `${route.view}: ${rows.map((e) => e.outerHTML.slice(0, 60)).join(' | ')}`).toBeLessThanOrEqual(MAX_CHROME_ROWS)
      await r.unmount()
    }
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
    expect(chromeRows(r.container).length).toBeLessThanOrEqual(PROJECT_CHROME_ALLOWANCE)
    await r.unmount()
  })

  it('no help control inside the list page outside the page header: the quick add has none (lean-chrome D1)', async () => {
    const { project } = await seed()
    for (const route of [{ view: 'inbox' } as const, { view: 'today' } as const, { view: 'upcoming' } as const, { view: 'project', id: project } as const]) {
      const r = await render(<TaskListView route={route} />)
      await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
      const page = r.container.querySelector('[data-list-page]')!
      const header = page.firstElementChild!
      const strays = [...page.querySelectorAll('[data-help-screen]')].filter((el) => !header.contains(el))
      expect(strays.map((e) => e.outerHTML.slice(0, 80)), route.view).toEqual([])
      await r.unmount()
    }
  })

  it('a fresh account\'s Inbox holds the header, the quick add and the empty view only; no start guide inside it (lean-chrome D9)', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-empty-state="inbox"]'))
    const page = r.container.querySelector('[data-list-page]')!
    const before: Element[] = []
    for (const child of page.children) {
      if (child.matches('[data-empty-state]') || child.querySelector('[data-empty-state]')) break
      before.push(child)
    }
    expect(before.length, before.map((e) => e.outerHTML.slice(0, 60)).join(' | ')).toBeLessThanOrEqual(MAX_CHROME_ROWS)
    expect(page.querySelector('[data-first-run]')).toBeNull()
    await r.unmount()
  })

  it('catches a banner injected between the header and the list', async () => {
    await seed()
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
    const page = r.container.querySelector('[data-list-page]')!
    const banner = document.createElement('div')
    banner.textContent = 'Try the new thing'
    page.insertBefore(banner, page.children[2])
    expect(chromeRows(r.container).length).toBeGreaterThan(MAX_CHROME_ROWS)
    await r.unmount()
  })
})

describe('visible properties', () => {
  it('an empty task shows at most seven items in the panel', async () => {
    await createTask({ title: 'Blank' })
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => r.container.textContent!.includes('Blank'))
    r.container.querySelector<HTMLElement>('[data-task-id] button.min-w-0')!.click()
    await waitFor(() => !!document.querySelector('aside[data-detail-for] [data-facets]'))
    // Facet lines plus the Add control (task-panel-facets D6).
    const items = document.querySelectorAll('aside[data-detail-for] [data-facet], aside[data-detail-for] button[aria-label="Add a property"]')
    expect(items.length).toBeLessThanOrEqual(MAX_EMPTY_TASK_ITEMS)
    await r.unmount()
  })

  it('a busy Calm row in Today shows at most four full-contrast metadata items, with the counts in a quiet group', async () => {
    const project = await createProject({ name: 'Home' })
    const labels = [await createLabel({ name: 'errand' }), await createLabel({ name: 'call' }), await createLabel({ name: 'home' })]
    const id = await createTask({ title: 'Busy', project_id: project, due: { date: '2026-10-14', time: '10:00' }, estimate_minutes: 30, labels })
    await createTask({ title: 'Sub one', project_id: project, parent_id: id })
    await createTask({ title: 'Sub two', project_id: project, parent_id: id })
    await setCurrentUserId('u1')
    await createComment({ taskId: id, body: 'A note' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector(`[data-task-id="${id}"] [data-row-counts] [data-comments]`), 'the busy row with its counts')
    const row = r.container.querySelector(`[data-task-id="${id}"]`)!
    const items = [...row.querySelector('[data-row-meta]')!.children]
    expect(items.length, items.map((e) => e.outerHTML.slice(0, 60)).join(' | ')).toBeLessThanOrEqual(MAX_CALM_ROW_ITEMS)
    expect(row.querySelector('[data-row-counts] [data-progress]')).toBeTruthy()
    await r.unmount()
  })

  it('an origin keeps a busy Calm row inside the budget: the chip is quiet, outside the metadata line (task-origin)', async () => {
    const project = await createProject({ name: 'Home' })
    const labels = [await createLabel({ name: 'errand' }), await createLabel({ name: 'call' })]
    const id = await createTask({ title: 'Captured', project_id: project, due: { date: '2026-10-14', time: '10:00' }, estimate_minutes: 30, labels,
      origin: { kind: 'issue', provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' } })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector(`[data-task-id="${id}"] [data-origin]`), 'the row with its origin chip')
    const row = r.container.querySelector(`[data-task-id="${id}"]`)!
    expect(row.querySelectorAll('[data-row-meta] > *').length).toBeLessThanOrEqual(MAX_CALM_ROW_ITEMS)
    expect(row.querySelector('[data-row-meta] [data-origin]')).toBeNull()
    expect(row.querySelector('[data-row-trailing] [data-origin] .text-faint')).toBeTruthy()
    await r.unmount()
  })
})
