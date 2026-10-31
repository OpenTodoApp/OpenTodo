// @vitest-environment happy-dom
// The Year view (OpenSpec change year-view, tasks 2.1 and 2.3–2.5): the route and the
// remembered mode, twelve months with their marks, the switch keeping the date, the
// keyboard grid from the year to a day, the screen-reader names, the tip, the phone's
// month targets, and axe.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, key, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { resetTaskPage } from './taskPage.testkit'
import { navigate, parseRoute, routePath, useRoute } from './router'
import YearView from './YearView'
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
  navigate({ view: 'year' }, { replace: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

/** The Year at the current address, following navigation (the Shell's part). */
function Routed() {
  const r = useRoute()
  return r.view === 'year' ? <YearView date={r.date} /> : <p data-left={routePath(r)} />
}

const day = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-year-day="${d}"]`)!

describe('year route', () => {
  it('parses /year with an optional date, is remembered for /calendar and has g y', async () => {
    expect(parseRoute('/year/2026-03-03')).toEqual({ view: 'year', date: '2026-03-03' })
    expect(routePath({ view: 'year' })).toBe('/year')
    expect(SHORTCUTS.find((s) => s.id === 'go.year')!.keys).toEqual(['g y'])
    const r = await render(<Routed />)
    await waitFor(() => readCalendarMode() === 'year', 'the remembered mode')
    expect(parseRoute('/calendar')).toEqual({ view: 'year' })
    await r.unmount()
  })
})

describe('year grid', () => {
  it('shows twelve months with density steps, today, the over-capacity mark and spoken names', async () => {
    for (let i = 0; i < 2; i++) await createTask({ title: `Two ${i}`, due: { date: '2026-11-03' } })
    for (let i = 0; i < 4; i++) await createTask({ title: `Four ${i}`, due: { date: '2026-11-04' }, estimate_minutes: i === 0 ? 540 : undefined })
    for (let i = 0; i < 7; i++) await createTask({ title: `Seven ${i}`, due: { date: '2026-11-05' } })
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-11-05')?.getAttribute('data-density') === '3', 'the marks')
    expect(r.container.querySelectorAll('[data-year-cells]')).toHaveLength(12)
    expect(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => day(r.container, d).getAttribute('data-density'))).toEqual(['0', '1', '2', '3'])
    expect(day(r.container, '2026-11-18').getAttribute('aria-current')).toBe('date')
    // 9 hours against the default 8-hour day.
    expect(day(r.container, '2026-11-04').hasAttribute('data-over')).toBe(true)
    expect(day(r.container, '2026-11-04').textContent).toMatch(/4 November|November 4/)
    expect(day(r.container, '2026-11-04').textContent).toContain('4 tasks, over capacity')
    expect(day(r.container, '2026-11-02').textContent).not.toContain('task')

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('shows the focused day\'s count and up to three titles in its tip', async () => {
    for (let i = 0; i < 4; i++) await createTask({ title: `Item ${i}`, due: { date: '2026-11-18' } })
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-11-18')?.getAttribute('data-density') === '2')
    day(r.container, '2026-11-18').focus()
    await waitFor(() => document.querySelector('[data-year-tip]') !== null, 'the tip')
    const tip = document.querySelector('[data-year-tip]')!
    expect(tip.textContent).toContain('4 tasks')
    expect(tip.textContent).toContain('+1 more')
    expect(day(r.container, '2026-11-18').getAttribute('aria-describedby')).toBe(tip.id)
    await r.unmount()
  })

  it('a click on a day opens Day, a month\'s name opens Month', async () => {
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-03-03') !== null)
    await click(day(r.container, '2026-03-03'))
    await waitFor(() => location.pathname === '/day/2026-03-03')
    navigate({ view: 'year' })
    await waitFor(() => r.container.querySelector('[data-year-month-link="2026-03"]') !== null)
    await click(r.container.querySelector('[data-year-month-link="2026-03"]')!)
    await waitFor(() => location.pathname === '/month/2026-03-01')
    await r.unmount()
  })
})

describe('navigating from the year', () => {
  it('From year to day with the keyboard: Page Down twice, Right and Enter', async () => {
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-11-18') !== null)
    await key(document.body, 'PageDown')
    expect(day(r.container, '2026-12-18').getAttribute('aria-selected')).toBe('true')
    await key(document.body, 'PageDown')
    await waitFor(() => location.pathname === '/year/2027-01-18' && day(r.container, '2027-01-18')?.getAttribute('aria-selected') === 'true', 'the next year')
    await key(document.body, 'ArrowRight')
    await key(document.body, 'Enter')
    await waitFor(() => location.pathname === '/day/2027-01-19')
    await r.unmount()
  })

  it('crosses a month edge, keeps the day with ] and Home / End, and the switch keeps the date', async () => {
    navigate({ view: 'year', date: '2026-01-31' }, { replace: true })
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-01-31')?.getAttribute('aria-selected') === 'true')
    await key(document.body, 'ArrowRight')
    expect(day(r.container, '2026-02-01').getAttribute('aria-selected')).toBe('true')
    await key(document.body, 'End')
    expect(day(r.container, '2026-02-28').getAttribute('aria-selected')).toBe('true')
    await key(document.body, 'Home')
    await key(document.body, 'ArrowUp')
    expect(day(r.container, '2026-01-25').getAttribute('aria-selected')).toBe('true')
    await key(document.body, ']')
    await waitFor(() => location.pathname === '/year/2027-01-25' && day(r.container, '2027-01-25')?.getAttribute('aria-selected') === 'true', 'the next year')
    const sw = r.container.querySelector('[role="group"][aria-label="Calendar range"]')!
    expect(sw.querySelector('[aria-pressed="true"]')!.textContent).toBe('Year')
    await click([...sw.querySelectorAll('button')].find((b) => b.textContent === 'Month')!)
    await waitFor(() => location.pathname === '/month/2027-01-25')
    await r.unmount()
  })

  it('Escape returns the focus to the page header', async () => {
    const r = await render(<Routed />)
    await waitFor(() => day(r.container, '2026-11-18') !== null)
    day(r.container, '2026-11-18').focus()
    await key(document.activeElement!, 'Escape')
    expect(document.activeElement?.tagName).toBe('H1')
    await r.unmount()
  })
})

describe('year on narrow screens', () => {
  it('Year on a phone: twelve months as touch targets; tapping March opens Month on March', async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width: 39.99rem') ? true : minWidthPx(q) <= 390, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    try {
      await createTask({ title: 'Spring', due: { date: '2026-03-10' } })
      const r = await render(<Routed />)
      await waitFor(() => r.container.querySelectorAll('[data-year-month-link]').length === 12)
      // Day cells are drawn, not interactive: the month is the target.
      expect(r.container.querySelector('[data-year-day]')).toBeNull()
      const march = r.container.querySelector<HTMLButtonElement>('[data-year-month-link="2026-03"]')!
      await waitFor(() => march.getAttribute('aria-label') === 'March 2026, 1 task', 'the month\'s count')
      expect(r.container.querySelector('[data-year-cells="2026-03"] [data-density="1"]')).toBeTruthy()
      await click(march)
      await waitFor(() => location.pathname === '/month/2026-03-01')
      await r.unmount()
    } finally {
      window.matchMedia = original
    }
  })
})
