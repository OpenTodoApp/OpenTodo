// @vitest-environment happy-dom
// Nothing between the header and the list (OpenSpec change ux-overhaul,
// task-list-presentation): the duration filter is a page action, the Inbox shows
// no project chip, and date-sorted views carry no sort note.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

/** The page's children before the one holding the first task row. */
function chromeBeforeFirstTask(container: HTMLElement): Element[] {
  const page = container.querySelector('[data-list-page]')!
  const out: Element[] = []
  for (const child of page.children) {
    if (child.querySelector('[data-task-id]')) break
    out.push(child)
  }
  return out
}

describe('list chrome', () => {
  it('the Inbox has only the title and the quick add above the first task, and no Inbox chip on rows', async () => {
    await createTask({ title: 'Renew passport' })
    await createTask({ title: 'Call mum', estimate_minutes: 10 })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Call mum'))
    const chrome = chromeBeforeFirstTask(r.container)
    expect(chrome.map((c) => c.tagName.toLowerCase())).toEqual(['header', 'div'])
    expect(chrome[1].querySelector('input[aria-label="Add a task"]')).toBeTruthy()
    expect(r.container.querySelector('[role="group"][aria-label="Duration filter"]')).toBeNull()
    expect(r.container.querySelector('[data-duration-active]')).toBeNull()
    expect([...r.container.querySelectorAll('[data-task-id] [data-row-meta]')].some((m) => m.textContent?.includes('Inbox'))).toBe(false)
    await r.unmount()
  })

  it('Today carries no sort note and no assistant hint', async () => {
    await createTask({ title: 'Renew passport', due: { date: '2026-10-14' } })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => r.container.textContent!.includes('Renew passport'))
    expect(r.container.querySelector('[data-sort-note]')).toBeNull()
    expect(r.container.textContent).not.toContain('sorted by date')
    expect(r.container.querySelector('[data-ask-hint]')).toBeNull()
    expect(chromeBeforeFirstTask(r.container).length).toBeLessThanOrEqual(2)
    await r.unmount()
  })

  it('the Filter action in the header filters by duration and shows one chip with a clear control', async () => {
    await createTask({ title: 'Quick one', estimate_minutes: 10 })
    await createTask({ title: 'Long one', estimate_minutes: 120 })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Long one'))
    const trigger = r.container.querySelector<HTMLButtonElement>('[data-page-header] [data-duration-filter] button[aria-haspopup]')!
    expect(trigger).toBeTruthy()
    await click(trigger)
    await waitFor(() => !!document.querySelector('[role="menu"], [role="dialog"]'))
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], button')].find((b) => b.textContent?.startsWith('Quick wins'))!
    await click(item)
    await waitFor(() => !r.container.textContent!.includes('Long one'))
    expect(r.container.textContent).toContain('Quick one')
    const active = r.container.querySelector('[data-page-header] [data-duration-active]')!
    expect(active.textContent).toContain('Quick wins')
    // Still nothing between the quick add and the first row.
    expect(chromeBeforeFirstTask(r.container).length).toBe(2)
    await click(active.querySelector<HTMLButtonElement>('[data-clear-duration]')!)
    await waitFor(() => r.container.textContent!.includes('Long one'))
    expect(r.container.querySelector('[data-duration-active]')).toBeNull()
    await r.unmount()
  })

  it('a project shows the filter beside its title, not above the list', async () => {
    const project = await createProject({ name: 'Home' })
    await createTask({ title: 'Paint the fence', project_id: project })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => r.container.textContent!.includes('Paint the fence'))
    expect(r.container.querySelector('[data-duration-filter]')).toBeTruthy()
    expect(r.container.querySelector('[role="group"][aria-label="Duration filter"]')).toBeNull()
    await r.unmount()
  })
})

// Clearing the selection (OpenSpec change inline-task-editing, task-list-presentation
// "Clearing the selection" and "Selected row indicator").
describe('selection', () => {
  const press = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))

  it('a press on empty space clears the selection; rows, controls and overlays keep it', async () => {
    // A project list: the Inbox keeps its split from 1024 px and shows the task beside it instead (inbox-split).
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'Renew passport', project_id: pid })
    const r = await render(<main><TaskListView route={{ view: 'project', id: pid }} /></main>)
    await waitFor(() => r.container.textContent!.includes('Renew passport'))
    const title = () => r.container.querySelector<HTMLButtonElement>('[data-task-id] [data-row-open]')!
    await click(title())
    await waitFor(() => !!r.container.querySelector('[data-task-id][aria-current]'))
    // The click opened the task as its page (task-full-page); the list keeps the row selected.
    expect(location.pathname.startsWith('/task/')).toBe(true)

    // A row, a control and an overlay do not clear.
    press(title())
    press(r.container.querySelector('input[aria-label="Add a task"]')!)
    const overlay = document.createElement('div')
    overlay.setAttribute('data-overlay', 'popover')
    document.body.querySelector('main')!.append(overlay)
    press(overlay)
    await flush()
    expect(r.container.querySelector('[data-task-id][aria-current]')).toBeTruthy()

    // The empty page does.
    press(r.container.querySelector('[data-list-page]')!)
    await waitFor(() => !r.container.querySelector('[data-task-id][aria-current]'))
    await r.unmount()
  })

  it('marks the selected row with the leading bar, not a ring', async () => {
    await createTask({ title: 'Renew passport' })
    const r = await render(<main><TaskListView route={{ view: 'inbox' }} /></main>)
    await waitFor(() => r.container.textContent!.includes('Renew passport'))
    await click(r.container.querySelector('[data-task-id] [data-row-open]')!)
    await waitFor(() => !!r.container.querySelector('[data-task-id][aria-current]'))
    const row = r.container.querySelector('[data-task-id][aria-current]')!
    expect(row.className).toContain('row-selected')
    expect(row.className).not.toMatch(/\bring-/)
    await r.unmount()
  })
})
