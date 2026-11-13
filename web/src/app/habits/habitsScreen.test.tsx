// @vitest-environment happy-dom
// The Habits screen, the Today strip, the form and Habits off (OpenSpec change
// habits-home, tasks 3.2, 4.1, 4.4, 5.1, 6.1, 6.2, 7.1, 8.1), and habits-polish.
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

  it('One quiet line: a Habits link through to the screen, rings that check in, titles that open the habit', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!document.querySelector(`[data-strip-chip="${read}"]`), 'the line')
    expect(document.querySelectorAll('[data-task-id]').length).toBe(0)
    // No group heading, count or fold (habits-polish D1).
    expect(document.querySelector('[data-today-habits] [data-group-toggle]')).toBeNull()
    await click(document.querySelector<HTMLElement>(`[data-strip-chip="${read}"] [data-strip-check]`)!)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(read, '2026-11-11')))?.completed_at, 'checked in')
    await waitFor(() => !!document.querySelector(`[data-strip-chip="${read}"] [data-kept]`), 'filled')
    await click(document.querySelector<HTMLElement>(`[data-strip-chip="${read}"] [data-strip-open]`)!)
    expect(location.pathname).toBe(`/habits/${read}`)
    await click(document.querySelector<HTMLElement>('[data-strip-habits]')!)
    expect(location.pathname).toBe('/habits')
    await r.unmount()
  })
})

describe('habits-polish', () => {
  it('A long title stays on one line, its name whole; every row has a check button, early for a habit due later', async () => {
    const long = 'Practise the Bach cello suite in G major, first movement'
    const cello = await habit(long, 'every day', '2026-11-11')
    const run = await habit('Run', 'every mon, wed, fri', '2026-11-13')
    const r = await render(<HabitsScreen />)
    await waitFor(() => !!document.querySelector(`[data-habit-row="${run}"]`), 'the rows')
    const title = document.querySelector<HTMLElement>(`[data-habit-row="${cello}"] [data-habit-title]`)!
    expect(title.className).toContain('truncate')
    expect(title.textContent).toBe(long)
    const early = document.querySelector<HTMLElement>(`[data-check-in="${run}"]`)!
    expect(early.dataset.later).toBe('true')
    expect(early.getAttribute('aria-label')).toBe('Check in Run early (Friday 13 November)')
    await click(early)
    await waitFor(async () => !!(await db.tasks.get(occurrenceId(run, '2026-11-13')))?.completed_at, 'checked in early')
    await r.unmount()
  })

  it('A habit opens its own page: facts, numbers, history and no task fields; Open as a task shows the task page', async () => {
    const read = await habit('Read', 'every day', '2026-11-09')
    await updateTask(read, { evening: true, habit_anchor: 'After dinner', habit_tiny: 'One page' })
    await completeTask(read, { today: '2026-11-09' })
    await completeTask(read, { today: '2026-11-10' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    navigate({ view: 'task', id: read })
    await waitFor(() => !!document.querySelector(`[data-habit-page="${read}"]`), 'the habit page')
    expect(document.body.textContent).toContain('Every day · This Evening · After dinner')
    expect(document.querySelector('[data-habit-tiny-line]')!.textContent).toContain('One page')
    expect(document.querySelector('[data-habit-numbers]')).toBeTruthy()
    expect(document.querySelector('[data-detail-for]')).toBeNull()
    expect(document.body.textContent).not.toContain('Past occurrences take')
    navigate({ view: 'task', id: read, asTask: true })
    await waitFor(() => !!document.querySelector(`[data-detail-for="${read}"]`), 'the task page')
    await r.unmount()
  })

  it('Edit saves in one batch with the colour; "?" explains Tiny version and After', async () => {
    const read = await habit('Read', 'every day', '2026-11-11')
    const r = await render(<HabitFormDialog req={{ taskId: read }} task={(await db.tasks.get(read))!} />)
    expect(document.querySelector('[data-testid="habit-form"]')?.textContent ?? document.body.textContent).toContain('Edit habit')
    const hints = [...document.querySelectorAll<HTMLElement>('[data-field-hint]')].map((h) => h.getAttribute('aria-label'))
    expect(hints).toEqual(['The two-minute version that still counts on a bad day', 'The routine this habit follows, like "After dinner"'])
    const title = document.querySelector<HTMLInputElement>('[data-habit-title]')!
    await type(title, 'Read a book')
    await click(document.querySelector<HTMLElement>('[data-habit-colour="#22c55e"]')!)
    await click(document.querySelector('[data-habit-save]')!)
    await waitFor(async () => (await db.tasks.get(read))?.title === 'Read a book', 'saved')
    expect((await db.tasks.get(read))!.habit_color).toBe('#22c55e')
    await r.unmount()
  })

  it('Make it a habit gives a repeating task without a due date its first date', async () => {
    const stretch = await createTask({ title: 'Stretch' })
    await updateTask(stretch, { recurrence: 'every day' })
    expect((await db.tasks.get(stretch))!.due).toBeNull()
    const r = await render(<HabitFormDialog req={{ taskId: stretch }} task={(await db.tasks.get(stretch))!} />)
    await click(document.querySelector('[data-habit-save]')!)
    await waitFor(async () => !!(await db.tasks.get(stretch))?.habit, 'a habit')
    expect((await db.tasks.get(stretch))!.due?.date).toBe('2026-11-11')
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
