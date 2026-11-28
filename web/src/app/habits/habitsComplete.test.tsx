// @vitest-environment happy-dom
// The desktop side of habits-complete (tasks 2.1 to 2.3): today's progress, taking a
// check-in back from the row, the page and Today's strip, Skip this day, the year
// and Remind me in the form.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { habitReminderId } from '../../lib/habitActions'
import { occurrenceId } from '../../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { TaskListView } from '../TaskListView'
import { HabitFormDialog } from './HabitForm'
import { HabitPage } from './HabitPage'
import HabitsScreen from './HabitsScreen'

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
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); resetPanel() })

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}
const button = (id: string) => document.querySelector<HTMLElement>(`[data-habit-row="${id}"] [data-check-in]`)
const record = async (id: string) => db.tasks.get(occurrenceId(id, '2026-11-11'))

describe('the Habits screen', () => {
  it('reads today\'s progress, and a kept habit\'s button takes the check-in back', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    await habit('Run', 'every mon, wed, fri', '2026-11-11')
    await habit('Piano', 'every tue', '2026-11-17')
    const r = await render(<HabitsScreen />)
    const meta = () => document.querySelector('[data-page-meta]')?.textContent ?? ''
    await waitFor(() => !!button(read) && meta() === '0 of 2 today', 'the progress')
    await click(button(read)!)
    await waitFor(() => button(read)!.getAttribute('aria-pressed') === 'true' && meta() === '1 of 2 today', 'kept')
    expect(button(read)!.hasAttribute('disabled')).toBe(false)
    await click(button(read)!)
    await waitFor(async () => !!(await record(read))?.deleted_at, 'taken back')
    await waitFor(() => button(read)!.getAttribute('aria-pressed') === 'false' && meta() === '0 of 2 today', 'due again')
    expect((await db.tasks.get(read))!.due?.date).toBe('2026-11-11')
    await r.unmount()
  })

  it('offers Skip this day, but not for a target habit', async () => {
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-11')
    const gym = await habit('Gym', 'every day', '2026-11-11', { habit_target: 3, habit_period: 'week' })
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!button(run) && !!button(gym), 'the rows')
    const items = async (id: string) => {
      await click(document.querySelector<HTMLElement>(`[data-habit-row="${id}"] [aria-haspopup]`)!)
      await waitFor(() => !!document.querySelector('[role="menu"]'), 'the menu')
      const out = [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent?.trim() ?? '')
      return out
    }
    expect((await items(gym)).some((x) => x.includes('Skip this day'))).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await waitFor(() => !document.querySelector('[role="menu"]'), 'closed')
    const runItems = await items(run)
    const skip = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((x) => x.textContent?.includes('Skip this day'))
    expect(runItems.some((x) => x.includes('Skip this day'))).toBe(true)
    await click(skip!)
    await waitFor(async () => (await record(run))?.skipped === true, 'skipped')
    expect((await db.tasks.get(run))!.due?.date).toBe('2026-11-13')
    await r.unmount()
  })
})

describe('the habit page', () => {
  it('Done today is pressed and takes the check-in back; the year sums up the days', async () => {
    const read = await habit('Read', 'every day', '2026-11-09')
    await completeTask(read, { today: '2026-11-09' })
    await updateTask(read, { due: { date: '2026-11-11' } }) // the 10th missed
    await completeTask(read, { today: '2026-11-11' })
    const r = await render(<HabitPage id={read} />)
    const check = () => document.querySelector<HTMLElement>(`[data-habit-page] [data-check-in="${read}"]`)
    await waitFor(() => check()?.getAttribute('aria-pressed') === 'true', 'Done today')
    // Two of three scheduled days kept: the 9th and today; the 10th missed.
    const year = document.querySelector('[data-habit-year] [role="grid"]')
    expect(year?.getAttribute('aria-label')).toBe('2 of 3 scheduled days kept in the last 53 weeks')
    expect(document.querySelector('[data-habit-year] [data-day="2026-11-10"]')?.getAttribute('data-level')).toBe('1')
    expect(document.querySelector('[data-habit-year] [data-day="2026-11-11"]')?.getAttribute('data-level')).toBe('4')
    // The month in the habit's colour.
    expect(document.querySelector('[data-habit-history] [data-date="2026-11-09"]')!.className).toContain('bg-hue-solid')
    await click(check()!)
    await waitFor(async () => !!(await record(read))?.deleted_at, 'taken back')
    await waitFor(() => check()?.getAttribute('aria-pressed') === 'false', 'Check in again')
    await r.unmount()
  })
})

describe('Today\'s strip', () => {
  it('a kept ring takes the check-in back', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    await completeTask(read, { today: '2026-11-11' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    const ring = () => document.querySelector<HTMLElement>(`[data-strip-chip="${read}"] [data-strip-check]`)
    await waitFor(() => ring()?.getAttribute('aria-pressed') === 'true', 'kept')
    await click(ring()!)
    await waitFor(async () => !!(await record(read))?.deleted_at, 'taken back')
    await r.unmount()
  })
})

describe('Remind me in the form', () => {
  it('sets the due time and the reminder in one save', async () => {
    const stretch = await habit('Stretch', 'every day', '2026-11-11')
    const task = (await db.tasks.get(stretch))!
    const r = await render(<HabitFormDialog req={{ taskId: stretch }} task={task} />)
    const field = document.querySelector<HTMLInputElement>('[data-habit-remind] input')
    expect(field).not.toBeNull()
    await type(field!, '0730')
    await key(field!, 'Enter')
    await click(document.querySelector<HTMLElement>('[data-habit-save]')!)
    await waitFor(async () => (await db.tasks.get(stretch))?.due?.time === '07:30', 'the time')
    expect(await db.reminders.get(habitReminderId(stretch))).toMatchObject({ kind: 'relative', offset_minutes: 0, task_id: stretch })
    await r.unmount()
  })
})
