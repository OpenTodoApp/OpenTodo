// @vitest-environment happy-dom
// The calendar's lists in the phone UI (OpenSpec change phone-calendar, "A task in a
// calendar list is the phone row" and "Swipes and the date sheet in a calendar list"):
// a task in Week's days, Month's chosen day and Plan's agenda is the phone row with
// what the calendar says of it there; a tap opens the task page, the circle and a
// swipe to the end edge complete with Undo, a swipe to the start edge opens the date
// sheet. Every test reads `[data-calendar-row]`, so none passes against the earlier rows.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { createProject, createTask } from '../lib/ops'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { hideBulkToast } from '../app/bulk/toastStore'
import { navigate, type Route } from '../app/router'
import { Shell } from '../app/Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
const today = logicalToday()
let width = 390

/** The window's width in px against a `max-width` query, or null when the query has none. */
function maxWidthPx(q: string): number | null {
  const m = /max-width:\s*([\d.]+)(rem|px)/.exec(q)
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  width = 390
  // A phone: 390 px, a coarse pointer.
  window.matchMedia = ((q: string) => {
    const max = maxWidthPx(q)
    return {
      matches: /pointer:\s*fine/.test(q) ? false : /pointer:\s*coarse/.test(q) ? true : /prefers-reduced-motion/.test(q) ? false : max !== null ? width <= max : q.includes('min-width') ? minWidthPx(q) <= width : false,
      media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }
  }) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.restoreAllMocks(); vi.unstubAllGlobals(); hideBulkToast() })

const rows = (root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>('[data-calendar-row]')]
const row = (id: string) => document.querySelector<HTMLElement>(`[data-calendar-row][data-cal-id="${id}"]`)
const earlierRows = () => document.querySelectorAll('[data-agenda-task], [data-month-task], [data-plan-task]')
const facts = (id: string) => Object.fromEntries([...row(id)!.querySelectorAll<HTMLElement>('[data-fact]')].map((f) => [f.dataset.fact!, f.textContent ?? '']))
const taskPage = () => document.querySelector<HTMLElement>('[data-phone-screen="task"]')
const undo = () => [...document.querySelectorAll<HTMLButtonElement>('[data-bulk-toast] button')].find((b) => b.textContent === 'Undo')
const completed = async (id: string) => !!(await db.tasks.get(id))?.completed_at

/** Opens a calendar route in the phone UI. */
async function open(route: Route) {
  navigate(route)
  return render(<Shell user={user} onLogout={() => {}} />)
}

/** A touch swipe on a row: the press, the moves, the release, 120 ms apart (as rowSwipe.test.tsx drives it). */
async function swipe(el: HTMLElement, xs: number[]) {
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  await act(async () => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 50 })) })
  for (const x of xs) {
    now += 120
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 200 + x, clientY: 50 })) })
  }
  await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: 200 + xs[xs.length - 1], clientY: 50 })) })
  clock.mockRestore()
}

