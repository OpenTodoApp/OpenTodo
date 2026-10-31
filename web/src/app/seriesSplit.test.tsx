// @vitest-environment happy-dom
// This and following in the panel and the projection menu (OpenSpec change
// series-split, tasks 3.1, 3.2 and 3.3): the spec's scenarios on local rows.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { pieceId } from '../lib/ids'
import { createTask, resetDeviceId, updateTask } from '../lib/ops'
import { splitFromOccurrence } from '../lib/seriesSplitActions'
import { undoBatch } from '../lib/undo'
import { click, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { MonthView } from './MonthView'
import { panelTaskId, resetPanel, setPanelTaskId, setTaskSplit } from './panel'
import { TaskDetail } from './task-detail/TaskDetail'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Monday 12 October 2026.
  vi.setSystemTime(new Date(2026, 9, 12, 9, 0))
  setDateTime({ date_format: 'system', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  resetPanel()
})

const segment = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-scope-control] [data-segment="${id}"]`)

async function panel(id: string, date?: string) {
  setPanelTaskId(id, date)
  const d = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
  await waitFor(() => d.container.querySelector('[data-scope-control]') !== null, 'the scope control')
  return d
}

describe('This and following in the occurrence panel', () => {
  it('Option offered on a later occurrence, with This occurrence selected', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const done = setTaskSplit(true)
    const d = await panel(id, '2026-10-14')
    await waitFor(() => segment(d.container, 'following') !== null, 'This and following')
    expect([...d.container.querySelectorAll('[data-scope-control] [data-segment]')].map((s) => s.getAttribute('data-segment'))).toEqual(['this', 'following', 'all'])
    expect(segment(d.container, 'this')!.getAttribute('aria-checked')).toBe('true')
    await d.unmount()
    done()
  })

  it('Not on the current occurrence', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const done = setTaskSplit(true)
    for (const date of [undefined, '2026-10-12']) {
      const d = await panel(id, date)
      expect(segment(d.container, 'following')).toBeNull()
      expect(segment(d.container, 'this')).toBeTruthy()
      await d.unmount()
    }
    done()
  })

  it('Study at 19:00 from Wednesday, then Undo', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const done = setTaskSplit(true)
    const d = await panel(id, '2026-10-14')
    await waitFor(() => segment(d.container, 'following') !== null, 'This and following')
    await click(segment(d.container, 'following')!)
    await waitFor(() => segment(d.container, 'following')?.getAttribute('aria-checked') === 'true' && d.container.querySelector('[data-following-from="2026-10-14"]') !== null, 'This and following chosen')
    // The series' values are editable now: the first edit splits the series.
    expect(d.container.querySelector('[data-occurrence-actions]')).toBeNull()
    await act(async () => { await updateTask(id, { due: { date: '2026-10-14', time: '19:00' } }) })
    const piece = pieceId(id, '2026-10-14')
    await waitFor(() => panelTaskId() === piece, 'the new series in the panel')
    expect(await db.tasks.get(id)).toMatchObject({ recurrence: 'every weekday until 2026-10-13', due: { date: '2026-10-12', time: '18:00' } })
    expect(await db.tasks.get(piece)).toMatchObject({ recurrence: 'every weekday', due: { date: '2026-10-14', time: '19:00' }, split_from: { series: id, date: '2026-10-14' }, title: 'Study' })
    const toast = bulkToast()!
    expect(toast.label).toMatch(/^Changed from .*14.* on$/)
    // A later edit is an ordinary one of the new series.
    await updateTask(piece, { title: 'Study hall' })
    expect((await db.tasks.get(id))?.title).toBe('Study')
    await undoBatch(toast.undoId!)
    expect((await db.tasks.get(id))?.recurrence).toBe('every weekday')
    expect((await db.tasks.get(piece))?.deleted_at).not.toBeNull()
    expect(await db.tasks.filter((t) => t.series_id === id).count()).toBe(0)
    await d.unmount()
    done()
  })

  it('Continues from: the piece names the series it continues, the series names the piece', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const r = await splitFromOccurrence(id, '2026-10-14', { due: { date: '2026-10-14', time: '19:00' } })
    const done = setTaskSplit(true)
    const d = await panel(r!.id)
    await waitFor(() => d.container.querySelector('[data-continues="from"]') !== null, 'the link back')
    expect(d.container.querySelector('[data-continues="from"]')!.textContent).toBe('Continues Study from Oct 14')
    await click(d.container.querySelector<HTMLElement>('[data-continues="from"]')!)
    expect(panelTaskId()).toBe(id)
    await d.unmount()
    const o = await panel(id)
    await waitFor(() => o.container.querySelector(`[data-continues="as-${r!.id}"]`) !== null, 'the link on')
    expect(o.container.querySelector(`[data-continues="as-${r!.id}"]`)!.textContent).toBe('Continues as Study from Oct 14')
    await o.unmount()
    done()
  })
})

describe('End a series from an occurrence', () => {
  it('Stop after the course ends: Delete this and following on the 15 December projection', async () => {
    const id = await createTask({ title: 'Spanish class', due: { date: '2026-10-13' }, recurrence: 'every tuesday' })
    const r = await render(<MonthView date="2026-12-01" />)
    const on = (date: string) => r.container.querySelector<HTMLElement>(`[data-month-day="${date}"] [data-projected]`)
    await waitFor(() => on('2026-12-15') !== null, 'the projection')
    await act(async () => { on('2026-12-15')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await waitFor(() => document.querySelector('[data-occurrence-action="end-from"]') !== null, 'the menu')
    await click(document.querySelector<HTMLElement>('[data-occurrence-action="end-from"]')!)
    await waitFor(async () => (await db.tasks.get(id))?.recurrence === 'every tuesday until 2026-12-14', 'the ended rule')
    await waitFor(() => on('2026-12-15') === null && on('2026-12-22') === null, 'no projection from the 15th')
    expect(on('2026-12-08')).toBeTruthy()
    expect(await db.tasks.count()).toBe(1)
    await undoBatch(bulkToast()!.undoId!)
    expect((await db.tasks.get(id))?.recurrence).toBe('every tuesday')
    await r.unmount()
  })
})
