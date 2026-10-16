// @vitest-environment happy-dom
// Habits on screen (OpenSpec change habits, tasks 3.3, 4.1, 4.2): the month
// history grid (labels, keyboard, axe), the habit switch in the repeat field, the
// streak chip on rows and the Completed view without skipped records.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { occurrenceId } from '../lib/ids'
import { completeTask, createTask, resetDeviceId, skipOccurrence, updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { HabitHistory } from './HabitHistory'
import { RecurrenceField } from './RecurrenceField'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

function task(over: Partial<Task>): Task {
  return {
    id: 'x', title: 'Habit', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 1, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...over,
  }
}

/** The spec's October: every weekday, done up to the 13th except the 6th, skipped. */
function october(): { series: Task; records: Task[] } {
  const series = task({ id: 's1', recurrence: 'every weekday', due: { date: '2026-10-14' }, habit: true })
  const done = ['01', '02', '05', '07', '08', '09', '12', '13']
  const records = [...done, '06'].map((d) => task({
    id: occurrenceId('s1', `2026-10-${d}`), series_id: 's1', due: { date: `2026-10-${d}` }, completed_at: 1, skipped: d === '06',
  }))
  return { series, records }
}

const cell = (root: ParentNode, d: string) => root.querySelector<HTMLElement>(`[data-date="${d}"]`)!
const heading = (root: ParentNode) => root.querySelector('[data-habit-history] p')!.textContent

describe('HabitHistory', () => {
  it('marks October at a glance and labels each day with its state', async () => {
    const { series, records } = october()
    const r = await render(<HabitHistory series={series} records={records} today="2026-10-14" />)
    expect(heading(r.container)).toBe('October 2026')
    const states = (ds: string[]) => ds.map((d) => cell(r.container, `2026-10-${d}`).dataset.state)
    expect(states(['01', '02', '05', '07', '08', '09', '12', '13'])).toEqual(Array(8).fill('done'))
    expect(states(['06', '03', '04', '14', '15', '31'])).toEqual(['skipped', 'blank', 'blank', 'pending', 'upcoming', 'blank'])
    expect(cell(r.container, '2026-10-06').getAttribute('aria-label')).toBe('6 October, skipped')
    expect(cell(r.container, '2026-10-14').getAttribute('aria-current')).toBe('date')
    // Every state differs by more than colour: a glyph or a border.
    expect(cell(r.container, '2026-10-01').querySelector('[data-icon="check"]')).toBeTruthy()
    expect(cell(r.container, '2026-10-06').querySelector('[data-icon="minus"]')).toBeTruthy()
    expect(cell(r.container, '2026-10-14').querySelector('[data-icon="circle"]')).toBeTruthy()

    const axe = (await import('axe-core')).default
    const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('moves with the arrow keys and changes month with Page Up, Page Down and the buttons', async () => {
    const { series, records } = october()
    const r = await render(<HabitHistory series={series} records={records} today="2026-10-14" />)
    const focused = () => r.container.querySelector<HTMLElement>('[tabindex="0"]')!.dataset.date
    expect(focused()).toBe('2026-10-14')
    await key(cell(r.container, '2026-10-14'), 'ArrowRight')
    expect(focused()).toBe('2026-10-15')
    expect(document.activeElement).toBe(cell(r.container, '2026-10-15'))
    await key(cell(r.container, '2026-10-15'), 'ArrowUp')
    expect(focused()).toBe('2026-10-08')
    await key(cell(r.container, '2026-10-08'), 'End')
    expect(focused()).toBe('2026-10-31')
    await key(cell(r.container, '2026-10-31'), 'PageUp')
    expect(heading(r.container)).toBe('September 2026')
    expect(focused()).toBe('2026-09-30')
    // September renders from local rows: before the first record, every day is blank.
    expect(cell(r.container, '2026-09-30').dataset.state).toBe('blank')
    await key(cell(r.container, '2026-09-30'), 'PageDown')
    expect(heading(r.container)).toBe('October 2026')
    await key(cell(r.container, '2026-10-30'), 'Home')
    expect(focused()).toBe('2026-10-01')
    await key(cell(r.container, '2026-10-01'), 'ArrowLeft')
    expect(heading(r.container)).toBe('September 2026')
    await click(r.container.querySelector('[aria-label="Next month"]')!)
    expect(heading(r.container)).toBe('October 2026')
    await click(r.container.querySelector('[aria-label="Previous month"]')!)
    expect(heading(r.container)).toBe('September 2026')
    await r.unmount()
  })
})

describe('RecurrenceField habit switch', () => {
  it('toggling writes one habit op, and the streak and grid render offline from local rows', async () => {
    const id = await createTask({ title: 'Stretch', due: { date: '2026-10-12' }, recurrence: 'every day' })
    await completeTask(id, { today: '2026-10-12' })
    await completeTask(id, { today: '2026-10-13' })
    const before = await db.outbox.count()
    const r = await render(<RecurrenceField task={(await db.tasks.get(id))!} />)
    const sw = r.container.querySelector<HTMLElement>('[role="switch"]')!
    expect(sw.closest('label')!.textContent).toContain('Track as a habit')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await click(sw)
    await flush(20)
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.map((o) => [o.field, o.value])).toEqual([['habit', true]])
    await r.unmount()

    const r2 = await render(<RecurrenceField task={(await db.tasks.get(id))!} />)
    await waitFor(() => r2.container.querySelector('[data-habit-streak]')?.textContent === 'Streak 2 · Best 2')
    expect(r2.container.querySelector('[data-habit-streak]')!.textContent).toBe('Streak 2 · Best 2')
    expect(cell(r2.container, '2026-10-12').dataset.state).toBe('done')
    expect(cell(r2.container, '2026-10-14').dataset.state).toBe('pending')
    expect(fetch).not.toHaveBeenCalled()
    await r2.unmount()
  })

  it('is not offered for a completion-relative rule or a task without a rule', async () => {
    const rel = await createTask({ title: 'Water', due: { date: '2026-10-14' }, recurrence: 'every 3 days after completion' })
    await updateTask(rel, { habit: true })
    const r = await render(<RecurrenceField task={(await db.tasks.get(rel))!} />)
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    expect(r.container.querySelector('[data-habit-history]')).toBeNull()
    await r.unmount()
    const plain = await createTask({ title: 'Once' })
    const r2 = await render(<RecurrenceField task={(await db.tasks.get(plain))!} />)
    expect(r2.container.querySelector('[role="switch"]')).toBeNull()
    await r2.unmount()
  })
})

describe('rows and views', () => {
  it('the streak chip has an accessible name, with "at risk" when the day has passed', async () => {
    const t = task({ id: 'h', title: 'Read', recurrence: 'every day', due: { date: '2026-10-14' }, habit: true })
    const r = await render(<ul><TaskRow task={t} selected={false} showProject={false} habit={{ current: 12, best: 30, pending: true, atRisk: false }} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const chip = r.container.querySelector<HTMLElement>('[data-streak]')!
    expect(chip.getAttribute('aria-label')).toBe('12-day streak')
    expect(chip.textContent).toBe('12')
    expect(chip.querySelector('[data-icon="flame"]')).toBeTruthy()
    expect(r.container.querySelector('[data-recurring]')).toBeTruthy()
    await r.unmount()
    const r2 = await render(<ul><TaskRow task={t} selected={false} showProject={false} habit={{ current: 3, best: 3, pending: true, atRisk: true }} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(r2.container.querySelector('[data-streak]')!.getAttribute('aria-label')).toBe('3-day streak, at risk')
    await r2.unmount()
  })

  it('Today shows a habit with its streak chip', async () => {
    const id = await createTask({ title: 'Meditate', due: { date: '2026-10-11' }, recurrence: 'every day' })
    await updateTask(id, { habit: true })
    for (const d of ['2026-10-11', '2026-10-12', '2026-10-13']) await completeTask(id, { today: d })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('[data-streak]'))
    expect(r.container.querySelector('[data-streak]')!.getAttribute('aria-label')).toBe('3-day streak')
    await r.unmount()
  })

  it('Completed lists a done record and not a skipped one', async () => {
    const id = await createTask({ title: 'Journal', due: { date: '2026-10-13' }, recurrence: 'every day' })
    await updateTask(id, { habit: true })
    await skipOccurrence(id, { today: '2026-10-13' })
    await completeTask(id, { today: '2026-10-14' })
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length > 0)
    const ids = [...r.container.querySelectorAll<HTMLElement>('[data-task-id]')].map((e) => e.dataset.taskId)
    expect(ids).toEqual([occurrenceId(id, '2026-10-14')])
    await r.unmount()
  })
})
