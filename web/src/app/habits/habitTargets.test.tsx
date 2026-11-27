// @vitest-environment happy-dom
// Targets and amounts on screen (OpenSpec change habit-targets, tasks 3.1, 3.2, 3.3, 3.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { changeAmount, checkIn, setPastDay } from '../../lib/habitActions'
import { habitStats } from '../../lib/habits'
import { occurrenceId } from '../../lib/ids'
import { createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { click, render, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { HabitFormDialog } from './HabitForm'
import HabitsScreen from './HabitsScreen'
import { stripHabits } from './TodayStrip'

const originalMedia = window.matchMedia
afterEach(() => { window.matchMedia = originalMedia })
beforeEach(async () => {
  // These tests read the habit rows, which the screen shows below 640 px (habits-board D1).
  window.matchMedia = ((media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as typeof window.matchMedia
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 13, 12, 0)) // Friday 13 November 2026
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

async function habit(title: string, extra: Record<string, unknown>): Promise<string> {
  const id = await createTask({ title, due: { date: '2026-11-13' }, recurrence: 'every day' })
  await updateTask(id, { habit: true, ...extra })
  return id
}

const TODAY = '2026-11-13'
const water = (id: string) => db.tasks.get(id).then((x) => x!)
const rows = async (id: string) => db.tasks.filter((x) => x.id === id || x.series_id === id).toArray()
const stats = async (id: string) => habitStats(await water(id), await rows(id), TODAY, { tallies: await db.habitTallies.toArray() })

describe('the New habit form (3.1)', () => {
  it('creates Gym three times a week and Water with 8 glasses', async () => {
    const r = await render(<HabitFormDialog req={{}} task={null} />)
    await type(document.querySelector<HTMLInputElement>('[data-habit-title]')!, 'Gym')
    await click([...document.querySelectorAll<HTMLElement>('[data-habit-often] button')].find((b) => b.textContent === 'Times per week')!)
    expect(document.querySelector('[data-habit-amount]')).toBeNull()
    await type(document.querySelector<HTMLInputElement>('[data-habit-times]')!, '3')
    await click(document.querySelector('[data-habit-save]')!)
    await waitFor(async () => (await db.tasks.filter((x) => x.title === 'Gym').count()) === 1, 'Gym')
    expect(await db.tasks.filter((x) => x.title === 'Gym').first()).toMatchObject({ recurrence: 'every day', habit: true, habit_target: 3, habit_period: 'week', habit_amount: 0 })
    await r.unmount()
    const r2 = await render(<HabitFormDialog req={{}} task={null} />)
    await type(document.querySelector<HTMLInputElement>('[data-habit-title]')!, 'Water')
    await type(document.querySelector<HTMLInputElement>('[data-habit-goal]')!, '8')
    await type(document.querySelector<HTMLInputElement>('[data-habit-unit]')!, 'glasses')
    await click(document.querySelector('[data-habit-save]')!)
    await waitFor(async () => (await db.tasks.filter((x) => x.title === 'Water').count()) === 1, 'Water')
    expect(await db.tasks.filter((x) => x.title === 'Water').first()).toMatchObject({ recurrence: 'every day', habit_amount: 8, habit_unit: 'glasses', habit_step: 1, habit_target: 0 })
    await r2.unmount()
  })
})

describe('amounts (3.2)', () => {
  it('Eight glasses, Reaching the amount, Fixing a mistake', async () => {
    const id = await habit('Water', { habit_amount: 8, habit_unit: 'glasses' })
    for (let i = 0; i < 5; i++) await checkIn(id, false, { today: TODAY })
    // "5 of 8 glasses", partial and kept, not yet completed.
    expect(await stats(id)).toMatchObject({ amount: 5, goal: 8, pending: true })
    expect(await db.tasks.get(occurrenceId(id, TODAY))).toBeUndefined()
    expect(await db.habitTallies.count()).toBe(1)
    for (let i = 0; i < 3; i++) await checkIn(id, false, { today: TODAY })
    const record = await db.tasks.get(occurrenceId(id, TODAY))
    expect(record?.completed_at).not.toBeNull()
    expect((await water(id)).due?.date).toBe('2026-11-14')
    expect((await stats(id))!.amount).toBe(8)
    // Subtract: 7 of 8, partial again, the completion undone.
    await changeAmount(id, { add: -1 }, { today: TODAY })
    expect((await stats(id))!.amount).toBe(7)
    expect((await db.tasks.get(occurrenceId(id, TODAY)))?.deleted_at).not.toBeNull()
  })

  it('an exact amount sets the own tally to the rest', async () => {
    const id = await habit('Water', { habit_amount: 8, habit_unit: 'glasses' })
    await db.habitTallies.put({ id: 'other', series_id: id, date: TODAY, device: 'phone-b', count: 3, created_at: 1, deleted_at: null, _clock: {} })
    await changeAmount(id, { exact: 5 }, { today: TODAY })
    expect((await stats(id))!.amount).toBe(5)
    const own = (await db.habitTallies.toArray()).find((x) => x.id !== 'other')!
    expect(own.count).toBe(2)
  })
})

describe('targets on screen (3.3, 3.4)', () => {
  it('Read a target bar: "This week, 2 of 3" and two of three parts filled; Target met leaves the strip', async () => {
    const gym = await habit('Gym', { habit_target: 3, habit_period: 'week' })
    await setPastDay(gym, '2026-11-09', 'done', Date.now(), TODAY)
    await setPastDay(gym, '2026-11-12', 'done', Date.now(), TODAY)
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${gym}"] [data-target-bar]`), 'the bar')
    const bar = document.querySelector<HTMLElement>(`[data-habit-row="${gym}"] [data-target-bar]`)!
    expect(bar.getAttribute('aria-label')).toBe('This week, 2 of 3')
    expect(bar.querySelectorAll('[data-part="done"]')).toHaveLength(2)
    expect(document.querySelector(`[data-habit-row="${gym}"] [data-habit-measure]`)!.textContent).toBe('2 of 3 this week')
    await r.unmount()
    const all = await db.tasks.toArray()
    expect(stripHabits(all, TODAY).map((h) => h.task.id)).toContain(gym)
    await checkIn(gym, false, { today: TODAY })
    // Met on Friday: kept today, then gone from the strip on Saturday until Monday.
    expect(stripHabits(await db.tasks.toArray(), TODAY).find((h) => h.task.id === gym)?.kept).toBe(true)
    expect(stripHabits(await db.tasks.toArray(), '2026-11-14').map((h) => h.task.id)).not.toContain(gym)
    expect(stripHabits(await db.tasks.toArray(), '2026-11-16').map((h) => h.task.id)).toContain(gym)
  })
})
