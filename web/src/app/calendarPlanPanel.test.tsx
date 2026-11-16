// @vitest-environment happy-dom
// The planning list stays open across the Calendar (GitHub issue 350, time-blocking
// "Planning list and phone agenda"): moving to the previous or next day, week or
// month and switching Day, Week, Month or Plan keep it; its close button, Escape or
// leaving the Calendar close it. The list's actions follow the view on screen.
import 'fake-indexeddb/auto'
import { act, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { getTask } from '../lib/localData'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, minWidthPx, render, waitFor } from '../ui/test-utils'
import { bulkToast } from './bulk/toastStore'
import { PX_PER_MIN } from './calendar/grid'
import { openPlanPanel } from './calendar/PlanPanel'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { closePanelIfStale, panelOccupant, resetPanel, setPanelTaskId } from './panel'
import { PanelHost } from './PanelHost'
import { navigate, useRoute } from './router'

/** The part of the shell that matters here: the route picks the view, and every route change drops a stale panel. */
function Calendar() {
  const route = useRoute()
  useEffect(() => { closePanelIfStale(location.pathname) }, [route])
  if (route.view === 'day' || route.view === 'week') return <CalendarView mode={route.view} date={route.date} />
  if (route.view === 'month') return <MonthView date={route.date} />
  if (route.view === 'plan') return <PlanView date={route.date} />
  return <p>elsewhere</p>
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  navigate({ view: 'day' }, { replace: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  navigate({ view: 'inbox' }, { replace: true })
})

const planList = () => document.querySelector('[data-panel-frame="calendar-plan"]')
const header = () => document.querySelector('[data-page-header]')!
const button = (label: string) => header().querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
const rangeButton = (label: string) => [...header().querySelectorAll<HTMLElement>('[aria-label="Calendar range"] button')].find((b) => b.textContent === label)!

async function openPlanList() {
  await waitFor(() => !!document.querySelector('[data-page-header] button[aria-label="More actions"]'), 'the page header')
  await click(button('More actions'))
  await waitFor(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].some((e) => e.textContent?.includes('Plan from a list')), 'the actions menu')
  await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.includes('Plan from a list'))!)
  await waitFor(() => planList() !== null)
}

