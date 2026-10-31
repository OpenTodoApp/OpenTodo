// @vitest-environment happy-dom
// "Only future ones" and "Also past ones" under All occurrences (OpenSpec change
// series-all-scope, tasks 2.1, 2.2 and 3.1): the spec's scenarios on local rows.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { occurrenceId } from '../lib/ids'
import { completeTask, createTask, resetDeviceId, saveNote, setPastScope, setRecurrence, updateTask } from '../lib/ops'
import { recordFields } from '../lib/recurring'
import { splitFromOccurrence } from '../lib/seriesSplitActions'
import { undoBatch } from '../lib/undo'
import { click, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast, showUndoToast } from './bulk/toastStore'
import { resetPanel, setPanelTaskId, setTaskSplit } from './panel'
import { TaskDetail } from './task-detail/TaskDetail'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Tuesday 27 October 2026.
  vi.setSystemTime(new Date(2026, 9, 27, 9, 0))
  setDateTime({ date_format: 'system', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  hideBulkToast()
  setPastScope(null)
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  resetPanel()
  setPastScope(null)
})

const past = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-past-control] [data-segment="${id}"]`)

async function panel(id: string, readOnly = false) {
  setPanelTaskId(id)
  const d = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} readOnly={readOnly} />)
  await waitFor(() => d.container.querySelector('[data-scope-control]') !== null, 'the scope control')
  return d
}

/** A record of `date` of `seriesId` in `state`, as the app writes one. */
async function record(seriesId: string, date: string, state: 'done' | 'skipped', extra: Record<string, unknown> = {}) {
  const series = (await db.tasks.get(seriesId))!
  const id = occurrenceId(seriesId, date)
  await db.tasks.put({ ...series, ...recordFields(series, date, 1, date), id, completed_at: 1, skipped: state === 'skipped', ...extra } as never)
  return id
}

describe('Also past ones', () => {
  it('No past, no question', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-27' }, recurrence: 'every day' })
    const done = setTaskSplit(true)
    const d = await panel(id)
    expect(d.container.querySelector('[data-past-control]')).toBeNull()
    await d.unmount()
    done()
  })

  it('Viewer: not offered', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-27' }, recurrence: 'every day' })
    await record(id, '2026-10-20', 'done')
    const done = setTaskSplit(true)
    const d = await panel(id, true)
    expect(d.container.querySelector('[data-past-control]')).toBeNull()
    await d.unmount()
    done()
  })

  it('Only future ones by default: done records keep their title', async () => {
    const id = await createTask({ title: 'Spansh class', due: { date: '2026-10-27' }, recurrence: 'every tuesday' })
    const r = await record(id, '2026-10-20', 'done')
    const done = setTaskSplit(true)
    const d = await panel(id)
    await waitFor(() => past(d.container, 'future') !== null, 'the second choice')
    expect(past(d.container, 'future')!.getAttribute('aria-checked')).toBe('true')
    await act(async () => { await updateTask(id, { title: 'Spanish class' }) })
    expect((await db.tasks.get(id))?.title).toBe('Spanish class')
    expect((await db.tasks.get(r))?.title).toBe('Spansh class')
    await d.unmount()
    done()
  })

  it('Fix a typo in every session, then one Undo', async () => {
    const id = await createTask({ title: 'Spansh class', due: { date: '2026-10-27' }, recurrence: 'every tuesday' })
    const a = await record(id, '2026-10-06', 'done')
    const b = await record(id, '2026-10-13', 'done', { title: 'Spansh class: oral exam' })
    const c = await record(id, '2026-10-20', 'skipped')
    const done = setTaskSplit(true)
    const d = await panel(id)
    await waitFor(() => past(d.container, 'past') !== null, 'the second choice')
    await click(past(d.container, 'past')!)
    await waitFor(() => past(d.container, 'past')?.getAttribute('aria-checked') === 'true' && d.container.querySelector('[data-past-note]') !== null, 'Also past ones chosen')
    await act(async () => { await updateTask(id, { title: 'Spanish class' }) })
    expect((await db.tasks.get(id))?.title).toBe('Spanish class')
    expect(await db.tasks.get(a)).toMatchObject({ title: 'Spanish class', completed_at: 1, skipped: false, occurrence_date: '2026-10-06', due: { date: '2026-10-06' } })
    expect((await db.tasks.get(b))?.title).toBe('Spansh class: oral exam')
    expect(await db.tasks.get(c)).toMatchObject({ title: 'Spanish class', skipped: true })
    const toast = bulkToast()!
    expect(toast.label).toBe('Changed past occurrences too')
    await undoBatch(toast.undoId!)
    expect((await db.tasks.get(id))?.title).toBe('Spansh class')
    expect((await db.tasks.get(a))?.title).toBe('Spansh class')
    expect((await db.tasks.get(c))?.title).toBe('Spansh class')
    await d.unmount()
    done()
  })

  it('Resets to Only future ones when the panel leaves the series', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-27' }, recurrence: 'every day' })
    const r = await record(id, '2026-10-20', 'done')
    const done = setTaskSplit(true)
    const d = await panel(id)
    await waitFor(() => past(d.container, 'past') !== null, 'the second choice')
    await click(past(d.container, 'past')!)
    await waitFor(() => d.container.querySelector('[data-past-note]') !== null, 'Also past ones chosen')
    await d.unmount()
    await updateTask(id, { priority: 1 })
    expect((await db.tasks.get(r))?.priority).toBe(4)
    done()
  })
})

describe('Also past ones through the edit paths', () => {
  const committed = (label: string, entryId: string) => showUndoToast(label, entryId)

  it('Across a split: the earlier series takes the priority, keeps its time and end', async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0))
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const rec = await record(id, '2026-10-09', 'done')
    const split = await splitFromOccurrence(id, '2026-10-14', { due: { date: '2026-10-14', time: '19:00' } })
    setPastScope({ id: split!.id, committed })
    await updateTask(split!.id, { priority: 1 })
    expect(await db.tasks.get(id)).toMatchObject({ priority: 1, recurrence: 'every weekday until 2026-10-13', due: { date: '2026-10-12', time: '18:00' } })
    expect(await db.tasks.get(rec)).toMatchObject({ priority: 1, completed_at: 1, due: { date: '2026-10-09', time: '18:00' } })
    // A new time stays off past dates; a new rule keeps the earlier series' end.
    await updateTask(split!.id, { due: { date: '2026-10-14', time: '07:00' } })
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12', time: '07:00' })
    expect((await db.tasks.get(rec))?.due).toEqual({ date: '2026-10-09', time: '18:00' })
    await setRecurrence(split!.id, 'every mon, wed')
    expect((await db.tasks.get(id))?.recurrence).toBe('every monday, wednesday until 2026-10-13')
  })

  it('A completed occurrence keeps its completion when the series is renamed', async () => {
    const id = await createTask({ title: 'Run', due: { date: '2026-10-27' }, recurrence: 'every day' })
    const rec = await completeTask(id)
    setPastScope({ id, committed })
    await updateTask(id, { title: 'Morning run' })
    const row = (await db.tasks.get(rec!))!
    expect(row.title).toBe('Morning run')
    expect(row.completed_at).not.toBeNull()
  })

  it('A note saved under Also past ones reaches the records with the previous text', async () => {
    const id = await createTask({ title: 'Run', due: { date: '2026-10-27' }, recurrence: 'every day' })
    await updateTask(id, { description: '5 km' })
    const a = await record(id, '2026-10-25', 'done')
    const b = await record(id, '2026-10-26', 'done', { description: 'felt slow' })
    setPastScope({ id, committed })
    await saveNote('task', id, { description: '6 km' })
    expect((await db.tasks.get(a))?.description).toBe('6 km')
    expect((await db.tasks.get(b))?.description).toBe('felt slow')
  })
})
