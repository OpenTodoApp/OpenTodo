// @vitest-environment happy-dom
// Deadlines in Today, Upcoming, the sidebar count and the row countdown
// (OpenSpec change deadlines, tasks 2.2 and 2.3).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { flush, key, render, type, spokenText, visibleText } from '../ui/test-utils'
import { PanelHost } from './PanelHost'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'
import { Sidebar } from './Sidebar'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`deadline-views-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Report', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null,
  _clock: {}, ...over,
} as Task)

describe('row countdown (2.2)', () => {
  it.each([
    ['2026-10-17', '3d', 'text-warning'],
    ['2026-10-14', 'Today', 'text-danger'],
    ['2026-10-12', '2d over', 'text-danger'],
  ])('deadline %s shows %s', async (deadline, label, tone) => {
    const r = await render(<ul><TaskRow task={task({ deadline })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const chip = r.container.querySelector('[data-deadline]') as HTMLElement
    expect(visibleText(chip)).toBe(label)
    expect(chip.className).toContain(tone)
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(spokenText(chip)).toMatch(/^Deadline /)
  })
  it('no chip without a deadline or once completed', async () => {
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /><TaskRow task={task({ id: 'u', deadline: '2026-10-12', completed_at: 1 })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(r.container.querySelector('[data-deadline]')).toBeNull()
  })
})

describe('Today and Upcoming lists (2.3)', () => {
  it('Today: deadline-only today, and a past deadline planned later lands in Earlier once', async () => {
    await createTask({ title: 'Due today', due: { date: '2026-10-14' } })
    await createTask({ title: 'Deadline today', deadline: '2026-10-14' })
    await createTask({ title: 'Planned late', due: { date: '2026-10-16' }, deadline: '2026-10-13' })
    await createTask({ title: 'Still ahead', due: { date: '2026-10-20' }, deadline: '2026-10-24' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => r.container.textContent!.includes('Deadline today'))
    const text = r.container.textContent!
    expect(text).not.toContain('Still ahead')
    expect(text.split('Planned late').length - 1).toBe(1)
    const overdue = text.indexOf('Earlier'), late = text.indexOf('Planned late'), todayH = text.indexOf('Today', overdue + 1)
    expect(overdue).toBeGreaterThanOrEqual(0)
    expect(late).toBeGreaterThan(overdue)
    expect(late).toBeLessThan(todayH)
    expect(text.indexOf('Deadline today')).toBeGreaterThan(todayH)
  })

  it('Upcoming: deadline-only tasks follow the tasks due that day; both dates list under due only', async () => {
    await createTask({ title: 'Only deadline', deadline: '2026-10-17' })
    await createTask({ title: 'Due Saturday', due: { date: '2026-10-17' } })
    await createTask({ title: 'Both dates', due: { date: '2026-10-15' }, deadline: '2026-10-17' })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Only deadline'))
    const text = r.container.textContent!
    expect(text.split('Both dates').length - 1).toBe(1)
    const tomorrow = text.indexOf('Tomorrow')
    expect(text.indexOf('Both dates')).toBeGreaterThan(tomorrow)
    expect(text.indexOf('Due Saturday')).toBeGreaterThan(text.indexOf('Both dates'))
    expect(text.indexOf('Only deadline')).toBeGreaterThan(text.indexOf('Due Saturday'))
  })
})

describe('Today count (2.3)', () => {
  it('counts a deadline-only task due today and not one whose deadline is ahead', async () => {
    await createTask({ title: 'Due today', due: { date: '2026-10-14' } })
    await createTask({ title: 'Deadline today', deadline: '2026-10-14' })
    await createTask({ title: 'Ahead', deadline: '2026-10-20' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={{ id: 'u1', email: 'u@example.com', name: 'U', role: 'owner' } as never} />)
    const today = () => [...r.container.querySelectorAll('a, button')].find((a) => a.textContent?.startsWith('Today')) as HTMLElement | undefined
    await waitFor(() => !!today() && today()!.querySelector('[data-count]')?.textContent === '2')
  })
})

describe('d on a list row (3.2)', () => {
  it('d, a date and Enter set the deadline of the selected task', async () => {
    const id = await createTask({ title: 'Write report', due: { date: '2026-10-14' } })
    const r = await render(<><TaskListView route={{ view: 'today' }} /><PanelHost /></>)
    await waitFor(() => r.container.textContent!.includes('Write report'))
    await key(document.body, 'j')
    await key(document.body, 'd')
    await waitFor(() => document.activeElement instanceof HTMLInputElement && !!document.activeElement.closest('[data-facet-editor] [data-when-segment="deadline"]'))
    const input = document.activeElement as HTMLInputElement
    await type(input, '2026-11-06')
    await key(input, 'Enter')
    await flush(40)
    expect((await db.tasks.get(id))!.deadline).toBe('2026-11-06')
  })

  it('d typed into a text field is a letter, not the shortcut', async () => {
    await createTask({ title: 'Write report', due: { date: '2026-10-14' } })
    const r = await render(<><input aria-label="Elsewhere" /><TaskListView route={{ view: 'today' }} /></>)
    await waitFor(() => r.container.textContent!.includes('Write report'))
    await key(document.body, 'j')
    const other = r.container.querySelector('input[aria-label="Elsewhere"]') as HTMLInputElement
    other.focus()
    await key(other, 'd')
    await flush(40)
    expect(document.querySelector('[data-part="deadline"]')).toBeNull()
    expect(document.activeElement).toBe(other)
  })
})
