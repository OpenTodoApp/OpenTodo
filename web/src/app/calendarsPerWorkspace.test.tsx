// @vitest-environment happy-dom
// Calendars shown per workspace (OpenSpec change calendars-per-workspace, tasks 2.1 and
// 2.2): the Calendars menu holds the device switch and one row per enabled calendar; a
// row hides its calendar in the current workspace only, through the synced user_prefs.
import 'fake-indexeddb/auto'
import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta } from '../lib/db'
import { useCalendarEvents } from '../lib/liveData'
import { applyOps, resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { switchTo } from '../lib/workspaces'
import { PageActions, usePageBar } from '../ui'
import { click, render, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { useTodayCalendar } from './calendar/TodayAgenda'
import { resetPanel } from './panel'

// The prefs row can be held back as still loading, to order it after the events.
const prefsGate = vi.hoisted(() => ({ held: false, listeners: new Set<() => void>() }))
vi.mock('../lib/localData', async (orig) => {
  const actual = await orig<typeof import('../lib/localData')>()
  const subscribe = (fn: () => void) => { prefsGate.listeners.add(fn); return () => prefsGate.listeners.delete(fn) }
  return {
    ...actual,
    useUserPrefsRow: () => {
      const row = actual.useUserPrefsRow()
      return useSyncExternalStore(subscribe, () => prefsGate.held) ? undefined : row
    },
  }
})
function releasePrefs() {
  prefsGate.held = false
  for (const fn of prefsGate.listeners) fn()
}

const DAY = '2026-10-14'
const sub = (id: string, name: string, enabled = true) => ({ id, name, color: '#2563eb', enabled, lastSuccessAt: Date.now() })
const ev = (id: string, subscriptionId: string, time: string) => ({
  id, subscriptionId, uid: id, summary: id, location: '', start: { date: DAY, time }, end: { date: DAY, time: `${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:00` }, allDay: false, free: false,
})
const ws = (id: string, name: string, isDefault = false) => ({ id, name, icon: '', color: '', default: isDefault, role: 'owner' as const, ownerId: 'u1' })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  await db.workspaces.bulkPut([ws('personal', 'Personal', true), ws('work', 'Work')])
  await switchTo('personal')
  await db.calendarSubscriptions.bulkPut([sub('cal-work', 'Work'), sub('cal-family', 'Family'), sub('cal-off', 'Old', false)])
  await db.calendarEvents.bulkPut([ev('standup', 'cal-work', '10:00'), ev('dinner', 'cal-family', '18:00')])
  await setMeta('calendar.events.window', { from: '2026-09-01', to: '2026-11-30', fetchedAt: Date.now() })
})
afterEach(() => {
  prefsGate.held = false
  window.matchMedia = original
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const original = window.matchMedia
const shown = (root: Element, id: string) => root.querySelector(`[data-event="${id}"]`) !== null
const menuRow = (id: string) => document.querySelector<HTMLElement>(`[role="menu"] [data-calendar-row="${id}"]`)

async function openMenu(root: Element) {
  await click(root.querySelector('[data-calendars-menu]')!)
  await waitFor(() => document.querySelector('[role="menu"] [data-calendars-toggle]') !== null, 'the Calendars menu')
}

describe('the Calendars menu', () => {
  it('lists the device switch first, then each enabled calendar by name, without helper text', async () => {
    const r = await render(<CalendarView mode="day" date={DAY} />)
    await waitFor(() => shown(r.container, 'standup') && shown(r.container, 'dinner'), 'both calendars')
    await openMenu(r.container)
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitemcheckbox"]')]
    expect(items.map((i) => i.textContent)).toEqual(['Show calendar events', 'Family', 'Work'])
    expect(items.every((i) => i.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(menuRow('cal-work')!.querySelector('[data-menu-marker] [data-hue]')).not.toBeNull()
    await r.unmount()
  })

  it('hides a calendar in this workspace only, and switching workspace shows it again', async () => {
    const r = await render(<CalendarView mode="day" date={DAY} />)
    await waitFor(() => shown(r.container, 'standup'), 'the event')
    await openMenu(r.container)
    await click(menuRow('cal-work')!)
    await waitFor(() => !shown(r.container, 'standup'), 'Work hidden')
    expect(shown(r.container, 'dinner')).toBe(true)
    // The menu stays open with the row unchecked.
    expect(menuRow('cal-work')!.getAttribute('aria-checked')).toBe('false')
    expect(menuRow('cal-family')!.getAttribute('aria-checked')).toBe('true')
    const row = await db.userPrefs.get(USER_PREFS_ID)
    expect(row?.calendars_hidden).toBe(JSON.stringify({ personal: ['cal-work'] }))
    expect((await db.outbox.toArray()).filter((o) => o.field === 'calendars_hidden')).toHaveLength(1)

    await switchTo('work')
    await waitFor(() => shown(r.container, 'standup'), 'Work shown in the Work workspace')
    await switchTo('personal')
    await waitFor(() => !shown(r.container, 'standup'), 'hidden again in Personal')
    await r.unmount()
  })

  it('shows a new calendar, and the device switch hides every calendar over the rows', async () => {
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: USER_PREFS_ID, field: 'calendars_hidden', value: JSON.stringify({ personal: ['cal-work'] }), ts: Date.now(), device: 'laptop' }] as never)
    const r = await render(<CalendarView mode="day" date={DAY} />)
    await waitFor(() => shown(r.container, 'dinner') && !shown(r.container, 'standup'), 'Family only')
    await db.calendarSubscriptions.put(sub('cal-holidays', 'Holidays'))
    await db.calendarEvents.put(ev('fair', 'cal-holidays', '15:00'))
    await waitFor(() => shown(r.container, 'fair'), 'the new calendar shows')

    await openMenu(r.container)
    expect(menuRow('cal-holidays')!.getAttribute('aria-checked')).toBe('true')
    await click(document.querySelector('[role="menu"] [data-calendars-toggle]')!)
    await waitFor(() => !shown(r.container, 'dinner') && !shown(r.container, 'fair'), 'all hidden on this device')
    await waitFor(() => menuRow('cal-family')!.hasAttribute('disabled'), 'rows disabled')
    expect(menuRow('cal-family')!.getAttribute('aria-checked')).toBe('false')
    await click(document.querySelector('[role="menu"] [data-calendars-toggle]')!)
    await waitFor(() => shown(r.container, 'dinner') && shown(r.container, 'fair'), 'shown again')
    expect(shown(r.container, 'standup')).toBe(false)
    await r.unmount()
  })

  it("follows a value synced from another device, ignoring stale ids and keeping other workspaces' hides", async () => {
    const r = await render(<CalendarView mode="day" date={DAY} />)
    await waitFor(() => shown(r.container, 'standup'), 'the event')
    await applyOps([{ id: 'o2', entity: 'user_prefs', entityId: USER_PREFS_ID, field: 'calendars_hidden', value: JSON.stringify({ personal: ['cal-work', 'cal-gone'], gone: ['cal-family'] }), ts: Date.now(), device: 'laptop' }] as never)
    await waitFor(() => !shown(r.container, 'standup'), 'hidden by the other device')
    expect(shown(r.container, 'dinner')).toBe(true)
    await openMenu(r.container)
    await click(menuRow('cal-family')!)
    await waitFor(() => !shown(r.container, 'dinner'), 'Family hidden')
    // The next write drops the deleted calendar from this workspace and keeps the workspace this device does not list.
    expect((await db.userPrefs.get(USER_PREFS_ID))?.calendars_hidden).toBe(JSON.stringify({ gone: ['cal-family'], personal: ['cal-family', 'cal-work'] }))
    await r.unmount()
  })

  it('below 768 px puts the rows after the page menu\'s Calendars item', async () => {
    window.matchMedia = ((q: string) => ({
      matches: !q.includes('min-width'), media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    function Bar() {
      const bar = usePageBar()
      return bar ? <div data-phone-bar><PageActions overflow={bar.overflow} /></div> : null
    }
    const r = await render(<><Bar /><CalendarView mode="day" date={DAY} /></>)
    await waitFor(() => shown(r.container, 'standup'), 'the event')
    await click(r.container.querySelector('[data-phone-bar] button[aria-label="More actions"]')!)
    await waitFor(() => menuRow('cal-work') !== null, 'the rows')
    const labels = [...document.querySelectorAll('[role="menu"] [role="menuitemcheckbox"]')].map((i) => i.textContent)
    expect(labels.slice(labels.indexOf('Calendars'), labels.indexOf('Calendars') + 3)).toEqual(['Calendars', 'Family', 'Work'])
    const toggle = document.querySelector('[role="menu"] [data-calendars-toggle]')!
    expect(toggle.nextElementSibling?.getAttribute('role')).toBe('separator')
    await click(menuRow('cal-work')!)
    await waitFor(() => !shown(r.container, 'standup'), 'Work hidden')
    await r.unmount()
  })
})

describe("Today's agenda", () => {
  function Agenda() {
    const cal = useTodayCalendar(false, true, DAY)
    return <ul>{cal.timed.map((b) => <li key={b.event.id} data-agenda={b.event.id} />)}</ul>
  }

  it('leaves out calendars hidden in the workspace', async () => {
    await applyOps([{ id: 'o3', entity: 'user_prefs', entityId: USER_PREFS_ID, field: 'calendars_hidden', value: JSON.stringify({ personal: ['cal-work'] }), ts: Date.now(), device: 'laptop' }] as never)
    const r = await render(<Agenda />)
    await waitFor(() => r.container.querySelector('[data-agenda="dinner"]') !== null, 'Family')
    expect(r.container.querySelector('[data-agenda="standup"]')).toBeNull()
    await switchTo('work')
    await waitFor(() => r.container.querySelector('[data-agenda="standup"]') !== null, 'Work in the Work workspace')
    await r.unmount()
  })

  it('never shows a hidden calendar while the prefs row is still loading', async () => {
    await applyOps([{ id: 'o4', entity: 'user_prefs', entityId: USER_PREFS_ID, field: 'calendars_hidden', value: JSON.stringify({ personal: ['cal-work'] }), ts: Date.now(), device: 'laptop' }] as never)
    prefsGate.held = true
    const seen = new Set<string>()
    function Watched() {
      const cached = useCalendarEvents()
      const cal = useTodayCalendar(false, true, DAY)
      for (const b of cal.timed) seen.add(b.event.id)
      return <><span data-cached={cached.length} /><Agenda /></>
    }
    const r = await render(<Watched />)
    await waitFor(() => r.container.querySelector('[data-cached="2"]') !== null, 'the events read before the prefs row')
    expect(seen.size).toBe(0)
    releasePrefs()
    await waitFor(() => r.container.querySelector('[data-agenda="dinner"]') !== null, 'Family')
    expect(seen.has('standup')).toBe(false)
    await r.unmount()
  })
})
