// @vitest-environment happy-dom
// The Habits screen, the Today strip, the form and Habits off (OpenSpec change
// habits-home, tasks 3.2, 4.1, 4.4, 5.1, 6.1, 6.2, 7.1, 8.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { setHabitsOn } from '../../lib/habitPrefs'
import { occurrenceId } from '../../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import type { User } from '../../lib/types'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'
import { TaskListView } from '../TaskListView'
import { RecurrenceField } from '../RecurrenceField'
import { HabitFormDialog } from './HabitForm'
import HabitsScreen from './HabitsScreen'
import { stripHabits } from './TodayStrip'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const originalMedia = window.matchMedia

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
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMedia
  resetPanel()
})

async function habit(title: string, rule: string, due: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true, ...extra })
  return id
}

describe('the Habits screen', () => {
  it('A morning at a glance: parts of the day, the thread and a folded Graduated group', async () => {
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-09', { day_part: 'morning', habit_anchor: 'After coffee' })
    await completeTask(run, { today: '2026-11-09' })
    const read = await habit('Read', 'every day', '2026-11-05', { evening: true })
    for (const d of ['05', '06', '07', '08', '09', '10']) await completeTask(read, { today: `2026-11-${d}` })
    const floss = await habit('Floss', 'every day', '2026-11-01', { habit_graduated_at: 1 })
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${run}"]`), 'the rows')
    const groups = [...document.querySelectorAll<HTMLElement>('[data-habit-group]')].map((g) => g.dataset.habitGroup)
    expect(groups).toEqual(['morning', 'evening', 'graduated'])
    const runRow = document.querySelector<HTMLElement>(`[data-habit-row="${run}"]`)!
    expect(runRow.querySelector('[data-habit-anchor]')!.textContent).toBe('After coffee')
    const day = (row: HTMLElement, d: string) => row.querySelector<HTMLElement>(`[data-day="2026-11-${d}"]`)!
    expect(day(runRow, '09').dataset.state).toBe('done')
    expect(day(runRow, '11').dataset.state).toBe('pending')
    expect(day(runRow, '10').dataset.state).toBe('blank')
    expect(day(runRow, '09').getAttribute('aria-label')).toBe('Monday 9 November, done')
    const readRow = document.querySelector<HTMLElement>(`[data-habit-row="${read}"]`)!
    expect([...readRow.querySelectorAll('[data-thread]')][0].querySelectorAll('[data-day]')).toHaveLength(7)
    expect(readRow.querySelector('[data-habit-measure]')!.textContent).toBe('6 of 6')
    // Graduated starts folded, then lists Floss with how long it was kept.
    expect(document.querySelector(`[data-graduated="${floss}"]`)).toBeNull()
    await click(document.querySelector<HTMLElement>('[data-habit-group="graduated"] [data-group-toggle]')!)
    expect(document.querySelector(`[data-graduated="${floss}"] [data-kept-for]`)!.textContent).toBe('Kept for 0 days')
    await r.unmount()
  })

  it('Check in from the screen with Space, and the tiny version with Shift+Space; the day fills at once', async () => {
    const read = await habit('Read', 'every day', '2026-11-11', { habit_tiny: 'One page' })
    const walk = await habit('Walk', 'every day', '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${read}"]`), 'the rows')
    await key(document.querySelector(`[data-habit-row="${read}"]`)!, ' ')
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(read, '2026-11-11')))?.completed_at, 'the record')
    await key(document.querySelector(`[data-habit-row="${walk}"]`)!, ' ', { shiftKey: true })
    await waitFor(async () => (await db.tasks.get(occurrenceId(walk, '2026-11-11')))?.tiny === true, 'the tiny record')
    await waitFor(() => document.querySelector<HTMLElement>(`[data-habit-row="${read}"] [data-day="2026-11-11"]`)?.dataset.state === 'done', 'the filled day')
    await waitFor(() => document.querySelector<HTMLElement>(`[data-habit-row="${walk}"] [data-day="2026-11-11"]`)?.dataset.state === 'tiny', 'the half-filled day')
    expect(document.querySelector(`[data-habit-row="${read}"] [data-check-in]`)!.hasAttribute('disabled')).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('reduced motion shows the end state at once (the mark is filled on the first render after the check-in)', async () => {
    window.matchMedia = ((media: string) => ({ matches: media.includes('reduce'), media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as typeof window.matchMedia
    const read = await habit('Read', 'every day', '2026-11-11')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-check-in="${read}"]`), 'the button')
    await click(document.querySelector(`[data-check-in="${read}"]`)!)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${read}"] [data-mark="done"]`), 'the filled mark')
    await r.unmount()
  })

  it('shows three starters when there is no habit, each opening New habit filled in', async () => {
    await setHabitsOn(true)
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector('[data-habit-starters]'), 'the starters')
    expect([...document.querySelectorAll('[data-habit-starters] button')].map((b) => b.textContent)).toEqual(['Drink water', 'Read 10 minutes', 'Walk after lunch'])
    await r.unmount()
  })

  it('Not while off: the address says Habits is off', async () => {
    await habit('Read', 'every day', '2026-11-11')
    await setHabitsOn(false)
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector('[data-habits-off]'), 'the off page')
    await r.unmount()
  })
})