describe('Week\'s list of days in the phone UI', () => {
  it('lists a timed task with its time and an untimed one as all day, and a tap opens the task page and Back returns to Week', async () => {
    const timed = await createTask({ title: 'Call the plumber', due: { date: today, time: '09:30' } })
    const plain = await createTask({ title: 'Buy primer', due: { date: today } })
    const r = await open({ view: 'week' })
    await waitFor(() => !!row(timed) && !!row(plain), 'the two phone rows')
    const day = document.querySelector<HTMLElement>(`[data-week-agenda] [data-agenda-day="${today}"]`)!
    // One card for the day, the untimed task before the timed one, each listed under today.
    expect(rows(day.querySelector('[data-phone-rows]')!).map((el) => el.dataset.calId)).toEqual([plain, timed])
    expect(rows().every((el) => el.dataset.calendarRow === today)).toBe(true)
    expect(row(timed)!.querySelector('[data-row-title]')!.textContent).toBe('Call the plumber')
    expect(facts(timed).time).toMatch(/^0?9:30/)
    expect(facts(plain).time).toBe('all day')
    expect(earlierRows()).toHaveLength(0)
    const weekDays = () => [...document.querySelectorAll<HTMLElement>('[data-week-agenda] [data-agenda-day]')].map((el) => el.dataset.agendaDay).join()
    const week = weekDays()
    await click(row(timed)!.querySelector('[data-row-open]')!)
    await waitFor(() => !!taskPage() && location.pathname === `/task/${timed}`, 'the phone task page')
    // The way back is named after the week it returns to.
    const back = taskPage()!.querySelector<HTMLElement>('[data-page-back]')!
    expect(back.textContent).not.toBe('')
    await click(back)
    await waitFor(() => !taskPage() && location.pathname.startsWith('/week') && !!row(timed) && weekDays() === week, 'the same week again, with the row')
    await r.unmount()
  })

  it('a task of a project the person may only read: the circle is off, no swipe, and a tap still opens the task page', async () => {
    const work = await createProject({ name: 'Work' })
    await db.memberships.put({ projectId: work, role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Send the invoice', due: { date: today }, project_id: work })
    const r = await open({ view: 'week' })
    await waitFor(() => row(id)?.querySelector<HTMLButtonElement>('[data-phone-check]')?.disabled === true, 'the row as a reader sees it')
    expect(row(id)!.hasAttribute('data-swipeable')).toBe(false)
    await click(row(id)!.querySelector('[data-phone-check]')!)
    await swipe(row(id)!, [20, 60, 110])
    expect(document.querySelector('[data-swipe-edge]')).toBeNull()
    expect(await completed(id)).toBe(false)
    await click(row(id)!.querySelector('[data-row-open]')!)
    await waitFor(() => !!taskPage() && location.pathname === `/task/${id}`, 'the task page')
    await r.unmount()
  })

  it('keeps the grid, without phone rows, from 768 px', async () => {
    const id = await createTask({ title: 'Call the plumber', due: { date: today, time: '09:30' } })
    width = 1024
    const wide = await open({ view: 'week' })
    await waitFor(() => !!document.querySelector(`[data-cal-id="${id}"]`), 'the task in the wide Week')
    expect(rows()).toHaveLength(0)
    expect(document.querySelector('[data-week-agenda]')).toBeNull()
    await wide.unmount()
  })
})

describe('Month\'s chosen day in the phone UI', () => {
  it('the circle completes the task, Undo is offered, and undoing reopens it', async () => {
    const id = await createTask({ title: 'Call the plumber', due: { date: today, time: '09:30' } })
    const r = await open({ view: 'month' })
    const listed = () => document.querySelector<HTMLElement>(`[data-month-day-list] [data-calendar-row="${today}"][data-cal-id="${id}"]`)
    await waitFor(() => !!listed(), 'the task in the chosen day\'s list')
    expect(facts(id).time).toMatch(/^0?9:30/)
    expect(document.querySelector('[data-month-day-list] [data-month-task]')).toBeNull()
    await click(listed()!.querySelector('[data-phone-check]')!)
    await waitFor(async () => (await completed(id)) && !!undo(), 'the task completed and Undo offered')
    await click(undo()!)
    await waitFor(async () => !(await completed(id)) && listed()?.querySelector('[data-phone-check]')?.getAttribute('aria-pressed') === 'false', 'the task open again')
    await r.unmount()
  })
})

describe('Plan\'s agenda in the phone UI', () => {
  const listed = (id: string) => document.querySelector<HTMLElement>(`[data-plan-agenda] [data-agenda-day="${today}"] [data-calendar-row="${today}"][data-cal-id="${id}"]`)

  it('a three-day task on its second day says all day and Day 2 of 3, with its estimate', async () => {
    const id = await createTask({ title: 'Lisbon trip', start: addDaysISO(today, -1), due: { date: addDaysISO(today, 1) }, span: true, estimate_minutes: 90 })
    const r = await open({ view: 'plan' })
    await waitFor(() => !!listed(id), 'the span under today')
    const said = Object.fromEntries([...listed(id)!.querySelectorAll<HTMLElement>('[data-fact]')].map((f) => [f.dataset.fact!, f.textContent ?? '']))
    expect(said).toMatchObject({ time: 'all day', span: 'Day 2 of 3', estimate: '1h 30m' })
    expect(document.querySelector('[data-plan-agenda] [data-plan-task]')).toBeNull()
    await r.unmount()
  })

  it('a swipe to the end edge completes the task and offers Undo', async () => {
    const id = await createTask({ title: 'Buy primer', due: { date: today } })
    const r = await open({ view: 'plan' })
    await waitFor(() => !!listed(id), 'the task under today')
    expect(listed(id)!.hasAttribute('data-swipeable')).toBe(true)
    await swipe(listed(id)!, [20, 60, 110])
    await waitFor(async () => (await completed(id)) && !!undo(), 'the task completed and Undo offered')
    await r.unmount()
  })
})

describe('the date sheet from a calendar row', () => {
  it('a swipe to the start edge in Week opens the date sheet, and another day there moves the task with its time', async () => {
    const id = await createTask({ title: 'Call the plumber', due: { date: today, time: '09:30' } })
    const r = await open({ view: 'week' })
    await waitFor(() => !!row(id), 'the row')
    // Another day of the week on screen: the next one, or the one before on the week's last day.
    const days = [...document.querySelectorAll<HTMLElement>('[data-week-agenda] [data-agenda-day]')].map((el) => el.dataset.agendaDay!)
    const other = days[days.indexOf(today) + 1] ?? days[days.indexOf(today) - 1]
    await swipe(row(id)!, [-20, -60, -110])
    const sheet = () => document.querySelector<HTMLElement>('[data-testid="phone-date-sheet"]')
    await waitFor(() => !!sheet()?.querySelector(`[data-date-day="${other}"]`), 'the date sheet')
    expect(sheet()!.querySelector(`[data-date-day="${today}"]`)!.getAttribute('aria-selected')).toBe('true')
    await click(sheet()!.querySelector(`[data-date-day="${other}"]`)!)
    await waitFor(() => !sheet() && row(id)?.dataset.calendarRow === other, 'the task under its new day')
    expect(row(id)!.closest('[data-agenda-day]')!.getAttribute('data-agenda-day')).toBe(other)
    expect(document.querySelector(`[data-agenda-day="${today}"] [data-cal-id="${id}"]`)).toBeNull()
    expect(facts(id).time).toMatch(/^0?9:30/)
    expect((await db.tasks.get(id))?.due).toMatchObject({ date: other, time: '09:30' })
    await r.unmount()
  })
})
