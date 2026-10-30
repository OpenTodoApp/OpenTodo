// @vitest-environment happy-dom
// Re-plan the rest of the day on screen (OpenSpec change replan-the-day, tasks 2.1 to
// 3.5): the header entry and the menu items only while blocks are missed, the preview
// with ghosts that writes nothing until Apply, its live recompute, the phone sheet, the
// one batch with one Undo, and the offline note.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_PREFS_META_KEY } from '../lib/calendar'
import { db, setMeta } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { undoBatch } from '../lib/undo'
import type { CalendarEvent } from '../lib/types'
import { click, flush, key, minWidthPx, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { navigate } from './router'
import { TaskListView } from './TaskListView'
import { bulkToast } from './bulk/toastStore'
import { CalendarView } from './CalendarView'
import { resetPanel } from './panel'
import { commands, type PaletteContext } from './palette/registry'
import { replanRequest } from './signals'

const DAY = '2026-10-14'

function stubMedia(width: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = minWidthPx(q)
    return { matches: min ? width >= min : false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
  })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 13, 30))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  stubMedia(1280)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  await setMeta(GRID_PREFS_META_KEY, { startHour: 6, endHour: 22, dayLength: 480, planDays: 14, countEvents: false })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPanel()
  replanRequest.take()
  navigate({ view: 'inbox' }, { replace: true })
})

const header = () => document.querySelector('[data-page-header]')
const lead = () => header()?.querySelector('[data-page-lead]')?.textContent ?? ''
const ghosts = () => [...document.querySelectorAll<HTMLElement>('[data-replan-ghost]')]
const dueOf = async (id: string) => (await db.tasks.get(id))!.due

/** The spec's half past one: three missed blocks and one in progress. */
async function behind() {
  return {
    a: await createTask({ title: 'Write report', due: { date: DAY, time: '09:00' }, estimate_minutes: 60 }),
    b: await createTask({ title: 'Call Ana', due: { date: DAY, time: '10:30' }, estimate_minutes: 30 }),
    c: await createTask({ title: 'Inbox zero', due: { date: DAY, time: '11:00' } }),
    d: await createTask({ title: 'Standup notes', due: { date: DAY, time: '13:00' }, estimate_minutes: 60 }),
  }
}

async function openMenu() {
  await click(header()!.querySelector<HTMLElement>('button[aria-label="More actions"]')!)
  await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0, 'the actions menu')
}

async function startPreview() {
  await waitFor(() => !!document.querySelector('[data-replan-start]'), 'the entry')
  await click(document.querySelector('[data-replan-start]')!)
  await waitFor(() => !!document.querySelector('[data-replan-bar], [data-testid="replan-sheet"]'), 'the preview')
}

describe('entry points', () => {
  it('the Day header reads "3 blocks behind · Re-plan" and the menu offers it; the block in progress is not counted', async () => {
    await behind()
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => lead().includes('3 blocks behind'), 'the entry')
    expect(lead()).toContain('Re-plan')
    await openMenu()
    expect(document.querySelector('[data-replan-item]')!.textContent).toContain('Re-plan the rest of the day')
    await r.unmount()
  })

  it('nothing behind: no entry, no menu item, no palette command', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 8, 0))
    await behind()
    const r = await render(<CalendarView mode="week" />)
    await waitFor(() => !!document.querySelector('[data-block]'), 'the blocks')
    await flush()
    expect(document.querySelector('[data-replan-entry]')).toBeNull()
    await openMenu()
    expect(document.querySelector('[data-replan-item]')).toBeNull()
    const ctx = { route: { view: 'day' }, user: null, today: DAY, list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false } as PaletteContext
    expect(commands(ctx).some((c) => c.id === 'replan:day')).toBe(false)
    expect(commands({ ...ctx, missedBlocks: 2 }).find((c) => c.id === 'replan:day')?.label).toBe('Re-plan the rest of the day')
    await r.unmount()
  })

  it('another day of the Week does not show the entry', async () => {
    await behind()
    const r = await render(<CalendarView mode="day" date="2026-10-15" />)
    await waitFor(() => !!header(), 'the header')
    await flush()
    expect(document.querySelector('[data-replan-entry]')).toBeNull()
    await r.unmount()
  })

  it('Today’s menu offers it while blocks are missed, and opens the Day view with the preview', async () => {
    mockFetch(noPublicLinks)
    await behind()
    navigate({ view: 'today' }, { replace: true })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => document.querySelectorAll('[data-task-id]').length === 4, 'the tasks')
    await openMenu()
    await waitFor(() => !!document.querySelector('[data-replan-item]'), 'the item')
    await click(document.querySelector('[data-replan-item]')!)
    expect(location.pathname).toBe('/day')
    await r.unmount()
    const day = await render(<CalendarView mode="day" />)
    await waitFor(() => ghosts().length === 3, 'the preview open')
    await day.unmount()
  })

  it('a request (Today’s menu, the palette) opens the Day view with the preview', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 14, 0))
    await createTask({ title: 'A', due: { date: DAY, time: '09:00' } })
    await createTask({ title: 'B', due: { date: DAY, time: '10:00' } })
    replanRequest.set('open')
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => ghosts().length === 2, 'both moves')
    expect(document.querySelector('[data-replan-summary]')!.textContent).toBe('2 tasks move')
    await r.unmount()
  })
})

