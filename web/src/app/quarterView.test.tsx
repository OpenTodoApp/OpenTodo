// @vitest-environment happy-dom
// The Quarter view (OpenSpec change quarter-view-and-plan-spans, tasks 2.1-2.3): the
// route and the remembered mode, the three months of a calendar quarter with their
// density marks, the switch's order and a step to the next quarter.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { resetTaskPage } from './taskPage.testkit'
import { navigate, parseRoute, routePath, useRoute } from './router'
import QuarterView from './QuarterView'
import { readCalendarMode } from '../lib/calendarMode'
import { SHORTCUTS } from '../lib/shortcuts'

beforeEach(async () => {
  resetTaskPage()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  navigate({ view: 'quarter' }, { replace: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

/** The Quarter at the current address, following navigation (the Shell's part). */
function Routed() {
  const r = useRoute()
  return r.view === 'quarter' ? <QuarterView date={r.date} /> : <p data-left={routePath(r)} />
}

const day = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-year-day="${d}"]`)

describe('quarter route', () => {
  it('parses /quarter with an optional date, is remembered for /calendar and has g q', async () => {
    expect(parseRoute('/quarter/2026-11-18')).toEqual({ view: 'quarter', date: '2026-11-18' })
    expect(parseRoute('/quarter')).toEqual({ view: 'quarter' })
    expect(routePath({ view: 'quarter', date: '2026-11-18' })).toBe('/quarter/2026-11-18')
    expect(SHORTCUTS.find((s) => s.id === 'go.quarter')!.keys).toEqual(['g q'])
    const r = await render(<Routed />)
    await waitFor(() => readCalendarMode() === 'quarter', 'the remembered mode')
    expect(parseRoute('/calendar')).toEqual({ view: 'quarter' })
    await r.unmount()
  })
})

describe('quarter grid', () => {
  it('shows the three months of the quarter with the Year density marks', async () => {
    await createTask({ title: 'One', due: { date: '2026-11-03' } })
    await createTask({ title: 'Two', due: { date: '2026-11-03' } })
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-11-03')?.getAttribute('data-density') === '1', 'the marks')
    expect(r.container.querySelectorAll('[data-year-cells]')).toHaveLength(3)
    expect([...r.container.querySelectorAll('[data-year-month]')].map((m) => m.getAttribute('data-year-month'))).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(r.container.querySelector('[data-calendar-page="quarter"]')).toBeTruthy()
    expect(r.container.querySelector('h1')!.textContent).toContain('Q4 2026')
    expect(day(r.container, '2026-10-01')?.getAttribute('data-density')).toBe('0')
    await r.unmount()
  })

  it('opens the calendar quarter of an anchor near a boundary', async () => {
    const r = await render(<QuarterView date="2027-01-31" />)
    await waitFor(() => !!r.container.querySelector('[data-year-cells]'))
    expect(r.container.querySelector('h1')!.textContent).toContain('Q1 2027')
    expect([...r.container.querySelectorAll('[data-year-month]')].map((m) => m.getAttribute('data-year-month'))).toEqual(['2027-01', '2027-02', '2027-03'])
    await r.unmount()
  })

  it('sits between Month and Plan in the range switch, and steps a quarter keeping the day', async () => {
    const r = await render(<Routed />)
    const sw = r.container.querySelector('[role="group"][aria-label="Calendar range"]')!
    expect([...sw.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Day', 'Week', 'Month', 'Quarter', 'Plan', 'Year'])
    expect(sw.querySelector('[aria-pressed="true"]')!.textContent).toBe('Quarter')
    await click(r.container.querySelector('[data-page-header] button[aria-label="Next quarter"]')!)
    await waitFor(() => r.container.querySelector('h1')!.textContent?.includes('Q1 2027'), 'the next quarter')
    expect(day(r.container, '2027-02-18')?.getAttribute('aria-selected')).toBe('true')
    await r.unmount()
  })

  // Review of PR #1064: a sixth button wrapped the whole switch onto a second row under
  // the date navigation on a phone, so Quarter alone is hidden below 640 px.
  it('hides only the Quarter button below 640 px, keeping the other five', async () => {
    const r = await render(<Routed />)
    const sw = r.container.querySelector('[role="group"][aria-label="Calendar range"]')!
    const buttons = [...sw.querySelectorAll('button')]
    expect(buttons).toHaveLength(6)
    const hidden = buttons.filter((b) => b.className.includes('hidden sm:inline')).map((b) => b.textContent)
    expect(hidden).toEqual(['Quarter'])
    // Still reachable there: the shortcut opens Quarter even with the button hidden.
    expect(SHORTCUTS.find((s) => s.id === 'go.quarter')?.keys).toEqual(['g q'])
    await r.unmount()
  })
})