describe('the planning list across the Calendar', () => {
  it('stays open through day, week and month navigation and range switches, and closes on Escape', async () => {
    await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()

    for (const step of [
      () => click(button('Next day')),
      () => click(button('Previous day')),
      () => click(rangeButton('Week')),
      () => click(button('Next week')),
      () => click(rangeButton('Month')),
      () => click(button('Next month')),
      () => click(rangeButton('Plan')),
      () => click(rangeButton('Day')),
    ]) {
      await step()
      await flush()
      expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'calendar-plan' })
      expect(planList()).toBeTruthy()
    }

    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    await r.unmount()
  })

  it('closes when the user leaves the Calendar', async () => {
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    navigate({ view: 'today' })
    await waitFor(() => panelOccupant() === null)
    await r.unmount()
  })

  it('places a task with the view on screen after a switch to Month', async () => {
    const id = await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    await click(rangeButton('Month'))
    await waitFor(() => !!document.querySelector('[data-calendar-page="month"]'), 'the month')
    await waitFor(() => planList()?.querySelector('[data-tray-task]') !== null)
    await key(planList()!.querySelector<HTMLElement>('[data-tray-task]')!, 's')
    await waitFor(async () => (await getTask(id))?.due?.date === '2026-10-14', 'the task placed')
    expect((await getTask(id))?.due).toEqual({ date: '2026-10-14' })
    await r.unmount()
  })

  // GitHub issue 352: after `s` in the list the keys drive the placement, not the list.
  for (const view of ['day', 'week'] as const) {
    it(`${view}: s, arrows and Enter place a task from the list with the keyboard only, then focus moves to the next task`, async () => {
      navigate({ view }, { replace: true })
      const id = await createTask({ title: 'Renew passport' })
      await createTask({ title: 'Call the plumber' })
      const r = await render(<><Calendar /><PanelHost /></>)
      await openPlanList()
      await waitFor(() => planList()!.querySelectorAll('[data-tray-task]').length === 2)
      const item = planList()!.querySelector<HTMLElement>(`[data-tray-task="${id}"]`)!
      item.focus()
      await key(item, 's')
      const at = () => header().textContent!.match(/at (\d\d:\d\d)/)?.[1]
      await waitFor(() => !!at() && !planList()!.contains(document.activeElement), 'placing, focus on the grid')
      const start = at()!
      expect(start).toBeTruthy()
      expect(planList()!.contains(document.activeElement)).toBe(false)
      for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowDown']) { await key(document.activeElement!, k); await flush() }
      const [h, m] = start.split(':').map(Number)
      const moved = h * 60 + m + 30
      const time = `${String(Math.floor(moved / 60)).padStart(2, '0')}:${String(moved % 60).padStart(2, '0')}`
      await waitFor(() => at() === time, 'thirty minutes later')
      await key(document.activeElement!, 'Enter')
      await waitFor(async () => !!(await getTask(id))?.due, 'the task placed')
      expect((await getTask(id))?.due).toEqual({ date: '2026-10-14', time })
      expect(at()).toBeUndefined()
      expect(panelOccupant()).toMatchObject({ key: 'calendar-plan' })
      // The placed task left the Inbox list; focus is on the next one, ready for another `s`.
      await waitFor(() => (document.activeElement as HTMLElement | null)?.textContent === 'Call the plumber')
      await r.unmount()
    })
  }

  it('Escape cancels a placement from the list, keeps the list open and gives focus back to the task', async () => {
    navigate({ view: 'week' }, { replace: true })
    const id = await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    await waitFor(() => planList()?.querySelector('[data-tray-task]') !== null)
    const item = planList()!.querySelector<HTMLElement>('[data-tray-task]')!
    item.focus()
    await key(item, 's')
    await waitFor(() => header().textContent!.includes('Placing'), 'placing')
    await key(document.activeElement!, 'ArrowDown')
    await key(document.activeElement!, 'Escape')
    await waitFor(() => !header().textContent!.includes('Placing') && (document.activeElement as HTMLElement).dataset.trayTask === id, 'placing cancelled, focus back')
    expect(panelOccupant()).toMatchObject({ key: 'calendar-plan' })
    expect((document.activeElement as HTMLElement).dataset.trayTask).toBe(id)
    expect((await getTask(id))?.due).toBeFalsy()
    await r.unmount()
  })
})