describe('preview', () => {
  it('draws ghosts and faint originals; Escape writes nothing', async () => {
    const ids = await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => ghosts().length === 3, 'three ghosts')
    expect(document.querySelector('[data-replan-summary]')!.textContent).toBe('3 tasks move')
    // 13:30 is a mark; 13:00-14:00 is in progress, so the first free time is 14:00.
    expect(ghosts().map((g) => g.textContent)).toEqual(['14:00 Write report', '15:00 Call Ana', '15:30 Inbox zero'])
    expect(document.querySelector(`[data-block="${ids.a}"]`)!.className).toContain('ui-block--past')
    expect(document.querySelector(`[data-block="${ids.a}"]`)!.getAttribute('data-replan-from')).toBe('14:00')
    const before = await db.outbox.count()
    await key(document.body, 'Escape')
    await waitFor(() => ghosts().length === 0, 'the ghosts gone')
    expect(await db.outbox.count()).toBe(before)
    expect(await dueOf(ids.a)).toEqual({ date: DAY, time: '09:00' })
    await r.unmount()
  })

  it('pauses dragging while open', async () => {
    const ids = await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    const block = document.querySelector<HTMLElement>(`[data-block="${ids.d}"]`)!
    block.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }))
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 200 }))
    await flush()
    expect(document.querySelector('[data-cal-id="drag-ghost"]')).toBeNull()
    await r.unmount()
  })

  it('recomputes when another device completes a task, and closes with "Nothing to re-plan"', async () => {
    const ids = await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => ghosts().length === 3, 'three moves')
    // As a sync applies it: the row changes underneath.
    await db.tasks.update(ids.b, { completed_at: Date.now() })
    await waitFor(() => ghosts().length === 2, 'two moves')
    expect(document.querySelector('[data-replan-summary]')!.textContent).toBe('2 tasks move')
    await db.tasks.update(ids.a, { completed_at: Date.now() })
    await db.tasks.update(ids.c, { completed_at: Date.now() })
    await waitFor(() => !document.querySelector('[data-replan-bar]'), 'the preview closed')
    expect(bulkToast()?.label).toBe('Nothing to re-plan')
    await r.unmount()
  })

  it('lists what does not fit, with the choice and the deadline warning', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 21, 10))
    await createTask({ title: 'One', due: { date: DAY, time: '09:00' }, estimate_minutes: 30 })
    const late = await createTask({ title: 'Two', due: { date: DAY, time: '10:00' }, estimate_minutes: 30 })
    await db.tasks.update(late, { deadline: DAY })
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => document.querySelector('[data-replan-summary]')?.textContent === '1 task moves · 1 doesn’t fit', 'the summary')
    expect(document.querySelector('[data-replan-late]')).toBeNull()
    const select = document.querySelector<HTMLSelectElement>('[data-replan-choice]')!
    select.value = 'tomorrow'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => !!document.querySelector('[data-replan-late]'), 'the deadline warning')
    expect(document.querySelector('[data-replan-late]')!.textContent).toContain('After its deadline')
    await click(document.querySelector('[data-replan-apply]')!)
    await waitFor(async () => (await dueOf(late))?.date === '2026-10-15', 'moved to tomorrow')
    expect(await dueOf(late)).toEqual({ date: '2026-10-15', time: '10:00' })
    await r.unmount()
  })

  it('on a 390 px screen opens a bottom sheet with "09:00 → 14:00" rows and no ghosts', async () => {
    stubMedia(390)
    await behind()
    const r = await render(<CalendarView mode="day" />)
    // Below 768 px the header's lead line (with the entry) is in the shell's bar; the menu or a request opens it.
    await waitFor(() => !!document.querySelector('[data-block]'), 'the blocks')
    replanRequest.request('open')
    await waitFor(() => !!document.querySelector('[data-testid="replan-sheet"]'), 'the sheet')
    const sheet = document.querySelector('[data-testid="replan-sheet"]')!
    await waitFor(() => sheet.querySelectorAll('[data-replan-move]').length === 3, 'three rows')
    const rows = [...sheet.querySelectorAll<HTMLElement>('[data-replan-move]')].map((li) => li.textContent)
    expect(rows[0]).toBe('09:00 → 14:00Write report')
    expect(ghosts()).toEqual([])
    for (const b of [sheet.querySelector('[data-replan-apply]')!, sheet.querySelector('[data-replan-cancel]')!]) expect(b.className).toContain('min-h-12')
    await click(sheet.querySelector('[data-replan-cancel]')!)
    await waitFor(() => !document.querySelector('[data-testid="replan-sheet"]'), 'the sheet closed')
    await r.unmount()
  })

  it('offline outside the event cache says calendars are unavailable', async () => {
    await db.calendarSubscriptions.put({ id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: 0 })
    await setMeta('calendar.events.window', { from: '2026-12-01', to: '2026-12-31', fetchedAt: Date.now() })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => !!document.querySelector('[data-replan-offline]'), 'the offline note')
    expect(document.querySelector('[data-replan-offline]')!.textContent).toBe('Calendars unavailable offline')
    await r.unmount()
  })
})

