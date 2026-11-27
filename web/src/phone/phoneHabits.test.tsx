// @vitest-environment happy-dom
// The Habits screen on a phone (OpenSpec change habits-complete, task 3.1): the ring
// checks in and takes back, an earlier day lists its habits and fixes a missed day,
// a hold opens the row's actions, and the desktop screen stays with the switch off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { occurrenceId } from '../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../lib/ops'
import type { User } from '../lib/types'
import { click, minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate } from '../app/router'
import { Shell } from '../app/Shell'
import { setPhoneUiEnabled } from './prefs'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
let width = 390
const original = window.matchMedia

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0)) // Wednesday 11 November 2026
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  width = 390
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  setPhoneUiEnabled(true)
})
afterEach(() => { vi.useRealTimers(); window.matchMedia = original; vi.unstubAllGlobals(); setPhoneUiEnabled(false) })

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}
const ring = (id: string) => document.querySelector<HTMLElement>(`[data-phone-habit="${id}"] [data-check-in]`)
const meta = () => document.querySelector('[data-phone-head] [data-page-meta]')?.textContent ?? ''

async function open() {
  navigate({ view: 'habits' })
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => !!document.querySelector('[data-phone-habits]'), 'the phone Habits screen')
  return r
}

describe('Habits on a phone', () => {
  it('Check in with a thumb, and take it back with a second tap', async () => {
    const read = await habit('Read', 'every day', '2026-11-11', { evening: true })
    await habit('Run', 'every mon, wed, fri', '2026-11-11')
    const r = await open()
    await waitFor(() => !!ring(read) && meta() === '0 of 2 today', 'the rows and the progress')
    // New habit is in the bar; the strip has seven days ending today, today chosen.
    expect(document.querySelector('[data-phone-header] [data-new-habit]')).not.toBeNull()
    const days = [...document.querySelectorAll<HTMLElement>('[data-strip-day]')]
    expect(days.map((d) => d.dataset.stripDay)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
    expect(days.at(-1)!.getAttribute('aria-pressed')).toBe('true')
    await click(ring(read)!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(read, '2026-11-11')))?.completed_at, 'checked in')
    await waitFor(() => ring(read)!.getAttribute('aria-pressed') === 'true' && meta() === '1 of 2 today', 'pressed and counted')
    await click(ring(read)!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(read, '2026-11-11')))?.deleted_at, 'taken back')
    await waitFor(() => ring(read)!.getAttribute('aria-pressed') === 'false' && meta() === '0 of 2 today', 'due again')
    expect((await db.tasks.get(read))!.due?.date).toBe('2026-11-11')
    await r.unmount()
  })

  it('Fix yesterday: an earlier day lists its habits, and the ring sets the day without moving the habit', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-09')
    await completeTask(stretch, { today: '2026-11-09' })
    await updateTask(stretch, { due: { date: '2026-11-11' } }) // the 10th was missed
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-11')
    const r = await open()
    await waitFor(() => !!ring(stretch), 'the rows')
    await click(document.querySelector<HTMLElement>('[data-strip-day="2026-11-10"]')!)
    // Run did not repeat on Tuesday and has no history then: it is not listed.
    await waitFor(() => !document.querySelector(`[data-phone-habit="${run}"]`) && meta() === '0 of 1', 'yesterday')
    expect(ring(stretch)!.querySelector('[data-ring]')!.getAttribute('data-ring')).toBe('missed')
    await click(ring(stretch)!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(stretch, '2026-11-10')))?.completed_at, 'yesterday done')
    await waitFor(() => meta() === '1 of 1', 'counted')
    expect((await db.tasks.get(stretch))!.due?.date).toBe('2026-11-11')
    await r.unmount()
  })

  it('A hold opens the row\'s actions with Skip this day, Open and Edit', async () => {
    const read = await habit('Read', 'every day', '2026-11-11', { habit_tiny: 'One page' })
    const r = await open()
    await waitFor(() => !!ring(read), 'the row')
    // The hold's menu is also a button for a keyboard or a screen reader.
    await click(document.querySelector<HTMLElement>(`[data-phone-habit="${read}"] [aria-haspopup]`)!)
    await waitFor(() => !!document.querySelector('[role="menu"]'), 'the menu')
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent?.trim())
    expect(items).toEqual(['Check in', 'Log the tiny version: One page', 'Skip this day', 'Open', 'Edit…'].map((s) => expect.stringContaining(s)))
    await r.unmount()
  })

  it('Off: the desktop screen with the switch off or from 768 px', async () => {
    await habit('Read', 'every day', '2026-11-11')
    setPhoneUiEnabled(false)
    navigate({ view: 'habits' })
    let r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-habits-page]'), 'the screen')
    expect(document.querySelector('[data-phone-habits]')).toBeNull()
    await r.unmount()
    setPhoneUiEnabled(true)
    width = 1024
    r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-habits-page]'), 'the screen')
    expect(document.querySelector('[data-phone-habits]')).toBeNull()
    await r.unmount()
  })
})
