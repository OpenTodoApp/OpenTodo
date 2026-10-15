// @vitest-environment happy-dom
// The interface budget (OpenSpec change ux-overhaul, design-system "Interface
// budget", app-shell "Three columns, three scrollers"): measurable limits every
// screen change must stay inside. Two of them are checked here over seeded
// fixtures; the others arrive with the work that makes them true (visible
// properties on a task with task 3.3, primary sidebar items with task 4.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { flush, render } from '../ui/test-utils'
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

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

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
