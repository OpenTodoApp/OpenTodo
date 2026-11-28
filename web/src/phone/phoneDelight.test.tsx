// @vitest-environment happy-dom
// The phone's finishing touches (OpenSpec change phone-delight): the day closing, the
// week strip taking drops, the bar's progress, and, through the whole shell, the
// tab counts and holds, the task heading its actions sheet and the project's light.
import 'fake-indexeddb/auto'
import { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { addDaysISO, logicalToday } from '../lib/dates'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { minWidthPx, render, waitFor } from '../ui/test-utils'
import { resetPanel } from '../app/panel'
import { navigate } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'
import { TAB_HOLD_MS } from '../app/TabBar'
import { nextTimedToday } from '../app/tabCounts'
import { PhoneHeader } from './components/PhoneHeader'
import { WeekStrip } from './components/WeekStrip'
import { DAY_CLOSED_DELAY_MS, useDayClosed } from './dayClosed'

const haptics = vi.hoisted(() => ({ played: [] as string[] }))
vi.mock('../lib/haptics', async (orig) => ({ ...(await orig<typeof import('../lib/haptics')>()), playHaptic: (kind: string) => { haptics.played.push(kind) } }))

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
const today = logicalToday()

beforeEach(async () => {
  haptics.played = []
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= 390 : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals(); vi.useRealTimers() })

/** The element once it is there. */
async function found<T extends Element>(get: () => T | null, what: string): Promise<T> {
  await waitFor(() => get() !== null, what)
  return get()!
}

describe('the day closes (D1)', () => {
  function Day({ on, open, done }: { on: boolean; open: number; done: number }) { useDayClosed(on, open, done); return null }

  it('plays the success once when the last open task is completed, after the row has gone', async () => {
    vi.useFakeTimers()
    const r = await render(<Day on open={2} done={3} />)
    await r.rerender(<Day on open={1} done={4} />)
    await r.rerender(<Day on open={0} done={4} />)
    // The done count can come a render later.
    await r.rerender(<Day on open={0} done={5} />)
    expect(haptics.played).toEqual([])
    await act(async () => { vi.advanceTimersByTime(DAY_CLOSED_DELAY_MS) })
    expect(haptics.played).toEqual(['success'])
    await r.unmount()
  })

  it('plays nothing when Today opens empty, or when the last task is moved away', async () => {
    vi.useFakeTimers()
    const a = await render(<Day on open={0} done={4} />)
    await act(async () => { vi.advanceTimersByTime(DAY_CLOSED_DELAY_MS) })
    await a.unmount()
    const b = await render(<Day on open={1} done={4} />)
    await b.rerender(<Day on open={0} done={4} />)
    await act(async () => { vi.advanceTimersByTime(DAY_CLOSED_DELAY_MS) })
    await b.unmount()
    expect(haptics.played).toEqual([])
  })
})

describe('the week strip takes drops (D5)', () => {
  it('every day carries its drop key, a day without tasks too', async () => {
    const r = await render(<WeekStrip today={today} counts={new Map([[addDaysISO(today, 1), 2]])} onDay={() => {}} />)
    const days = [...r.container.querySelectorAll<HTMLElement>('[data-week-day]')]
    expect(days.map((d) => d.dataset.taskDrop)).toEqual(Array.from({ length: 7 }, (_, i) => `day:${addDaysISO(today, i + 1)}`))
    await r.unmount()
  })
})

describe('the bar follows the screen (D9)', () => {
  it('shows the progress after the title once the bar has the title', async () => {
    const r = await render(<PhoneHeader lead={null} title="Today" shown progress={<span data-bar-progress>3/10</span>} />)
    expect(r.container.querySelector('[data-phone-header] [data-bar-progress]')?.textContent).toBe('3/10')
    await r.unmount()
  })
})

describe('the hold on Today (D7)', () => {
  it('opens the first open task due today at a time still ahead', () => {
    const t = (id: string, time?: string, date = today) => ({ id, completed_at: null, deleted_at: null, due: { date, ...(time ? { time } : {}) } }) as never
    const now = new Date(`${today}T10:00:00`)
    expect(nextTimedToday([t('past', '09:00'), t('late', '15:00'), t('soon', '11:00'), t('untimed'), t('tomorrow', '10:30', addDaysISO(today, 1))], today, now)).toMatchObject({ id: 'soon' })
    expect(nextTimedToday([t('past', '09:00'), t('untimed')], today, now)).toBeNull()
  })
})

describe('through the shell', () => {
  function Host() { const [u] = useState(user); return <Shell user={u} onLogout={() => {}} /> }

  it('the Inbox and Today tabs show their counts, in their names too', async () => {
    await createTask({ title: 'An idea' })
    await createTask({ title: 'Another idea' })
    await createTask({ title: 'Call Anna', due: { date: today } })
    navigate({ view: 'upcoming' })
    const r = await render(<Host />)
    const tab = (id: string) => document.querySelector<HTMLElement>(`[data-tab="${id}"]`)!
    await waitFor(() => tab('inbox').querySelector('[data-tab-count]')?.textContent === '2', 'the Inbox count')
    expect(tab('today').querySelector('[data-tab-count]')?.textContent).toBe('1')
    expect(tab('today').textContent).toContain('1 task')
    // The current tab's screen lists its tasks: no count there (phone-calm D8).
    navigate({ view: 'inbox' })
    await waitFor(() => !tab('inbox').querySelector('[data-tab-count]'), 'no count on the current tab')
    expect(tab('inbox').textContent).not.toContain('2 tasks')
    expect(tab('today').querySelector('[data-tab-count]')?.textContent).toBe('1')
    expect(tab('upcoming').querySelector('[data-tab-count]')).toBeNull()
    await r.unmount()
  })

  it('a hold on the Inbox tab opens the Inbox with quick add', async () => {
    navigate({ view: 'today' })
    const r = await render(<Host />)
    const inbox = await found(() => document.querySelector<HTMLElement>('[data-tab="inbox"]'), 'the tab bar')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => { inbox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })) })
    await act(async () => { vi.advanceTimersByTime(TAB_HOLD_MS + 10) })
    vi.useRealTimers()
    // The Inbox is the app's home address.
    await waitFor(() => document.querySelector('[data-add-button]')?.getAttribute('aria-expanded') === 'true' && location.pathname === '/', 'the Inbox with quick add')
    expect(haptics.played).toContain('tick')
    await r.unmount()
  })

  it('the hold sheet of one task is named and headed by it', async () => {
    const work = await createProject({ name: 'Work' })
    await createTask({ title: 'Call the plumber', due: { date: today }, project_id: work })
    navigate({ view: 'today' })
    const r = await render(<Host />)
    const row = await found(() => document.querySelector<HTMLElement>('[data-phone-row]'), 'the row')
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    const head = await found(() => document.querySelector<HTMLElement>('[data-row-preview]'), 'the task at the sheet\'s head')
    expect(head.textContent).toContain('Work')
    expect(document.querySelector('[role="menu"], [role="dialog"]')?.getAttribute('aria-label') ?? '').toContain('Call the plumber')
    await r.unmount()
  })

  it('a project\'s light takes its colour', async () => {
    const work = await createProject({ name: 'Work', color: '#2e7d32' })
    navigate({ view: 'project', id: work })
    const r = await render(<Host />)
    const glow = await found(() => document.querySelector<HTMLElement>('[data-phone-list="project"] .phone-glow'), 'the light')
    expect(glow.dataset.hue).toBe('green')
    await r.unmount()
  })
})
