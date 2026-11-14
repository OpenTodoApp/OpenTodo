// @vitest-environment happy-dom
// Habits in the weekly review's Look back step (OpenSpec change habit-notes, task 6.1):
// each open habit's thread and kept measure for the week and the week's notes, and no
// section while Habits is off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { setDayNote, setPastDay } from '../../lib/habitActions'
import { setHabitsOn } from '../../lib/habitPrefs'
import { occurrenceId } from '../../lib/ids'
import { completeTask, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { render, waitFor } from '../../ui/test-utils'
import ReviewHabits from './ReviewHabits'

const TODAY = '2026-11-15' // Sunday; the review's week runs from Monday 9 November

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 15, 18, 0))
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function habit(title: string, rule: string, due: string): Promise<string> {
  const id = await createTask({ title, due: { date: due }, recurrence: rule })
  await updateTask(id, { habit: true })
  return id
}

async function week() {
  const run = await habit('Run', 'every mon, wed, fri', '2026-11-16')
  for (const d of ['09', '11', '13']) await setPastDay(run, `2026-11-${d}`, 'done', Date.now(), TODAY)
  await setDayNote(occurrenceId(run, '2026-11-11'), 'Easy pace')
  await setDayNote(occurrenceId(run, '2026-11-13'), 'Knee a bit sore')
  // A note from the week before is not this week's.
  await setPastDay(run, '2026-11-06', 'done', Date.now(), TODAY)
  await setDayNote(occurrenceId(run, '2026-11-06'), 'Last week')
  const read = await habit('Read', 'every day', '2026-11-15')
  for (const d of ['09', '11', '12', '13', '14']) await setPastDay(read, `2026-11-${d}`, 'done', Date.now(), TODAY)
  await completeTask(read, { today: TODAY })
  return { run, read }
}

describe('Habits in Look back', () => {
  it('A Friday review: both threads for the week, "3 of 3" and "6 of 7", and Run\'s two notes', async () => {
    const { run, read } = await week()
    await setHabitsOn(true)
    const queued = await db.outbox.count()
    const r = await render(<ReviewHabits today={TODAY} weekStart={1} />)
    await waitFor(() => !!document.querySelector('[data-review-habits]'), 'the section')
    const item = (id: string) => document.querySelector<HTMLElement>(`[data-review-habit="${id}"]`)!
    expect(item(run).querySelectorAll('[data-thread] [data-day], [data-thread] button').length).toBe(7)
    expect(item(run).querySelector('[data-review-measure]')!.textContent).toBe('3 of 3')
    expect(item(read).querySelector('[data-review-measure]')!.textContent).toBe('6 of 7')
    expect([...item(run).querySelectorAll<HTMLElement>('[data-review-note]')].map((n) => n.dataset.reviewNote)).toEqual(['2026-11-13', '2026-11-11'])
    expect(item(run).textContent).toContain('Knee a bit sore')
    expect(item(run).textContent).not.toContain('Last week')
    expect(item(read).querySelector('[data-review-note]')).toBeNull()
    // The section writes nothing.
    expect(await db.outbox.count()).toBe(queued)
    await r.unmount()
  })

  it('Habits off: no Habits section', async () => {
    await week()
    await setHabitsOn(true)
    const r = await render(<ReviewHabits today={TODAY} weekStart={1} />)
    await waitFor(() => !!document.querySelector('[data-review-habits]'), 'the section while on')
    await setHabitsOn(false)
    await waitFor(() => !document.querySelector('[data-review-habits]'), 'no section once off')
    await r.unmount()
  })
})
