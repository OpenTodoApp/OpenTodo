// @vitest-environment happy-dom
// Deadlines on the calendar (OpenSpec change calendar-clarity, design D1, tasks 1.2 and
// 1.3): a chip in the Day and Week all-day strip, the diamond on a task drawn on its
// deadline day, Month rows in "+N more", Plan markers, opening with the keyboard,
// following synced changes, and gone once the task is completed.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { completeTask, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { click, render, spokenText, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { resetPanel } from './panel'
import { openedTask, resetTaskPage } from './taskPage.testkit'

beforeEach(async () => {
  resetTaskPage()
  vi.useFakeTimers({ toFake: ['Date'] })
  // Wednesday 18 November 2026; the week runs Monday 16 to Sunday 22.
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

const strip = (root: ParentNode, d: string) => root.querySelector(`[data-day-header="${d}"]`)!
const chips = (root: ParentNode, d: string) => [...strip(root, d).querySelectorAll<HTMLElement>('[data-deadline-marker-for]')]

describe('Day and Week', () => {
  it('shows a deadline chip on Friday for a task due Thursday, without changing Friday\'s capacity', async () => {
    const id = await createTask({ title: 'Send the report', due: { date: '2026-11-19', time: '10:00' }, estimate_minutes: 60, deadline: '2026-11-20' })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => chips(r.container, '2026-11-20').length === 1, 'the deadline chip')
    expect(r.container.querySelector(`[data-drop-day="2026-11-19"] [data-block="${id}"]`)).toBeTruthy()
    const chip = chips(r.container, '2026-11-20')[0]
    expect(spokenText(chip)).toContain('Deadline')
    expect(spokenText(chip)).toContain('Send the report')
    expect(chip.querySelector('[data-deadline-diamond]')).toBeTruthy()
    // Friday's capacity reads like an empty day's.
    const cap = (d: string) => strip(r.container, d).querySelector('[data-capacity]')?.textContent
    expect(cap('2026-11-20')).toBe(cap('2026-11-21'))
    // Reachable with Tab and opened like a task of a list.
    expect(chip.tagName).toBe('BUTTON')
    expect(chip.tabIndex).toBe(0)
    await click(chip)
    expect(openedTask()).toBe(id)
    await r.unmount()
  })

  it('puts the diamond on the lane row of a task due on its deadline day, with no chip', async () => {
    const id = await createTask({ title: 'Pay rent', due: { date: '2026-11-20' }, deadline: '2026-11-20' })
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!r.container.querySelector(`[data-lane-task="${id}"]`), 'the lane row')
    expect(r.container.querySelector(`[data-lane-task="${id}"] [data-deadline-diamond]`)).toBeTruthy()
    expect(spokenText(r.container.querySelector(`[data-lane-task="${id}"]`)!)).toContain('deadline today')
    expect(chips(r.container, '2026-11-20')).toHaveLength(0)
    await r.unmount()
  })

  it('shares the strip\'s three-item limit and "+N", follows a moved deadline and leaves when the task is done', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push(await createTask({ title: `Due ${i}`, due: { date: '2026-11-17' }, deadline: '2026-11-20' }))
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => chips(r.container, '2026-11-20').length === 3, 'three chips')
    expect(strip(r.container, '2026-11-20').querySelector('[data-all-day-more]')!.textContent).toBe('+1')

    // Another device moves one deadline to Saturday; this device follows without a reload.
    await updateTask(ids[0], { deadline: '2026-11-21' })
    await waitFor(() => chips(r.container, '2026-11-21').length === 1, 'the chip on Saturday')
    expect(strip(r.container, '2026-11-20').querySelector('[data-all-day-more]')).toBeNull()

    await completeTask(ids[0])
    await waitFor(() => chips(r.container, '2026-11-21').length === 0, 'the chip gone')
    await r.unmount()
  })
})

describe('Month and Plan', () => {
  it('lists a cell\'s tasks, then its deadline row, which takes part in "+N more"', async () => {
    await createTask({ title: 'One', due: { date: '2026-11-20' } })
    await createTask({ title: 'Two', due: { date: '2026-11-20' } })
    const d = await createTask({ title: 'Essay', due: { date: '2026-11-18' }, deadline: '2026-11-20' })
    const r = await render(<MonthView />)
    const cell = () => r.container.querySelector(`[data-month-day="2026-11-20"]`)!
    await waitFor(() => !!cell().querySelector(`[data-deadline-marker-for="${d}"]`), 'the deadline row')
    const rows = [...cell().querySelectorAll('[data-month-task], [data-deadline-marker-for]')]
    expect(rows.map((el) => spokenText(el))).toEqual(['One', 'Two', 'Deadline: Essay'])
    expect(rows[2].querySelector('[data-deadline-diamond]')).toBeTruthy()

    // A fourth item folds the cell to two rows and "+2 more".
    await createTask({ title: 'Three', due: { date: '2026-11-20' } })
    await waitFor(() => !!cell().querySelector('[data-month-more]'), '+N more')
    expect(cell().querySelector('[data-month-more]')!.textContent).toBe('+2 more')
    await r.unmount()
  })

  it('dims a deadline on a day before today', async () => {
    await createTask({ title: 'Late one', due: { date: '2026-11-20' }, deadline: '2026-11-17' })
    const r = await render(<MonthView />)
    await waitFor(() => !!r.container.querySelector('[data-deadline-date="2026-11-17"]'), 'the past deadline')
    expect(r.container.querySelector('[data-deadline-date="2026-11-17"]')!.hasAttribute('data-past')).toBe(true)
    await r.unmount()
  })

  it('lists deadlines after the tasks of the Plan\'s column', async () => {
    await createTask({ title: 'Plan task', due: { date: '2026-11-20' } })
    const d = await createTask({ title: 'Grant', due: { date: '2026-11-19' }, deadline: '2026-11-20' })
    const r = await render(<PlanView />)
    const col = () => r.container.querySelector('[data-plan-day="2026-11-20"]')
    await waitFor(() => !!col()?.querySelector(`[data-deadline-marker-for="${d}"]`), 'the Plan marker')
    const items = [...col()!.querySelectorAll('[data-plan-task], [data-deadline-marker-for]')]
    expect(items.map((el) => el.hasAttribute('data-deadline-marker-for'))).toEqual([false, true])
    await click(items[1])
    expect(openedTask()).toBe(d)
    await r.unmount()
  })
})