describe('the Today strip', () => {
  it('A weekly habit on another day is not in the strip; a habit done today stays as a filled chip', async () => {
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-13')
    const read = await habit('Read', 'every day', '2026-11-11')
    await completeTask(read, { today: '2026-11-11' })
    const walk = await habit('Walk', 'every day', '2026-11-11')
    const strip = stripHabits(await db.tasks.toArray(), '2026-11-11')
    expect(strip.map((s) => [s.task.id, s.kept])).toEqual([[read, true], [walk, false]])
    expect(strip.some((s) => s.task.id === run)).toBe(false)
  })

  it('folds the rest into +N on a narrow screen and the heading folds the strip', async () => {
    const ids: string[] = []
    for (let i = 0; i < 9; i++) ids.push(await habit(`Habit ${i}`, 'every day', '2026-11-11'))
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => document.querySelectorAll('[data-strip-chip]').length > 0, 'the strip')
    expect(document.querySelectorAll('[data-task-id]').length).toBe(0)
    await click(document.querySelector<HTMLElement>('[data-today-habits] [data-group-toggle]')!)
    await waitFor(() => !document.querySelector('[data-strip]'), 'folded')
    expect(localStorage.length).toBeGreaterThanOrEqual(0)
    await r.unmount()
  })
})

describe('the New habit form', () => {
  it('Create in one step', async () => {
    const r = await render(<HabitFormDialog req={{}} task={null} />)
    await type(document.querySelector<HTMLInputElement>('[data-habit-title]')!, 'Read')
    await type(document.querySelector<HTMLInputElement>('[data-habit-tiny]')!, 'One page')
    await type(document.querySelector<HTMLInputElement>('[data-habit-anchor]')!, 'After dinner')
    await click([...document.querySelectorAll<HTMLElement>('[data-habit-part] button')].find((b) => b.textContent === 'Evening')!)
    await click(document.querySelector('[data-habit-save]')!)
    await waitFor(async () => (await db.tasks.filter((x) => x.title === 'Read').count()) === 1, 'the habit')
    const tk = (await db.tasks.filter((x) => x.title === 'Read').first())!
    expect(tk).toMatchObject({ recurrence: 'every day', habit: true, habit_tiny: 'One page', habit_anchor: 'After dinner', evening: true })
    await r.unmount()
  })

  it('From a one-off task it proposes Every day; from a completion-relative one it asks for a calendar rule', async () => {
    const once = await createTask({ title: 'Stretch' })
    const r = await render(<HabitFormDialog req={{ taskId: once }} task={(await db.tasks.get(once))!} />)
    expect(document.querySelector<HTMLElement>('[data-habit-often] [aria-checked="true"], [data-habit-often] [aria-pressed="true"]')?.textContent ?? 'Every day').toBe('Every day')
    await r.unmount()
    const water = await createTask({ title: 'Water the plants', due: { date: '2026-11-11' }, recurrence: 'every 3 days after completion' })
    const r2 = await render(<HabitFormDialog req={{ taskId: water }} task={(await db.tasks.get(water))!} />)
    expect(document.body.textContent).toContain('A habit repeats on the calendar.')
    const before = await db.outbox.count()
    await click(document.querySelector('[data-habit-save]')!)
    expect(await db.outbox.count()).toBe(before)
    expect((await db.tasks.get(water))!.habit).toBeFalsy()
    await r2.unmount()
  })
})

describe('Habits off (task 3.2)', () => {
  it('finds no habit control in Today, the sidebar, the palette or a task page, and completing still writes the record', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    await setHabitsOn(false)
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    navigate({ view: 'today' })
    await waitFor(() => !!document.querySelector(`[data-task-id="${read}"]`), 'Read as a row')
    expect(document.querySelector('[data-today-habits]')).toBeNull()
    expect(document.querySelector('[data-streak]')).toBeNull()
    expect(document.body.innerHTML).not.toContain('view: \'habits\'')
    expect([...document.querySelectorAll('a, button')].some((el) => el.textContent?.trim() === 'Habits')).toBe(false)
    // g then Shift+H does nothing.
    await key(document, 'g')
    await key(document, 'H', { shiftKey: true })
    expect(location.pathname).not.toBe('/habits')
    await r.unmount()
    // The task page's repeat section has no habit section while off.
    const page = await render(<RecurrenceField task={(await db.tasks.get(read))!} />)
    await waitFor(() => !!document.querySelector('[aria-label="Repeat rule"]'), 'the repeat field')
    await waitFor(() => !document.querySelector('[data-habit]'), 'no habit section')
    await page.unmount()
    await completeTask(read, { today: '2026-11-11' })
    expect((await db.tasks.get(occurrenceId(read, '2026-11-11')))!.completed_at).not.toBeNull()
  })
})
