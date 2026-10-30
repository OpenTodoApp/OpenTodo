// @vitest-environment happy-dom
// Today's closed list on screen (OpenSpec change today-closed-list, tasks 3.1-3.5):
// the slots and the folded Waiting for a slot group, the lead line, Take a slot with
// its refusal and its offline write, the Done today group and its reopen, and the
// overflow items a Simple-lists user does not see.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { setMethodMode } from '../lib/method/mode'
import { createTask, mutate, resetDeviceId, setTaskCompleted } from '../lib/ops'
import { setTodayLimit } from '../lib/closedListPrefs'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, mockFetch, noPublicLinks, render, visibleText, waitFor } from '../ui/test-utils'
import { bulkToast } from './bulk/toastStore'
import { slotItem } from './bulk/BulkActions'
import { slotStateOf } from './task-list/slotActions'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

const TODAY = '2026-10-30'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`closed-list-today-${Date.now()}-${n++}`)
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

const group = (key: string) => document.querySelector<HTMLElement>(`[data-group="${key}"]`)
const titlesIn = (key: string) => [...(group(key)?.querySelectorAll<HTMLElement>('[data-task-id] [data-row-title]') ?? [])].map((e) => e.textContent?.trim())
const row = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.querySelector('[data-row-title]')?.textContent?.trim() === title)
const meta = () => document.querySelector('[data-page-header]')?.textContent ?? ''
const queued = async (entity: string) => (await db.outbox.toArray()).filter((o) => o.entity === entity)

/** Seven tasks due today, created A to G (one millisecond apart, so the creation order is fixed). */
async function sevenTasks(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const title of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    ids[title] = await createTask({ title, due: { date: TODAY } })
    vi.setSystemTime(new Date(Date.now() + 1))
  }
  return ids
}

async function openToday() {
  const r = await render(<TaskListView route={{ view: 'today' }} />)
  mounted.push(r)
  return r
}

describe('slots and Waiting for a slot (3.1, 3.2)', () => {
  it('Seven tasks, five slots: A to E listed, F and G folded in Waiting; a completion lets F in with no other write', async () => {
    const ids = await sevenTasks()
    await setTodayLimit(5)
    await openToday()
    await waitFor(() => !!group('waiting'))
    expect(visibleText(group('waiting')!.querySelector('[data-group-count]')!)).toBe('2')
    expect(row('F')).toBeUndefined()
    expect(meta()).toContain('5 of 5')
    await click(group('waiting')!.querySelector('button[aria-expanded]')!)
    await waitFor(() => titlesIn('waiting').length === 2)
    expect(titlesIn('waiting')).toEqual(['F', 'G'])
    expect(group('waiting')!.querySelector('[data-group-hint]')!.textContent).toBe('Today holds 5. The next one comes in when you finish one.')

    const before = (await db.outbox.toArray()).length
    await setTaskCompleted(ids.C, true)
    await waitFor(() => titlesIn('waiting').length === 1)
    expect(titlesIn('waiting')).toEqual(['G'])
    expect(row('F')?.closest('[data-group="waiting"]')).toBeNull()
    // Only the completion was written (its completed_at and completed_by).
    expect((await db.outbox.toArray()).slice(before).every((o) => o.entity === 'task' && o.entityId === ids.C)).toBe(true)
  })

  it('a new task on a full day waits first in line; the limit off restores Today', async () => {
    await sevenTasks()
    await setTodayLimit(5)
    await openToday()
    await waitFor(() => !!group('waiting'))
    vi.setSystemTime(new Date(Date.now() + 1000))
    await createTask({ title: 'Call the bank', priority: 1, due: { date: TODAY } })
    await click(group('waiting')!.querySelector('button[aria-expanded]')!)
    await waitFor(() => titlesIn('waiting').length === 3)
    expect(titlesIn('waiting')).toEqual(['F', 'G', 'Call the bank'])
    await setTodayLimit(0)
    await waitFor(() => !group('waiting'))
    expect(row('Call the bank')).toBeDefined()
    expect(meta()).not.toContain('of 5')
  })
})

