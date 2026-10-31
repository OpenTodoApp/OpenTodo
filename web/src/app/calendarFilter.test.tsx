// @vitest-environment happy-dom
// The query filter of the Calendar and of Upcoming (OpenSpec change calendar-clarity,
// design D4; GitHub issue 556; tasks 4.1 and 4.2): Filter… in the overflow, one chip in
// the lead line, tasks and deadline markers narrowed, capacity still counting every
// task with "n hidden by the filter", an invalid query keeping the last valid one,
// remembered per device across the four modes, and Upcoming's label checkboxes.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { resetTaskPage } from './taskPage.testkit'

beforeEach(async () => {
  resetTaskPage()
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wednesday 18 November 2026; Tuesday is the 17th.
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const TUE = '2026-11-17'

async function seed() {
  const work = await createProject({ name: 'Work' })
  const sub = await createProject({ name: 'Clients', parent_id: work })
  const home = await createProject({ name: 'Home' })
  const ids = {
    report: await createTask({ title: 'Report', project_id: work, due: { date: TUE, time: '09:00' }, estimate_minutes: 30 }),
    client: await createTask({ title: 'Client call', project_id: sub, due: { date: TUE, time: '11:00' }, estimate_minutes: 30 }),
    laundry: await createTask({ title: 'Laundry', project_id: home, due: { date: TUE, time: '15:00' }, estimate_minutes: 60 }),
    garden: await createTask({ title: 'Garden', project_id: home, due: { date: TUE, time: '17:00' }, estimate_minutes: 60 }),
    essay: await createTask({ title: 'Home essay', project_id: home, due: { date: TUE }, deadline: '2026-11-20' }),
    pitch: await createTask({ title: 'Pitch', project_id: work, due: { date: TUE }, deadline: '2026-11-20' }),
  }
  return ids
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const chip = () => document.querySelector<HTMLElement>('[data-query-filter-chip]')
const blocks = (root: ParentNode) => [...root.querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))

describe('the Calendar\'s filter', () => {
  it('Filter… with ##Work draws only Work and its sub-projects, shows one chip, and capacity still counts the day', async () => {
    const ids = await seed()
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => blocks(r.container).length === 4, 'four blocks')
    await click(r.container.querySelector('[data-page-actions] [aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[data-calendar-filter]'), 'Filter…')
    await click(document.querySelector('[data-calendar-filter]')!)
    await waitFor(() => !!document.querySelector('[data-query-filter-input]'), 'the filter dialog')
    await typeInto(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!, '##Work')
    await waitFor(() => blocks(r.container).length === 2, 'two blocks')
    expect(blocks(r.container).sort()).toEqual([ids.report, ids.client].sort())
    // The header's lead line holds the chip; no new row.
    expect(r.container.querySelector('[data-page-header] [data-query-filter-chip]')).toBeTruthy()
    expect(chip()!.querySelector('button')!.getAttribute('aria-label')).toContain('Project is Work or a sub-project')
    // Deadline markers follow the filter.
    expect(r.container.querySelector(`[data-deadline-marker-for="${ids.pitch}"]`)).toBeTruthy()
    expect(r.container.querySelector(`[data-deadline-marker-for="${ids.essay}"]`)).toBeNull()

    // Capacity: 30 + 30 + 60 + 60 minutes, the two Home blocks hidden.
    const cap = r.container.querySelector<HTMLElement>(`[data-day-header="${TUE}"] [data-capacity]`)!
    expect(cap.textContent).toContain('3h')
    cap.focus()
    await waitFor(() => !!document.querySelector('[data-tooltip]'), 'the capacity tooltip')
    expect(document.querySelector('[data-tooltip]')!.textContent).toContain('3 tasks hidden by the filter')
    await r.unmount()
  })

  it('an invalid edit shows the parser\'s error and keeps the last valid filter', async () => {
    await seed()
    await setMeta('calendar.filter', '##Work')
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => blocks(r.container).length === 2, 'the filter applied')
    await click(chip()!.querySelector('button')!)
    await waitFor(() => !!document.querySelector('[data-query-filter-input]'), 'the dialog')
    await typeInto(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!, 'p1 &')
    await waitFor(() => !!document.querySelector('[data-testid="query-filter"] .text-danger'), 'the error')
    expect(await getMeta('calendar.filter', '')).toBe('##Work')
    expect(blocks(r.container)).toHaveLength(2)
    await r.unmount()
  })

  it('is remembered on the device for Day, Week, Month and Plan, and the chip clears it', async () => {
    const ids = await seed()
    await setMeta('calendar.filter', '##Work')
    const month = await render(<MonthView />)
    await waitFor(() => !!month.container.querySelector(`[data-month-task="${ids.report}"]`), 'Month')
    expect(month.container.querySelector(`[data-month-task="${ids.laundry}"]`)).toBeNull()
    expect(chip()).toBeTruthy()
    await month.unmount()

    const plan = await render(<PlanView date={TUE} />)
    await waitFor(() => !!plan.container.querySelector(`[data-plan-task="${ids.report}"]`), 'Plan')
    expect(plan.container.querySelector(`[data-plan-task="${ids.laundry}"]`)).toBeNull()
    await click(chip()!.querySelector('[data-query-filter-clear]')!)
    await waitFor(() => !!plan.container.querySelector(`[data-plan-task="${ids.laundry}"]`), 'the filter cleared')
    expect(await getMeta('calendar.filter', '')).toBe('')
    await plan.unmount()
  })
})

describe('Upcoming\'s filter', () => {
  it('label checkboxes write @errand | @call and Upcoming lists only those tasks', async () => {
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    await createTask({ title: 'Buy stamps', labels: [errand], due: { date: '2026-11-19' } })
    await createTask({ title: 'Ring the plumber', labels: [call], due: { date: '2026-11-20' } })
    await createTask({ title: 'Read a book', due: { date: '2026-11-21' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Read a book'), 'Upcoming')
    await click(r.container.querySelector('[data-duration-filter] button[aria-label="Filter"]')!)
    await waitFor(() => !!document.querySelector('[data-query-filter-open]'), 'Filter… under the duration filter')
    await click(document.querySelector('[data-query-filter-open]')!)
    await waitFor(() => !!document.querySelector('[data-query-filter-label="errand"]'), 'the label checkboxes')
    await click(document.querySelector('[data-query-filter-label="errand"]')!)
    await click(document.querySelector('[data-query-filter-label="call"]')!)
    await waitFor(async () => (await getMeta('upcoming.filter', '')) === '@errand | @call', 'the query')
    expect(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!.value).toBe('@errand | @call')
    await waitFor(() => !r.container.textContent!.includes('Read a book'), 'the filter applied')
    expect(r.container.textContent).toContain('Buy stamps')
    expect(r.container.textContent).toContain('Ring the plumber')
    await r.unmount()
  })
})
