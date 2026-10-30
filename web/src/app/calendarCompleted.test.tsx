// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CALENDAR_COMPLETED_META_KEY, GRID_PREFS_META_KEY } from '../lib/calendar'
import { db, getMeta, setMeta } from '../lib/db'
import { setCalendarShowCompleted } from '../lib/localData'
import { completeTask, createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { click, key, render, waitFor } from '../ui/test-utils'
import { PageActions, usePageBar } from '../ui'
import { CalendarView } from './CalendarView'
import { MonthView } from './MonthView'
import { PlanView } from './PlanView'
import { resetPanel } from './panel'
import { openedTask, resetTaskPage } from './taskPage.testkit'

const DATE = '2026-10-14'
const originalMedia = window.matchMedia

function viewport(width: number) {
  window.matchMedia = ((media: string) => ({
    matches: [...media.matchAll(/(min|max)-width:\s*([\d.]+)(px|rem)/g)].every((m) => {
      const px = Number(m[2]) * (m[3] === 'rem' ? 16 : 1)
      return m[1] === 'min' ? width >= px : width <= px
    }),
    media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskPage()
  localStorage.clear()
  viewport(1280)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMedia
  resetPanel()
})

const modes = {
  day: () => <CalendarView mode="day" date={DATE} />,
  week: () => <CalendarView mode="week" date={DATE} />,
  month: () => <MonthView date={DATE} />,
  plan: () => <PlanView date={DATE} />,
}
const taskRow = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-cal-id="${id}"], [data-month-task="${id}"], [data-plan-task="${id}"]`)
const toggle = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-calendar-completed-toggle]')!
/** The shell normally renders the overflow menu that a phone header declares. */
function PhoneMenu() {
  const bar = usePageBar()
  return bar ? <PageActions overflow={bar.overflow} /> : null
}
async function controlAtWidth(root: ParentNode) {
  if (toggle(root)) return toggle(root)
  await click(root.querySelector('[aria-label="More actions"]')!)
  await waitFor(() => !!document.querySelector('[data-calendar-completed-toggle]'))
  return document.querySelector<HTMLButtonElement>('[data-calendar-completed-toggle]')!
}

describe.each([1280, 390])('completed calendar tasks at %i px', (width) => {
  it.each(Object.entries(modes))('%s defaults off, includes completed work only when enabled and keeps capacity unchanged', async (_mode, view) => {
    viewport(width)
    const open = await createTask({ title: 'Still to do', due: { date: DATE, time: '10:00' }, estimate_minutes: 30 })
    const done = await createTask({ title: 'Already done', due: { date: DATE, time: '09:00' }, estimate_minutes: 180 })
    const lane = await createTask({ title: 'Finished all day', due: { date: DATE } })
    await completeTask(done)
    await completeTask(lane)
    const r = await render(<>{view()}<PhoneMenu /></>)
    await waitFor(() => !!taskRow(r.container, open))
    expect(await getMeta(CALENDAR_COMPLETED_META_KEY, false)).toBe(false)
    expect(taskRow(r.container, done)).toBeNull()
    const capacity = () => [...r.container.querySelectorAll('[data-capacity]')].map((e) => e.textContent)
    const before = capacity()
    const writes = await db.outbox.count()
    const control = await controlAtWidth(r.container)
    expect(control.textContent?.trim()).toBe('Show completed tasks')
    expect(control.getAttribute(width === 1280 ? 'aria-pressed' : 'aria-checked')).toBe('false')
    await click(control)
    await waitFor(() => !!taskRow(r.container, done) && !!taskRow(r.container, lane))
    expect(await getMeta(CALENDAR_COMPLETED_META_KEY, false)).toBe(true)
    for (const id of [done, lane]) {
      expect(taskRow(r.container, id)!.querySelector('.line-through')).toBeTruthy()
      expect(taskRow(r.container, id)!.textContent).toContain('(completed)')
      expect(taskRow(r.container, id)!.textContent).not.toContain('read-only')
      expect(taskRow(r.container, id)!.classList.contains('cursor-grab')).toBe(false)
    }
    expect(taskRow(r.container, done)!.querySelector('[data-resize-handle]')).toBeNull()
    expect(capacity()).toEqual(before)
    expect(await db.outbox.count()).toBe(writes)
    const active = await controlAtWidth(r.container)
    expect(active.textContent?.trim()).toBe('Show completed tasks')
    expect(active.getAttribute(width === 1280 ? 'aria-pressed' : 'aria-checked')).toBe('true')
    await click(active)
    await waitFor(() => !taskRow(r.container, done) && !taskRow(r.container, lane))
    expect(taskRow(r.container, open)).toBeTruthy()
    expect(await db.outbox.count()).toBe(writes)
    await r.unmount()
  })
})

describe.each(['month', 'plan'] as const)('%s completed-task permissions', (mode) => {
  it.each(['editor', 'viewer'] as const)('announces read-only only for a real viewer, with role %s', async (role) => {
    const project = await createProject({ name: 'Shared' })
    const id = await createTask({ title: 'Finished shared task', due: { date: DATE }, project_id: project })
    await completeTask(id)
    await db.memberships.put({ projectId: project, role, ownerId: 'someone', members: [] })
    await setCalendarShowCompleted(true)
    const r = await render(modes[mode]())
    await waitFor(() => {
      const row = taskRow(r.container, id)
      return !!row?.querySelector('.line-through') && row.textContent?.includes('read-only') === (role === 'viewer')
    })
    const row = taskRow(r.container, id)!
    expect(row.textContent).toContain('(completed)')
    expect(row.textContent?.includes('read-only')).toBe(role === 'viewer')
    expect(row.classList.contains('cursor-grab')).toBe(false)
    await r.unmount()
  })
})

it.each(['day', 'week', 'month'] as const)('%s keeps counted meetings in capacity while showing or hiding completed work', async (mode) => {
  await db.calendarSubscriptions.put({ id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() })
  await db.calendarEvents.put({
    id: 'meeting', subscriptionId: 'work', uid: 'meeting', summary: 'Planning', location: '',
    start: { date: DATE, time: '09:00' }, end: { date: DATE, time: '11:00' }, allDay: false, free: false,
  })
  await setMeta('calendar.events.window', { from: '2026-09-01', to: '2026-11-30', fetchedAt: Date.now() })
  await setMeta(GRID_PREFS_META_KEY, { countEvents: true })
  await createTask({ title: 'Still to do', due: { date: DATE, time: '12:00' }, estimate_minutes: 60 })
  const done = await createTask({ title: 'Already done', due: { date: DATE, time: '14:00' }, estimate_minutes: 180 })
  await completeTask(done)
  const r = await render(modes[mode]())
  const capacity = () => r.container.querySelector(`[data-day-header="${DATE}"] [data-capacity], [data-month-day="${DATE}"] [data-capacity]`)
  await waitFor(() => capacity()?.textContent === '3h / 8h')
  const writes = await db.outbox.count()
  await click(toggle(r.container))
  await waitFor(() => !!taskRow(r.container, done)?.querySelector('.line-through'))
  expect(capacity()?.textContent).toBe('3h / 8h')
  await click(toggle(r.container))
  await waitFor(() => !taskRow(r.container, done))
  expect(capacity()?.textContent).toBe('3h / 8h')
  expect(await db.outbox.count()).toBe(writes)
  await r.unmount()
})

it('remembers the preference through all modes and remounts without overwriting grid preferences or queuing ops', async () => {
  await setMeta('calendar.grid', { startHour: 8, endHour: 17, dayLength: 360, planDays: 21 })
  const r = await render(modes.day())
  await click(toggle(r.container))
  await waitFor(async () => await getMeta(CALENDAR_COMPLETED_META_KEY, false) === true)
  for (const view of Object.values(modes)) {
    await r.rerender(view())
    await waitFor(() => toggle(r.container).getAttribute('aria-pressed') === 'true')
  }
  await r.unmount()
  const reloaded = await render(modes.week())
  await waitFor(() => toggle(reloaded.container).getAttribute('aria-pressed') === 'true')
  expect(await getMeta('calendar.grid', null)).toEqual({ startHour: 8, endHour: 17, dayLength: 360, planDays: 21 })
  expect(await db.outbox.count()).toBe(0)
  await reloaded.unmount()
})

it.each(['true', 1, null])('treats invalid stored preference %s as off', async (invalid) => {
  await setMeta(CALENDAR_COMPLETED_META_KEY, invalid)
  const r = await render(modes.day())
  const open = await createTask({ title: 'Wait for live data', due: { date: DATE } })
  await waitFor(() => !!taskRow(r.container, open))
  expect(toggle(r.container).getAttribute('aria-pressed')).toBe('false')
  await r.unmount()
})

it.each(Object.entries(modes))('%s lets completed tasks be inspected, without keyboard or pointer scheduling writes', async (_mode, view) => {
  const done = await createTask({ title: 'Finished', due: { date: DATE, time: '09:00' }, estimate_minutes: 60 })
  await completeTask(done)
  await setCalendarShowCompleted(true)
  const r = await render(view())
  await waitFor(() => !!taskRow(r.container, done))
  const row = taskRow(r.container, done)!
  await click(row)
  const stored = await db.tasks.get(done)
  const writes = await db.outbox.count()
  await act(async () => {
    row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 150 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 150 }))
  })
  for (const k of ['ArrowDown', 'ArrowRight', 'c', 's']) await key(document.body, k)
  await key(document.body, 'ArrowDown', { shiftKey: true })
  await key(document.body, 'ArrowUp', { shiftKey: true, altKey: true })
  await key(document.body, 'Enter')
  await waitFor(() => openedTask() === done)
  expect(await db.tasks.get(done)).toEqual(stored)
  expect(await db.outbox.count()).toBe(writes)
  await r.unmount()
})

it('updates completion and reopening live, including completed recurring occurrences without extra projections', async () => {
  const id = await createTask({ title: 'Live task', due: { date: DATE, time: '11:00' }, estimate_minutes: 30 })
  await setCalendarShowCompleted(true)
  const r = await render(modes.plan())
  await waitFor(() => !!taskRow(r.container, id))
  await act(async () => { await completeTask(id) })
  await waitFor(() => !!taskRow(r.container, id)?.querySelector('.line-through'))
  await act(async () => { await updateTask(id, { completed_at: null }) })
  await waitFor(() => !!taskRow(r.container, id) && !taskRow(r.container, id)!.querySelector('.line-through'))
  const recurring = await createTask({ title: 'Daily', due: { date: DATE }, recurrence: 'every day', estimate_minutes: 15 })
  let occurrence: string | null = null
  await act(async () => { occurrence = await completeTask(recurring) })
  await waitFor(() => !!occurrence && !!taskRow(r.container, occurrence)?.querySelector('.line-through') && r.container.querySelectorAll('[data-plan-projected]').length === 12)
  const projections = r.container.querySelectorAll('[data-plan-projected]').length
  const capacities = [...r.container.querySelectorAll('[data-capacity]')].map((e) => e.textContent)
  await click(toggle(r.container))
  await waitFor(() => toggle(r.container).getAttribute('aria-pressed') === 'false')
  expect(r.container.querySelectorAll('[data-plan-projected]')).toHaveLength(projections)
  expect([...r.container.querySelectorAll('[data-capacity]')].map((e) => e.textContent)).toEqual(capacities)
  await r.unmount()
})

it('marks completed titles in the expanded overlap list and removes its overflow when hidden', async () => {
  for (let i = 0; i < 8; i++) {
    const id = await createTask({ title: `Finished ${i}`, due: { date: DATE, time: '09:00' }, estimate_minutes: 60 })
    await completeTask(id)
  }
  await setCalendarShowCompleted(true)
  const r = await render(modes.day())
  await waitFor(() => !!r.container.querySelector('[data-overflow]'))
  await click(r.container.querySelector('[data-overflow]')!)
  await waitFor(() => r.container.querySelectorAll('[data-cal-id] .line-through').length === 8)
  expect([...r.container.querySelectorAll('[data-cal-id]')].every((e) => e.textContent?.includes('(completed)'))).toBe(true)
  await click(toggle(r.container))
  await waitFor(() => !r.container.querySelector('[data-overflow], [data-cal-id]'))
  await r.unmount()
})

it('keeps Re-plan and Frames available and never re-plans a visible completed task', async () => {
  const open = await createTask({ title: 'Still behind', due: { date: DATE, time: '09:00' }, estimate_minutes: 30 })
  const done = await createTask({ title: 'Already finished', due: { date: DATE, time: '10:00' }, estimate_minutes: 30 })
  await completeTask(done)
  await setCalendarShowCompleted(true)
  const stored = await db.tasks.get(done)
  const r = await render(modes.day())
  await waitFor(() => r.container.querySelector('[data-replan-entry]')?.textContent?.includes('1 block behind') ?? false)
  await click(r.container.querySelector('[aria-label="More actions"]')!)
  await waitFor(() => !!document.querySelector('[data-replan-item]'))
  expect(document.querySelector('[data-frames-item]')).toBeTruthy()
  await click(document.querySelector('[data-replan-item]')!)
  await waitFor(() => !!document.querySelector('[data-replan-apply]'))
  expect(document.querySelector('[data-replan-summary]')!.textContent).toBe('1 task moves')
  expect(taskRow(r.container, done)!.hasAttribute('data-replan-from')).toBe(false)
  await click(document.querySelector('[data-replan-apply]')!)
  await waitFor(async () => (await db.tasks.get(open))?.due?.time === '12:00')
  expect(await db.tasks.get(done)).toEqual(stored)
  await r.unmount()
})
