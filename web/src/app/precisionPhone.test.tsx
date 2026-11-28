// @vitest-environment happy-dom
// The page's own header and row below 768 px (OpenSpec change precision-phone), where a
// screen is drawn outside the phone UI's header and row: a day page keeps its title, date
// and briefing in the page (D1), a row keeps one cell (D2), and the task's facts stack (D4).
// The tab bar is Inbox, Today, Upcoming and Search (D3, tabBar.test.tsx).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { PageHeader } from '../ui'
import { pageBar } from '../ui/patterns/pageBar'
import { minWidthPx, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { stackedFirst } from './task-detail/TaskFacts'
import { phoneCell } from './TaskRow'
import { resetTaskTrail } from './taskTrail'


/** matchMedia answering `width` for min-width queries. */
function stubMedia(width: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = minWidthPx(q)
    return { matches: min ? width >= min : false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
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
afterEach(() => { vi.unstubAllGlobals(); resetPanel(); resetTaskTrail() })


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

})

describe('the phone row (D2)', () => {
  it('keeps the date, else the deadline, else the assignee, else the project', () => {
    expect(phoneCell({ date: true, deadline: true, assignee: true, project: true })).toBe('date')
    expect(phoneCell({ date: false, deadline: true, assignee: true, project: true })).toBe('deadline')
    expect(phoneCell({ date: false, deadline: false, assignee: true, project: true })).toBe('assignee')
    expect(phoneCell({ date: false, deadline: false, assignee: false, project: true })).toBe('project')
    expect(phoneCell({ date: false, deadline: false, assignee: false, project: false })).toBeNull()
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

})
