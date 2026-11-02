// @vitest-environment happy-dom
// Time-sensitive tasks waiting for a slot (OpenSpec change today-waiting-time-sensitive,
// tasks 2.1-2.3): under the folded Waiting for a slot heading, the waiting tasks due
// today with a time or with a deadline today, soonest first, with their time and Take a
// slot; the heading names the next one; opened, the group is as before.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, mutate, resetDeviceId } from '../lib/ops'
import { setTodayLimit } from '../lib/closedListPrefs'
import { setUpcomingStartsWithToday } from '../lib/userPrefs'
import { click, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { bulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

const TODAY = '2026-10-30'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`waiting-soon-${Date.now()}-${n++}`)
  resetDeviceId()
  mockFetch(noPublicLinks)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
  try { localStorage.clear() } catch { /* ignore */ }
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const group = () => document.querySelector<HTMLElement>('[data-group="waiting"]')
const soonRows = () => [...(group()?.querySelectorAll<HTMLElement>('[data-waiting-soon-task]') ?? [])]
  .map((li) => `${li.querySelector('[data-soon-time]')!.textContent} ${li.querySelector('button')!.textContent}`)
const toggle = () => group()!.querySelector<HTMLButtonElement>('button[aria-expanded]')!
const queued = async () => (await db.outbox.toArray()).filter((o) => o.entity === 'review')

/** Two planned tasks fill a limit of 2; then a plain task and three with a time today, created in this order. */
async function seed(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  const add = async (key: string, fields: Parameters<typeof createTask>[0]) => {
    ids[key] = await createTask(fields)
    vi.setSystemTime(new Date(Date.now() + 1))
  }
  await add('A', { title: 'A', due: { date: TODAY } })
  await add('B', { title: 'B', due: { date: TODAY } })
  await add('form', { title: 'Send the form', due: { date: TODAY, time: '16:00' } })
  await add('C', { title: 'C', due: { date: TODAY } })
  await add('taxes', { title: 'File the taxes', deadline: TODAY })
  await add('call', { title: 'Call the school', due: { date: TODAY, time: '09:00' } })
  return ids
}

async function openToday() {
  const r = await render(<TaskListView route={{ view: 'today' }} />)
  mounted.push(r)
}

describe('time-sensitive tasks waiting for a slot', () => {
  it('folded: lists them soonest first with their time, and the heading names the next one', async () => {
    await seed()
    await setTodayLimit(2)
    await openToday()
    await waitFor(() => soonRows().length === 3)
    expect(soonRows()).toEqual(['09:00 Call the school', '16:00 Send the form', 'Deadline File the taxes'])
    // The toggle's name carries the count and the next task (Label in Name).
    expect(toggle().textContent).toContain('Waiting for a slot')
    expect(group()!.querySelector('[data-group-detail]')!.textContent).toBe('— next: Call the school, 09:00')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('Upcoming with Start with Today shows the same list, and Take a slot works there', async () => {
    const ids = await seed()
    await setTodayLimit(2)
    await setUpcomingStartsWithToday(true)
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    mounted.push(r)
    await waitFor(() => soonRows().length === 3)
    expect(soonRows()).toEqual(['09:00 Call the school', '16:00 Send the form', 'Deadline File the taxes'])
    expect(group()!.querySelector('[data-group-detail]')!.textContent).toBe('— next: Call the school, 09:00')
    await click(group()!.querySelector<HTMLElement>(`[data-take-slot="${ids.call}"]`)!)
    await waitFor(() => soonRows().length === 2)
    expect((await queued()).map((o) => [o.field, o.value])).toEqual(expect.arrayContaining([['slots', ids.call]]))
  })

  it('opened: the group is as before, in fill order, with no time-sensitive list', async () => {
    await seed()
    await setTodayLimit(2)
    await openToday()
    await waitFor(() => soonRows().length === 3)
    await click(toggle())
    await waitFor(() => !group()!.querySelector('[data-waiting-soon]'))
    const titles = [...group()!.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent?.trim())
    expect(titles).toEqual(['Send the form', 'C', 'File the taxes', 'Call the school'])
    expect(group()!.querySelector('[data-group-detail]')).toBeNull()
  })

  it('Take a slot right there lets the task in as one review op; a full Today refuses and writes nothing', async () => {
    const ids = await seed()
    await setTodayLimit(2)
    await openToday()
    await waitFor(() => soonRows().length === 3)
    const take = (id: string) => group()!.querySelector<HTMLElement>(`[data-take-slot="${id}"]`)!
    expect(take(ids.form).getAttribute('aria-label')).toBe('Take a slot for Send the form')
    await click(take(ids.form))
    // Send the form is in Today and B waits again; the list follows.
    await waitFor(() => soonRows().length === 2)
    expect(soonRows()).toEqual(['09:00 Call the school', 'Deadline File the taxes'])
    const ops = await queued()
    expect(ops.map((o) => [o.field, o.value])).toEqual(expect.arrayContaining([['slots_date', TODAY], ['slots', ids.form]]))

    await click(take(ids.call))
    await waitFor(() => soonRows().length === 1)
    const before = (await queued()).length
    await click(take(ids.taxes))
    await waitFor(() => bulkToast()?.label === 'Today is full: complete a task or give one back')
    expect(await queued()).toHaveLength(before)
  })

  it('more than three: "n more with a time" opens the group', async () => {
    await seed()
    await createTask({ title: 'Pick up Sam', due: { date: TODAY, time: '15:00' } })
    await setTodayLimit(2)
    await openToday()
    await waitFor(() => soonRows().length === 3)
    expect(soonRows()).toEqual(['09:00 Call the school', '15:00 Pick up Sam', '16:00 Send the form'])
    const more = group()!.querySelector<HTMLElement>('[data-waiting-soon-more]')!
    expect(more.textContent).toBe('1 more with a time')
    await click(more)
    await waitFor(() => toggle().getAttribute('aria-expanded') === 'true')
  })

  it('a task let in leaves the list; no waiting task with a time leaves the heading plain', async () => {
    await createTask({ title: 'A', due: { date: TODAY } })
    vi.setSystemTime(new Date(Date.now() + 1))
    await createTask({ title: 'B', due: { date: TODAY } })
    await setTodayLimit(1)
    await mutate('review', 'me', { focus_date: '', focus: '' })
    await openToday()
    await waitFor(() => !!group())
    expect(group()!.querySelector('[data-waiting-soon]')).toBeNull()
    expect(group()!.querySelector('[data-group-detail]')).toBeNull()
  })
})
