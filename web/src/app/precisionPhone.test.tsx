// @vitest-environment happy-dom
// The phone in the Precision look (OpenSpec change precision-phone): a day page keeps
// its title, date and briefing in the page under a bar with only the menu and the
// actions (D1), a phone row keeps one cell (D2), the tab bar is Inbox, Today, Upcoming
// and Search (D3, tabBar.test.tsx), and the task page stacks its facts (D4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { PageHeader } from '../ui'
import { pageBar } from '../ui/patterns/pageBar'
import { click, flush, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { stackedFirst } from './task-detail/TaskFacts'
import { phoneCell } from './TaskRow'
import { resetTaskTrail } from './taskTrail'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

/** matchMedia answering `width` for min-width queries. */
function stubMedia(width: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    return { matches: min ? width >= Number(min[1]) : false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  stubMedia(390)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetPanel(); resetTaskTrail() })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('the day head on a phone (D1)', () => {
  it('keeps the title at the display step, the date and the briefing in the page, scrolling with the list', async () => {
    const r = await render(<PageHeader kind="day" title="Today" meta="Thu, 23 Oct" briefing="Three things matter today." actions={<button>Filter</button>} barActions />)
    const title = r.container.querySelector('h1[data-page-title]')!
    expect(title.textContent).toBe('Today')
    expect(title.className).toContain('text-display')
    expect(r.container.querySelector('[data-page-lead]')!.textContent).toBe('Thu, 23 Oct')
    expect(r.container.querySelector('[data-page-briefing]')!.textContent).toBe('Three things matter today.')
    expect(r.container.querySelector('[data-page-header]')!.className).not.toContain('sticky')
    // The actions went to the bar, which is told it serves a day page.
    expect(r.container.querySelector('[data-page-actions]')).toBeNull()
    expect(pageBar()?.day).toBe(true)
    await r.unmount()
  })

  it('a tool page still gives its title to the bar', async () => {
    const r = await render(<PageHeader title="Home" meta="4 open" />)
    expect(r.container.querySelector('[data-page-header]')).toBeNull()
    expect(pageBar()?.title).toBe('Home')
    expect(pageBar()?.day).toBeUndefined()
    await r.unmount()
  })

  it('Today\'s bar has the menu and no title or hairline; a project\'s bar has both', async () => {
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-phone-bar][data-phone-bar-day]'))
    const bar = document.querySelector<HTMLElement>('[data-phone-bar]')!
    expect(bar.querySelector('button[aria-label="Open menu"]')).not.toBeNull()
    expect(bar.querySelector('[data-phone-title]')).toBeNull()
    expect(bar.className).not.toContain('border-b')
    // One level-one heading on the page, the day head's.
    expect([...document.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Today'])
    const project = await createProject({ name: 'Home' })
    navigate({ view: 'project', id: project })
    await waitFor(() => document.querySelector('[data-phone-bar] [data-phone-title]')?.textContent === 'Home')
    expect(document.querySelector('[data-phone-bar]')!.className).toContain('border-b')
    await r.unmount()
  })
})

describe('the phone row (D2)', () => {
  it('keeps the date, else the deadline, else the assignee, else the project', () => {
    expect(phoneCell({ date: true, deadline: true, assignee: true, project: true })).toBe('date')
    expect(phoneCell({ date: false, deadline: true, assignee: true, project: true })).toBe('extra')
    expect(phoneCell({ date: false, deadline: false, assignee: true, project: true })).toBe('assignee')
    expect(phoneCell({ date: false, deadline: false, assignee: false, project: true })).toBe('project')
    expect(phoneCell({ date: false, deadline: false, assignee: false, project: false })).toBeNull()
  })

  it('a row in Upcoming marks its date cell; the project keeps its dot', async () => {
    const project = await createProject({ name: 'Home', color: '#e07a3f' })
    await createTask({ title: 'Paint the fence', project_id: project, due: { date: '2099-03-04' } })
    navigate({ view: 'project', id: project })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-task-id]'))
    const row = document.querySelector('[data-task-id]')!
    expect(row.querySelector('[data-row-phone]')?.getAttribute('data-row-cell')).toBe('date')
    expect(row.querySelectorAll('[data-row-phone]')).toHaveLength(1)
    await r.unmount()
  })
})

describe('the stacked facts (D4)', () => {
  it('shows set facts, the date and the deadline first, and priority only above 4', () => {
    expect(stackedFirst({ id: 'due', set: false })).toBe(true)
    expect(stackedFirst({ id: 'deadline', set: false })).toBe(true)
    expect(stackedFirst({ id: 'estimate', set: false })).toBe(false)
    expect(stackedFirst({ id: 'reminders', set: true })).toBe(true)
    expect(stackedFirst({ id: 'priority', set: true, priority: 4 })).toBe(false)
    expect(stackedFirst({ id: 'priority', set: true, priority: 2 })).toBe(true)
  })

  it('the task page on a phone is one card of rows; More shows the rest', async () => {
    const id = await createTask({ title: 'Call the plumber', due: { date: '2099-03-04' } })
    navigate({ view: 'task', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-facts="stacked"]'))
    const facts = document.querySelector<HTMLElement>('[data-facts="stacked"]')!
    const shown = () => [...facts.querySelectorAll('[data-fact]')].map((f) => f.getAttribute('data-fact'))
    expect(facts.querySelector('[data-fact-group]')).toBeNull()
    expect(shown()).toEqual(['due', 'deadline', 'project'])
    expect(facts.querySelector('[data-fact="deadline"]')!.textContent).toContain('Set a deadline')
    // The bar's Back takes the menu button's place.
    expect(document.querySelector('[data-phone-bar] [data-page-back]')).not.toBeNull()
    expect(document.querySelector('[data-phone-bar] button[aria-label="Open menu"]')).toBeNull()
    await click(facts.querySelector<HTMLButtonElement>('[data-facts-more]')!)
    expect(shown()).toEqual(expect.arrayContaining(['estimate', 'repeat', 'location', 'labels']))
    expect(facts.querySelector('[data-facts-more]')).toBeNull()
    await r.unmount()
  })
})