describe('apply', () => {
  it('writes one batch of due edits only, and one Undo restores every time', async () => {
    const ids = await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => ghosts().length === 3, 'three moves')
    const before = await db.outbox.count()
    await key(document.body, 'Enter')
    await waitFor(() => bulkToast()?.label === '3 tasks moved', 'the toast')
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.every((o) => o.entity === 'task' && o.field === 'due')).toBe(true)
    expect(ops.map((o) => o.entityId).sort()).toEqual([ids.a, ids.b, ids.c].sort())
    expect(await dueOf(ids.a)).toEqual({ date: DAY, time: '14:00' })
    expect(await dueOf(ids.b)).toEqual({ date: DAY, time: '15:00' })
    expect(await dueOf(ids.c)).toEqual({ date: DAY, time: '15:30' })
    expect(await dueOf(ids.d)).toEqual({ date: DAY, time: '13:00' })

    await undoBatch(bulkToast()!.undoId!)
    expect(await dueOf(ids.a)).toEqual({ date: DAY, time: '09:00' })
    expect(await dueOf(ids.b)).toEqual({ date: DAY, time: '10:30' })
    expect(await dueOf(ids.c)).toEqual({ date: DAY, time: '11:00' })
    await r.unmount()
  })

  it('offline, the grid shows the new times at once and the edits wait in the outbox', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const ids = await behind()
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await click(document.querySelector('[data-replan-apply]')!)
    await waitFor(() => document.querySelector(`[data-block="${ids.a}"]`)?.textContent?.includes('14:00') ?? false, 'the new time drawn')
    expect((await db.outbox.toArray()).some((o) => o.entityId === ids.a && o.field === 'due')).toBe(true)
    await r.unmount()
  })

  it('works around a busy meeting from a subscribed calendar', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 13, 20))
    const meeting: CalendarEvent = { id: 'm', subscriptionId: 'sub1', uid: 'm', summary: 'Sync', location: '', start: { date: DAY, time: '13:30' }, end: { date: DAY, time: '14:30' }, allDay: false, free: false }
    await db.calendarSubscriptions.put({ id: 'sub1', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: 0 })
    await db.calendarEvents.put(meeting)
    await setMeta('calendar.events.window', { from: '2026-09-01', to: '2026-11-30', fetchedAt: Date.now() })
    await createTask({ title: 'A', due: { date: DAY, time: '09:00' }, estimate_minutes: 60 })
    await createTask({ title: 'B', due: { date: DAY, time: '10:00' }, estimate_minutes: 30 })
    const r = await render(<CalendarView mode="day" />)
    await startPreview()
    await waitFor(() => ghosts().length === 2, 'two moves')
    expect(ghosts().map((g) => g.textContent)).toEqual(['14:30 A', '15:30 B'])
    await r.unmount()
  })
})