// Whether the list is open is remembered on the device (GitHub issue 384, plan-list-remembered).
describe('the planning list is remembered', () => {
  const original = window.matchMedia
  function viewport(px: number) {
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= px, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  beforeEach(() => viewport(1280))
  afterEach(() => { window.matchMedia = original })

  async function leaveAndReturn(view: 'week' | 'month' = 'week') {
    navigate({ view: 'today' })
    await waitFor(() => panelOccupant() === null)
    navigate({ view })
    await waitFor(() => !!document.querySelector(`[data-calendar-page="${view}"]`), 'the Calendar again')
    await flush()
  }

  it('opens again on return, and stays closed once closed', async () => {
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    await leaveAndReturn()
    await waitFor(() => planList() !== null)
    await leaveAndReturn('month')
    await waitFor(() => planList() !== null)

    await click(planList()!.querySelector<HTMLElement>('[data-overlay-close]')!)
    await waitFor(() => panelOccupant() === null)
    await leaveAndReturn()
    expect(planList()).toBeNull()
    await r.unmount()
  })

  it('Escape remembers it closed; a task opened from the Calendar does not', async () => {
    const id = await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    // Opening a task from the Calendar takes the slot or the page, not the user's choice about the list.
    setPanelTaskId(id)
    await waitFor(() => planList() === null)
    navigate({ view: 'week' })
    await waitFor(() => planList() !== null)

    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    await leaveAndReturn()
    expect(planList()).toBeNull()
    await r.unmount()
  })

  it('does not open by itself on a phone', async () => {
    const r = await render(<><Calendar /><PanelHost /></>)
    await openPlanList()
    viewport(390)
    await leaveAndReturn()
    expect(planList()).toBeNull()
    await r.unmount()
  })
})

// On a phone the list covers the calendar: tap a task, then a time (plan-list-tap-to-place, #1433).
describe('tap to place from the planning list', () => {
  const original = window.matchMedia
  function viewport(px: number) {
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= px, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  afterEach(() => { window.matchMedia = original })
  const bar = () => document.querySelector<HTMLElement>('[data-tap-place]')
  const day = () => document.querySelector<HTMLElement>('[data-drop-day="2026-10-14"]')!
  /** A tap on the day column at a clock time (the column's top is at 0 in this environment). */
  const tapAt = (el: HTMLElement, minutes: number) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: minutes * PX_PER_MIN + 1 }))

  async function tapFirst(title: string) {
    // On a phone the menu lives in the shell's bar; open the list as its item does.
    await waitFor(() => !!document.querySelector('[data-calendar-page]'), 'the calendar')
    act(() => openPlanPanel())
    await waitFor(() => planList() !== null, 'the list')
    await waitFor(() => [...planList()!.querySelectorAll<HTMLElement>('[data-tray-task]')].some((e) => e.textContent?.includes(title)))
    await click([...planList()!.querySelectorAll<HTMLElement>('[data-tray-task]')].find((e) => e.textContent?.includes(title))!)
  }

  it('on a phone: a tap on a task, then on 14:30 in the Day, plans it there with Undo and brings the list back', async () => {
    viewport(390)
    const id = await createTask({ title: 'Call the plumber' })
    await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await tapFirst('Call the plumber')
    // The list stepped aside; the bar names the task, Cancel has focus, the status is announced.
    await waitFor(() => !!bar(), 'the bar')
    expect(planList()).toBeNull()
    expect(bar()!.querySelector('[role="status"]')!.textContent).toBe('Tap a time to plan Call the plumber')
    expect(document.activeElement?.textContent).toBe('Cancel')
    tapAt(day(), 14 * 60 + 30)
    await waitFor(async () => (await getTask(id))?.due?.time === '14:30', 'planned at 14:30')
    expect((await getTask(id))?.due).toEqual({ date: '2026-10-14', time: '14:30' })
    await waitFor(() => !!bulkToast()?.undoId, 'the Undo toast')
    // The list is back for the next one, and the bar is gone.
    await waitFor(() => planList() !== null && !bar(), 'the list back')
    expect(localStorage.getItem('opentodo.calendarPlan.open')).toBe('1')
    await r.unmount()
  })

  it('Cancel ends the placement without a change and brings the list back', async () => {
    viewport(390)
    const id = await createTask({ title: 'Call the plumber' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await tapFirst('Call the plumber')
    await waitFor(() => !!bar(), 'the bar')
    await click([...bar()!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!)
    await waitFor(() => planList() !== null && !bar(), 'the list back')
    expect((await getTask(id))?.due).toBeFalsy()
    await r.unmount()
  })

  it('a tap on something already in the day does not place', async () => {
    viewport(390)
    const id = await createTask({ title: 'Call the plumber' })
    await createTask({ title: 'Dentist', due: { date: '2026-10-14', time: '09:00' } })
    const r = await render(<><Calendar /><PanelHost /></>)
    await tapFirst('Call the plumber')
    await waitFor(() => !!bar(), 'the bar')
    const block = [...day().querySelectorAll<HTMLElement>('[data-cal-id]')].find((e) => e.textContent?.includes('Dentist'))!
    block.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 9 * 60 * PX_PER_MIN + 1 }))
    await flush()
    expect((await getTask(id))?.due).toBeFalsy()
    expect(bar()).toBeTruthy()
    await r.unmount()
  })

  it('from 1024 px a tap on a list task starts nothing', async () => {
    viewport(1280)
    await createTask({ title: 'Call the plumber' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await tapFirst('Call the plumber')
    await flush()
    expect(bar()).toBeNull()
    expect(planList()).toBeTruthy()
    expect(header().textContent).not.toContain('Placing')
    await r.unmount()
  })
})
