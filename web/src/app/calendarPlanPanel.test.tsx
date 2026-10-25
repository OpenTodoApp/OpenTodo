// @vitest-environment happy-dom
// The planning list stays open across the Calendar (GitHub issue 350, time-blocking
// "Planning list and phone agenda"): moving to the previous or next day, week or
// month and switching Day, Week, Month or Plan keep it; its close button, Escape or
// leaving the Calendar close it. The list's actions follow the view on screen.
import 'fake-indexeddb/auto'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { getTask } from '../lib/localData'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, minWidthPx, render } from '../ui/test-utils'
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
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const planList = () => document.querySelector('[data-panel-frame="calendar-plan"]')
const header = () => document.querySelector('[data-page-header]')!
const button = (label: string) => header().querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
const rangeButton = (label: string) => [...header().querySelectorAll<HTMLElement>('[aria-label="Calendar range"] button')].find((b) => b.textContent === label)!

async function openPlanList() {
  await click(button('More actions'))
  await flush(30)
  await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.includes('Plan from a list'))!)
  await waitFor(() => planList() !== null)
}

describe('the planning list across the Calendar', () => {
  it('stays open through day, week and month navigation and range switches, and closes on Escape', async () => {
    await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await flush(50)
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
      await flush(40)
      expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'calendar-plan' })
      expect(planList()).toBeTruthy()
    }

    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    await r.unmount()
  })

  it('closes when the user leaves the Calendar', async () => {
    const r = await render(<><Calendar /><PanelHost /></>)
    await flush(50)
    await openPlanList()
    navigate({ view: 'today' })
    await waitFor(() => panelOccupant() === null)
    await r.unmount()
  })

  it('places a task with the view on screen after a switch to Month', async () => {
    const id = await createTask({ title: 'Renew passport' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await flush(50)
    await openPlanList()
    await click(rangeButton('Month'))
    await flush(50)
    expect(document.querySelector('[data-calendar-page="month"]')).toBeTruthy()
    await waitFor(() => planList()?.querySelector('[data-tray-task]') !== null)
    await key(planList()!.querySelector<HTMLElement>('[data-tray-task]')!, 's')
    for (let t = 0; t < 2000; t += 20) {
      if ((await getTask(id))?.due?.date === '2026-10-14') break
      await flush(20)
    }
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
      await flush(50)
      await openPlanList()
      await waitFor(() => planList()!.querySelectorAll('[data-tray-task]').length === 2)
      const item = planList()!.querySelector<HTMLElement>(`[data-tray-task="${id}"]`)!
      item.focus()
      await key(item, 's')
      await flush(30)
      const at = () => header().textContent!.match(/at (\d\d:\d\d)/)?.[1]
      const start = at()!
      expect(start).toBeTruthy()
      expect(planList()!.contains(document.activeElement)).toBe(false)
      for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowDown']) { await key(document.activeElement!, k); await flush(10) }
      const [h, m] = start.split(':').map(Number)
      const moved = h * 60 + m + 30
      const time = `${String(Math.floor(moved / 60)).padStart(2, '0')}:${String(moved % 60).padStart(2, '0')}`
      expect(at()).toBe(time)
      await key(document.activeElement!, 'Enter')
      for (let t = 0; t < 2000 && !(await getTask(id))?.due; t += 20) await flush(20)
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
    await flush(50)
    await openPlanList()
    await waitFor(() => planList()?.querySelector('[data-tray-task]') !== null)
    const item = planList()!.querySelector<HTMLElement>('[data-tray-task]')!
    item.focus()
    await key(item, 's')
    await flush(30)
    expect(header().textContent).toContain('Placing')
    await key(document.activeElement!, 'ArrowDown')
    await key(document.activeElement!, 'Escape')
    await flush(30)
    expect(header().textContent).not.toContain('Placing')
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
    await flush(60)
  }

  it('opens again on return, and stays closed once closed', async () => {
    const r = await render(<><Calendar /><PanelHost /></>)
    await flush(50)
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
    await flush(50)
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
    await flush(50)
    await openPlanList()
    viewport(390)
    await leaveAndReturn()
    expect(planList()).toBeNull()
    await r.unmount()
  })
})
