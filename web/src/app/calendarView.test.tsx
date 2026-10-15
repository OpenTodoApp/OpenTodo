// @vitest-environment happy-dom
// Calendar is one destination (OpenSpec change ux-overhaul, time-blocking "Day
// and Week calendar views"): it remembers Day or Week per device, renders through
// the page template, and its planning list lives in the shell's panel slot.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCalendarMode } from '../lib/calendarMode'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { panelOccupant, resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { parseRoute } from './router'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
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
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

describe('one Calendar destination', () => {
  it('remembers Day or Week for /calendar and renders the range controls in the page header', async () => {
    const r = await render(<CalendarView mode="week" />)
    await flush(50)
    expect(localStorage.getItem('ot.calendar.mode')).toBe('week')
    expect(readCalendarMode()).toBe('week')
    expect(parseRoute('/calendar')).toEqual({ view: 'week' })
    expect(r.container.querySelector('[data-calendar-page="week"]')).toBeTruthy()

    const header = r.container.querySelector('[data-page-header]')!
    expect(header).toBeTruthy()
    expect(r.container.querySelectorAll('h1')).toHaveLength(1)
    expect(header.querySelector('[role="group"][aria-label="Range"]')).toBeTruthy()
    expect(header.querySelector('[role="group"][aria-label="Calendar range"] [aria-pressed="true"]')?.textContent).toBe('Week')
    expect(header.querySelector('[data-help-screen="calendar"]')).toBeTruthy()

    await r.rerender(<CalendarView mode="day" />)
    await flush(20)
    expect(readCalendarMode()).toBe('day')
    expect(parseRoute('/calendar')).toEqual({ view: 'day' })
    await r.unmount()
  })

  it('Plan from a list opens the planning list in the panel slot, with a menu for its source', async () => {
    await createTask({ title: 'Renew passport' })
    const home = await createProject({ name: 'Home' })
    await createTask({ title: 'Paint the fence', project_id: home })
    const r = await render(<><CalendarView mode="day" /><PanelHost /></>)
    await flush(50)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()

    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await flush(30)
    const plan = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent?.includes('Plan from a list'))!
    expect(plan).toBeTruthy()
    await click(plan)
    await flush(30)
    expect(panelOccupant()).toMatchObject({ kind: 'custom', key: 'calendar-plan' })
    await waitFor(() => document.querySelector('[data-panel-frame="calendar-plan"] [data-tray-task]') !== null)
    const frame = document.querySelector('[data-panel-frame="calendar-plan"]')!
    // Inbox is the default source; the picker is a design-system menu.
    expect([...frame.querySelectorAll('[data-tray-task]')].map((b) => b.textContent)).toEqual(['Renew passport'])
    const source = frame.querySelector('button[aria-label="Plan from"]')!
    expect(source.textContent).toContain('Inbox')
    await click(source)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find((e) => e.textContent?.trim() === 'Home')!)
    await waitFor(() => [...frame.querySelectorAll('[data-tray-task]')].map((b) => b.textContent).join() === 'Paint the fence')
    expect(localStorage.getItem('opentodo.calendar.tray')).toBe(`project:${home}`)

    // Escape empties the slot; the menu item reads "Plan from a list" again.
    await key(document.body, 'Escape')
    await waitFor(() => panelOccupant() === null)
    expect(document.querySelector('[data-panel-frame]')).toBeNull()
    await r.unmount()
  })
})
