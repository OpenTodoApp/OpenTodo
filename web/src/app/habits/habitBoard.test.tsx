// @vitest-environment happy-dom
// The week board, its tiles and the habit's dashboard (OpenSpec change habits-board,
// tasks 2.1 and 3.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { occurrenceId } from '../../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { click, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { HabitPage } from './HabitPage'
import HabitsScreen from './HabitsScreen'

let width = 1280
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
  width = 1280
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.matchMedia = original; resetPanel() })

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}
const cell = (id: string, date: string) => document.querySelector<HTMLElement>(`[data-board-row="${id}"] [data-board-cell="${date}"]`)

describe('the week board', () => {
  it('shows the tiles and seven days; today checks in and takes back; yesterday is set and cleared without moving the habit', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-09')
    await completeTask(stretch, { today: '2026-11-09' })
    await updateTask(stretch, { due: { date: '2026-11-11' } }) // the 10th missed
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-09')
    await completeTask(run, { today: '2026-11-09' })
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!cell(stretch, '2026-11-11'), 'the board')
    expect(document.querySelector('[data-habits-page]')!.getAttribute('data-page-body')).toBe('wide')
    expect([...document.querySelectorAll('[data-board-day]')].map((d) => d.getAttribute('data-board-day'))).toEqual(
      ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
    expect(document.querySelector('[data-tile="today"] [data-tile-value]')!.textContent).toBe('0 of 2')
    expect(document.querySelector('[data-tile="streak"] [data-tile-value]')!.textContent).toBe('1 day')
    // Run does not repeat on Tuesday: a dot, not a control.
    expect(cell(run, '2026-11-10')!.tagName).toBe('SPAN')
    // Yesterday's missed Stretch becomes done, without moving the habit; a second click clears it.
    expect(cell(stretch, '2026-11-10')!.dataset.state).toBe('missed')
    await click(cell(stretch, '2026-11-10')!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(stretch, '2026-11-10')))?.completed_at, 'yesterday done')
    await waitFor(() => cell(stretch, '2026-11-10')!.dataset.state === 'done', 'filled')
    expect((await db.tasks.get(stretch))!.due?.date).toBe('2026-11-11')
    await click(cell(stretch, '2026-11-10')!)
    await waitFor(() => cell(stretch, '2026-11-10')!.dataset.state === 'missed', 'cleared')
    // Today's mark checks in and takes back.
    await click(cell(stretch, '2026-11-11')!)
    await waitFor(() => cell(stretch, '2026-11-11')!.getAttribute('aria-pressed') === 'true', 'checked in')
    await waitFor(() => document.querySelector('[data-tile="today"] [data-tile-value]')!.textContent === '1 of 2', 'counted')
    await click(cell(stretch, '2026-11-11')!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(stretch, '2026-11-11')))?.deleted_at, 'taken back')
    await r.unmount()
  })

  it('an amount habit\'s earlier day opens Set amount; below 640 px the rows stay', async () => {
    const water = await habit('Water', 'every day', '2026-11-09', { habit_amount: 8, habit_unit: 'glasses' })
    await completeTask(water, { today: '2026-11-09' })
    await updateTask(water, { due: { date: '2026-11-11' } })
    let r = await render(<HabitsScreen />)
    await waitFor(() => !!cell(water, '2026-11-10'), 'the board')
    await click(cell(water, '2026-11-10')!)
    await waitFor(() => !!document.querySelector('[data-amount-dialog], [role="dialog"]'), 'Set amount')
    await r.unmount()
    width = 600
    r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${water}"]`), 'the rows')
    expect(document.querySelector('[data-habit-board]')).toBeNull()
    await r.unmount()
  })
})

describe('the habit\'s dashboard', () => {
  it('shows the streak, best, strength and last 30 days tiles and the weekday chart as a list', async () => {
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-02')
    for (const d of ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09']) await completeTask(run, { today: d })
    const r = await render(<HabitPage id={run} />)
    await waitFor(() => !!document.querySelector('[data-weekday-chart]'), 'the page')
    const tile = (id: string) => document.querySelector(`[data-tile="${id}"] dd`)!.textContent
    expect(tile('streak')).toBe('4 days')
    expect(tile('best')).toBe('4 days')
    expect(tile('recent')).toBe('4 of 4')
    const days = [...document.querySelectorAll('[data-weekday-chart] li .sr-only')].map((x) => x.textContent)
    expect(days[0]).toBe('Monday, 2 of 2')
    expect(days[1]).toBe('Tuesday, 0 of 0')
    await r.unmount()
  })
})
