// @vitest-environment happy-dom
// Display options on Today, Upcoming and the Inbox (OpenSpec change builtin-view-options,
// issue #872): the panel offers each view's own parts, a choice applies at once and is
// stored in the user's preferences, Reset goes back to the default and moves focus,
// the `r` keys offer only what the panel offers, Nest subtasks draws a tree, and a
// move in the Inbox under another order switches it back to manual order first.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { setListDisplay } from '../lib/listDisplay'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { resetCollapsedGroups } from './collapsedGroups'
import { TaskListView } from './TaskListView'

const TODAY = '2026-10-14'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  mockFetch(noPublicLinks)
  useDatabase(`builtin-view-options-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCollapsedGroups()
  hideBulkToast()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetCollapsedGroups()
})

const headings = () => [...document.querySelectorAll('[data-group-label]')].map((e) => e.textContent)
const titles = () => [...document.querySelectorAll('[data-task-id] [data-row-title]')].map((e) => e.textContent?.trim())
const panel = () => document.querySelector('[data-display-panel]')
const options = (label: string) => [...(panel()?.querySelectorAll(`select[aria-label="${label}"] option`) ?? [])].map((o) => o.textContent)
const prefs = async () => ((await db.userPrefs.get('me')) ?? {}) as unknown as Record<string, unknown>

async function show(view: 'today' | 'upcoming' | 'inbox') {
  const r = await render(<TaskListView route={{ view }} />)
  mounted.push(r)
  return r
}
async function openPanel() {
  await click(document.querySelector('[data-display-trigger]')!)
  await waitFor(() => !!panel(), 'the panel')
}
async function choose(label: string, value: string) {
  const select = panel()!.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function keys(seq: string) {
  for (const k of seq.split(' ')) await key(document.body, k)
}

describe('Today', () => {
  it('offers its own choices, groups by project, and Reset puts it back with focus on Rows', async () => {
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    await createTask({ title: 'Late', due: { date: '2026-10-13' }, project_id: home })
    await createTask({ title: 'Report', due: { date: TODAY }, project_id: work })
    await createTask({ title: 'Agenda', due: { date: TODAY }, project_id: work })
    await createTask({ title: 'Plants', due: { date: TODAY }, project_id: home })
    await show('today')
    await waitFor(() => titles().length === 4, 'rows')
    await openPanel()
    expect(options('Group by')).toEqual(['Time of day', 'Project', 'Priority', 'Label', 'None'])
    expect(options('Order by')).toEqual(['Due date', 'Priority', 'Created', 'Deadline', 'Title'])
    expect(panel()!.querySelector<HTMLSelectElement>('select[aria-label="Group by"]')!.value).toBe('day')
    expect(panel()!.querySelector('[data-display-subtasks] [role="switch"]')!.getAttribute('aria-checked')).toBe('false')
    expect(panel()!.querySelector('[data-display-layout]')).toBeNull()
    expect(panel()!.querySelector('[data-display-props]')).toBeNull()
    // At the defaults: no Reset, and opening the panel wrote nothing.
    expect(panel()!.querySelector('[data-display-reset]')).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.entity === 'user_prefs')).toBe(false)

    await choose('Group by', 'project')
    await waitFor(() => headings().join() === 'Earlier,Home,Work', 'project groups after Earlier')
    expect(document.querySelector('[data-earlier-move]')).not.toBeNull()
    await choose('Order by', 'title')
    await waitFor(() => titles().join() === 'Late,Plants,Agenda,Report', 'title order in each group')
    expect((await prefs()).today_group_by).toBe('project')

    await waitFor(() => !!panel()!.querySelector('[data-display-reset]'), 'Reset offered')
    await click(panel()!.querySelector('[data-display-reset]')!)
    await waitFor(() => !panel()!.querySelector('[data-display-reset]'), 'Reset gone')
    await waitFor(() => headings().join() === 'Earlier,Today', 'back to time of day')
    expect(titles()).toEqual(['Late', 'Report', 'Agenda', 'Plants'])
    await waitFor(() => document.activeElement?.getAttribute('data-row-layout') !== null && document.activeElement?.getAttribute('role') === 'radio', 'focus on Rows')
    expect(await prefs()).toMatchObject({ today_group_by: '', today_sort_by: '' })
  })

  it('r g p then r g t: by priority, then by time of day, with the panel\'s words; r o m does nothing', async () => {
    await createTask({ title: 'Urgent', due: { date: TODAY }, priority: 1 })
    await createTask({ title: 'Someday soon', due: { date: TODAY }, priority: 4 })
    await show('today')
    await waitFor(() => titles().length === 2, 'rows')
    await keys('r g p')
    await waitFor(() => headings().join() === 'Priority 1,No priority', 'priority groups')
    expect(bulkToast()?.label).toBe('Group by: Priority')
    await keys('r g t')
    await waitFor(() => headings().length === 0, 'time of day')
    expect(bulkToast()?.label).toBe('Group by: Time of day')
    await waitFor(async () => (await prefs()).today_group_by === 'day', 'stored')
    await keys('r o m')
    expect((await prefs()).today_sort_by ?? '').toBe('')
  })

  it('Nest subtasks lists a subtask under its parent, announced with its level, and Left folds it', async () => {
    const plan = await createTask({ title: 'Plan trip', due: { date: TODAY } })
    await createTask({ title: 'Book flights', due: { date: TODAY }, parent_id: plan })
    await show('today')
    await waitFor(() => titles().length === 2, 'rows')
    expect(document.querySelector('[aria-level="2"]')).toBeNull()
    await openPanel()
    await click(panel()!.querySelector('[data-display-subtasks] [role="switch"]')!)
    await waitFor(() => !!document.querySelector('[aria-level="2"]'), 'nested row')
    expect(document.querySelector('[aria-level="2"]')!.textContent).toContain('Book flights')
    expect((await prefs()).today_subtasks).toBe('nested')
    await key(document.body, 'Escape')
    await key(document.body, 'j')
    await key(document.body, 'ArrowLeft')
    await waitFor(() => titles().join() === 'Plan trip', 'folded')
  })
})

describe('Upcoming', () => {
  it('has no Group by: r g p does nothing, r o p orders each day by priority', async () => {
    await createTask({ title: 'At nine', due: { date: '2026-10-15', time: '09:00' }, priority: 4 })
    await createTask({ title: 'Important', due: { date: '2026-10-15' }, priority: 1 })
    await show('upcoming')
    await waitFor(() => titles().length === 2, 'rows')
    await openPanel()
    expect(panel()!.querySelector('select[aria-label="Group by"]')).toBeNull()
    expect(options('Order by')).toEqual(['Due date', 'Priority', 'Created', 'Deadline', 'Title'])
    expect(panel()!.querySelector('[data-display-subtasks]')).not.toBeNull()
    await key(document.body, 'Escape')
    const before = titles().join()
    await keys('r g p')
    expect((await prefs()).upcoming_group_by).toBeUndefined()
    await keys('r o p')
    await keys('r r')
    await waitFor(() => titles().join() === 'Important,At nine', 'priority order in the day')
    expect(before).not.toBe(titles().join())
    expect(await prefs()).toMatchObject({ upcoming_sort_by: 'priority', upcoming_sort_dir: 'desc' })
  })
})

describe('the Inbox', () => {
  it('offers None, Due date, Priority and Label, manual order first and no Nest subtasks; grouped by priority a subtask stays under its parent', async () => {
    const parent = await createTask({ title: 'Parent', priority: 2 })
    await createTask({ title: 'Child', priority: 4, parent_id: parent })
    await createTask({ title: 'Loose', priority: 4 })
    await show('inbox')
    await waitFor(() => titles().length === 3, 'rows')
    await openPanel()
    expect(options('Group by')).toEqual(['None', 'Due date', 'Priority', 'Label'])
    expect(options('Order by')[0]).toBe('Manual order')
    expect(panel()!.querySelector('[data-display-subtasks]')).toBeNull()
    await choose('Group by', 'priority')
    await waitFor(() => headings().join() === 'Priority 2,No priority', 'priority groups')
    expect(titles()).toEqual(['Parent', 'Child', 'Loose'])
    expect((await prefs()).inbox_group_by).toBe('priority')
    // Reset here leaves Today alone.
    await setListDisplay({ kind: 'today' }, { sortBy: 'priority' })
    await waitFor(() => !!panel()!.querySelector('[data-display-reset]'), 'Reset offered')
    await click(panel()!.querySelector('[data-display-reset]')!)
    await waitFor(() => headings().length === 0, 'ungrouped again')
    expect(await prefs()).toMatchObject({ inbox_group_by: '', today_sort_by: 'priority' })
  })

  it('Alt+Down under a title order switches the Inbox to manual order, then moves the task', async () => {
    await createTask({ title: 'B' })
    await createTask({ title: 'A' })
    await setListDisplay({ kind: 'inbox' }, { sortBy: 'title' })
    await show('inbox')
    await waitFor(() => titles().join() === 'A,B', 'title order')
    await key(document.body, 'j')
    await key(document.body, 'ArrowDown', { altKey: true })
    await waitFor(async () => (await prefs()).inbox_sort_by === 'position', 'manual order')
    await waitFor(() => titles().join() === 'B,A', 'moved')
    // The move is a manual-order move: A now sits after B by position.
    const [a, b] = await Promise.all(['A', 'B'].map(async (title) => (await db.tasks.filter((x) => x.title === title).first())!))
    expect(a.position).toBeGreaterThan(b.position)
  })
})
