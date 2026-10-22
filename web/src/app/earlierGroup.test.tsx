// @vitest-environment happy-dom
// Today's Earlier group (OpenSpec change page-rhythm, tasks 4.2 to 4.4; web-app
// "Standard views", bulk-actions "Group actions are one batch"): its two actions run
// the bulk date path on the group's tasks as one undoable batch, offline included;
// it folds above five tasks until this device chooses; the palette offers the same.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { hideBulkToast } from './bulk/toastStore'
import { UndoToast } from './bulk/UndoToast'
import { resetCollapsedGroups } from './collapsedGroups'
import { commands, type PaletteContext } from './palette/registry'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`earlier-${Date.now()}-${n++}`)
  resetDeviceId()
  resetCollapsedGroups()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  hideBulkToast()
  resetPanel()
  resetCollapsedGroups()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const toast = () => document.querySelector('[data-bulk-toast]')?.textContent ?? ''
const earlierSection = () => document.querySelector('[data-group="earlier"]')
const rowsIn = (el: Element | null) => (el ? [...el.querySelectorAll('[data-task-id]')].map((r) => (r as HTMLElement).dataset.taskId) : [])
const task = (id: string) => db.tasks.get(id) as Promise<Task>

async function today() {
  const r = await render(<><TaskListView route={{ view: 'today' }} /><UndoToast /></>)
  mounted.push(r)
  return r
}

describe('Move all to today', () => {
  it('moves both tasks to today keeping the time, removes the group, and says so with Undo', async () => {
    const monday = await createTask({ title: 'Call the bank', due: { date: '2026-10-12', time: '09:30' } })
    const tuesday = await createTask({ title: 'Renew passport', due: { date: '2026-10-13' } })
    await createTask({ title: 'Water plants', due: { date: '2026-10-14' } })
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 2)
    await click(document.querySelector('[data-earlier-move]')!)
    await waitFor(() => toast().includes('2 tasks moved to today'))
    expect((await task(monday)).due).toEqual({ date: '2026-10-14', time: '09:30' })
    expect((await task(tuesday)).due).toEqual({ date: '2026-10-14' })
    await waitFor(() => earlierSection() === null)
    expect(document.body.textContent).toContain('Renew passport')
  })

  it('Undo puts every task back in Earlier as one batch', async () => {
    const a = await createTask({ title: 'One', due: { date: '2026-10-10' } })
    const b = await createTask({ title: 'Two', due: { date: '2026-10-11' } })
    const c = await createTask({ title: 'Three', due: { date: '2026-10-12', time: '08:00' } })
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 3)
    await click(document.querySelector('[data-earlier-move]')!)
    await waitFor(() => toast().includes('3 tasks moved to today'))
    const undo = [...document.querySelectorAll<HTMLButtonElement>('[data-bulk-toast] button')].find((x) => x.textContent === 'Undo')!
    await act(async () => { undo.click() })
    await waitFor(() => toast().includes('Undone'))
    expect([(await task(a)).due, (await task(b)).due, (await task(c)).due]).toEqual([
      { date: '2026-10-10' }, { date: '2026-10-11' }, { date: '2026-10-12', time: '08:00' },
    ])
    await waitFor(() => rowsIn(earlierSection()).length === 3)
  })

  it('a deadline-only task gets a due date and keeps its deadline', async () => {
    const id = await createTask({ title: 'File the claim', deadline: '2026-10-13' })
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 1)
    await click(document.querySelector('[data-earlier-move]')!)
    await waitFor(() => toast().includes('1 task moved to today'))
    const row = await task(id)
    expect(row.due).toEqual({ date: '2026-10-14' })
    expect(row.deadline).toBe('2026-10-13')
  })

  it('leaves a task the user can only view and counts it in the toast', async () => {
    const shared = 'shared-project'
    await db.projects.put({ id: shared, name: 'Household', color: null, parent_id: null, position: 0, archived: false, deleted_at: null, created_at: 0, _clock: {} } as never)
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'other', members: [] })
    const mine = [await createTask({ title: 'A', due: { date: '2026-10-12' } }), await createTask({ title: 'B', due: { date: '2026-10-12' } }), await createTask({ title: 'C', due: { date: '2026-10-13' } })]
    const viewed = await createTask({ title: 'Bins', project_id: shared, due: { date: '2026-10-13' } })
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 4)
    await click(document.querySelector('[data-earlier-move]')!)
    await waitFor(() => toast().includes('3 of 4 tasks moved to today'))
    for (const id of mine) expect((await task(id)).due).toEqual({ date: '2026-10-14' })
    expect((await task(viewed)).due).toEqual({ date: '2026-10-13' })
    await waitFor(() => JSON.stringify(rowsIn(earlierSection())) === JSON.stringify([viewed]))
  })
})

describe('Reschedule…', () => {
  it('offline, Tomorrow moves the four tasks at once, out of Today, as one queued batch', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const ids = []
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) ids.push(await createTask({ title: `Task ${d}`, due: { date: d } }))
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 4)
    const before = await db.outbox.count()
    const trigger = document.querySelector('[data-earlier-reschedule]') as HTMLButtonElement
    await click(trigger)
    const tomorrow = await (async () => { await waitFor(() => !!document.querySelector('[role="menuitem"]')); return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.includes('Tomorrow'))! })()
    await click(tomorrow)
    await waitFor(() => toast().includes('4 tasks rescheduled'))
    for (const id of ids) expect((await task(id)).due).toEqual({ date: '2026-10-15' })
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.filter((o) => o.field === 'due')).toHaveLength(4)
    await waitFor(() => earlierSection() === null)
  })
})

describe('default collapse (4.2)', () => {
  it('eight earlier tasks: the label, "8" and both actions, no rows; opening it is remembered', async () => {
    for (let i = 0; i < 8; i++) await createTask({ title: `Late ${i}`, due: { date: '2026-10-1' + (i % 4) } })
    const r = await today()
    await waitFor(() => !!earlierSection())
    const header = earlierSection()!.querySelector('[data-group-header]')!
    expect(header.querySelector('[data-group-count]')!.textContent).toContain('8')
    expect(header.textContent).toContain('Move all to today')
    expect(header.textContent).toContain('Reschedule…')
    expect(rowsIn(earlierSection())).toHaveLength(0)
    await click(header.querySelector('[data-group-toggle]')!)
    await waitFor(() => rowsIn(earlierSection()).length === 8)
    await r.unmount()
    mounted.splice(mounted.indexOf(r), 1)
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 8)
  })

  it('two earlier tasks are open by default', async () => {
    await createTask({ title: 'Late a', due: { date: '2026-10-12' } })
    await createTask({ title: 'Late b', due: { date: '2026-10-13' } })
    await today()
    await waitFor(() => rowsIn(earlierSection()).length === 2)
  })
})

describe('palette commands (4.4)', () => {
  const ctx = (earlier: string[]): PaletteContext => ({
    route: { view: 'today' }, user: null, today: '2026-10-14', list: null, filterQuery: null, query: '', vimEnabled: false,
    showShortcuts: () => {}, focusQuickAdd: () => false, earlier,
  })
  it('are offered while Earlier holds tasks, without keys, and not while it is empty', () => {
    const offered = commands(ctx(['a', 'b'])).filter((c) => c.id.startsWith('earlier:'))
    expect(offered.map((c) => c.label)).toEqual(['Move earlier tasks to today', 'Reschedule earlier tasks…'])
    expect(offered.every((c) => !c.shortcut)).toBe(true)
    expect(commands(ctx([])).some((c) => c.id.startsWith('earlier:'))).toBe(false)
  })
})