describe('Take a slot (3.3)', () => {
  it('lets a waiting task in and the last filled one waits; written as one review op, offline', async () => {
    const ids = await sevenTasks()
    await setTodayLimit(5)
    await openToday()
    await waitFor(() => !!group('waiting'))
    await click(group('waiting')!.querySelector('button[aria-expanded]')!)
    await waitFor(() => !!row('G')?.querySelector('[data-row-action="slot"]'))
    await click(row('G')!.querySelector('[data-row-action="slot"]')!)
    await waitFor(() => titlesIn('waiting')[0] === 'E')
    expect(titlesIn('waiting')).toEqual(['E', 'F'])
    expect(row('G')!.closest('[data-group="waiting"]')).toBeNull()
    const ops = await queued('review')
    expect(ops.map((o) => [o.field, o.value])).toEqual(expect.arrayContaining([['slots_date', TODAY], ['slots', ids.G]]))
    // A taken task offers Give back the slot.
    expect(row('G')!.querySelector('[data-row-action="slot"]')!.getAttribute('aria-label')).toBe('Give back the slot')
  })

  it('the task menu (and the phone\'s long-press menu) offers the same command', async () => {
    const ids = await sevenTasks()
    await setTodayLimit(5)
    await openToday()
    await waitFor(() => slotStateOf(ids.G) === 'waiting')
    const g = (await db.tasks.get(ids.G))!
    expect(slotItem(g, slotStateOf(ids.G)).map((i) => i.label)).toEqual(['Take a slot'])
    expect(slotItem(g, slotStateOf(ids.A))).toEqual([])
  })

  it('a Today full of chosen tasks refuses with a message and writes nothing', async () => {
    const ids = await sevenTasks()
    await setTodayLimit(2)
    await mutate('review', 'me', { focus_date: TODAY, focus: `${ids.F},${ids.G}` })
    await openToday()
    await waitFor(() => !!group('waiting'))
    await click(group('waiting')!.querySelector('button[aria-expanded]')!)
    await waitFor(() => !!row('A')?.querySelector('[data-row-action="slot"]'))
    expect(titlesIn('waiting')[0]).toBe('A')
    const before = (await queued('review')).length
    await click(row('A')!.querySelector('[data-row-action="slot"]')!)
    await waitFor(() => bulkToast()?.label === 'Today is full: complete a task or give one back')
    expect(await queued('review')).toHaveLength(before)
  })
})

describe('Done today (3.1, 3.4)', () => {
  it('lists today\'s completions newest first in the method modes; its circle reopens', async () => {
    await setMethodMode('companion')
    const first = await createTask({ title: 'Wrote the report', due: { date: TODAY } })
    const second = await createTask({ title: 'Paid the bill', due: { date: TODAY } })
    await setTaskCompleted(first, true)
    vi.setSystemTime(new Date(Date.now() + 60_000))
    await setTaskCompleted(second, true)
    // Yesterday's completion stays out.
    const old = await createTask({ title: 'Yesterday', due: { date: '2026-10-29' } })
    await mutate('task', old, { completed_at: new Date(2026, 9, 29, 12).getTime() })
    await openToday()
    await waitFor(() => !!group('done'))
    expect(visibleText(group('done')!.querySelector('[data-group-count]')!)).toBe('2')
    await click(group('done')!.querySelector('button[aria-expanded]')!)
    await waitFor(() => titlesIn('done').length === 2)
    expect(titlesIn('done')).toEqual(['Paid the bill', 'Wrote the report'])
    await setTaskCompleted(second, false)
    await waitFor(() => titlesIn('done').length === 1)
    expect(row('Paid the bill')!.closest('[data-group="done"]')).toBeNull()
  })

  it('a Simple-lists user sees no Done today and no closed-list item in Today\'s menu', async () => {
    const id = await createTask({ title: 'Done thing', due: { date: TODAY } })
    await setTaskCompleted(id, true)
    await createTask({ title: 'Open thing', due: { date: TODAY } })
    await openToday()
    await waitFor(() => !!row('Open thing'))
    expect(group('done')).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[data-briefing-toggle]'))
    expect(document.querySelector('[data-today-limit-item]')).toBeNull()
    expect(document.querySelector('[data-today-done-toggle]')).toBeNull()
  })

  it('the method modes get Limit Today… and Show done today in the menu', async () => {
    await setMethodMode('first')
    await mutate('user_prefs', USER_PREFS_ID, { today_done: 'hidden' })
    await createTask({ title: 'Open thing', due: { date: TODAY } })
    await openToday()
    await waitFor(() => !!row('Open thing'))
    expect(group('done')).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => !!document.querySelector('[data-today-done-toggle]'))
    expect(document.querySelector('[data-today-limit-item]')!.textContent).toContain('Limit Today…')
    await click(document.querySelector<HTMLElement>('[data-today-done-toggle]')!)
    await waitFor(() => !!group('done'))
  })
})
