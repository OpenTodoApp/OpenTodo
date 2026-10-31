// @vitest-environment happy-dom
// Acting on one occurrence in the calendar and the panel (OpenSpec change
// series-exceptions, tasks 3.1, 3.2 and 4.1): the spec's scenarios on local rows.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { occurrenceId } from '../lib/ids'
import { createTask, resetDeviceId, updateTask } from '../lib/ops'
import { click, key, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { MonthView } from './MonthView'
import { panelTaskId, resetPanel, setPanelTaskId, setTaskSplit } from './panel'
import { TaskDetail } from './task-detail/TaskDetail'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Monday 12 October 2026.
  vi.setSystemTime(new Date(2026, 9, 12, 9, 0))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
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

const projectionOn = (root: ParentNode, date: string) => root.querySelector<HTMLElement>(`[data-month-day="${date}"] [data-projected]`)
const menuItem = (action: string) => document.querySelector<HTMLElement>(`[data-occurrence-action="${action}"]`)

async function month() {
  const r = await render(<MonthView date="2026-10-12" />)
  await waitFor(() => r.container.querySelectorAll('[data-month-grid] [data-projected]').length > 0, 'the projections')
  return r
}

describe('Act on one occurrence', () => {
  it('Skip next Monday\'s report from its menu: no projection on the 19th, the series stays, the toast offers Undo', async () => {
    const id = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const r = await month()
    const p = projectionOn(r.container, '2026-10-19')!
    await act(async () => { p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await waitFor(() => menuItem('skip') !== null, 'the menu')
    expect(menuItem('open')).toBeTruthy()
    expect(menuItem('complete')).toBeTruthy()
    expect(menuItem('move')).toBeTruthy()
    await click(menuItem('skip')!)
    await waitFor(async () => (await db.tasks.get(occurrenceId(id, '2026-10-19')))?.skipped === true, 'the skipped record')
    await waitFor(() => projectionOn(r.container, '2026-10-19') === null, 'no projection on the 19th')
    expect(projectionOn(r.container, '2026-10-26')).toBeTruthy()
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12' })
    expect(bulkToast()?.label).toBe('Occurrence skipped')
    await r.unmount()
  })

  it('Shift+F10 opens the menu; a completion-relative series offers Open only', async () => {
    await createTask({ title: 'Water plants', due: { date: '2026-10-12' }, recurrence: 'every 3 days after completion' })
    const r = await month()
    const p = r.container.querySelector<HTMLElement>('[data-month-grid] [data-projected]')!
    p.focus()
    await key(p, 'F10', { shiftKey: true })
    await waitFor(() => menuItem('open') !== null, 'the menu')
    expect(menuItem('complete')).toBeNull()
    expect(menuItem('skip')).toBeNull()
    expect(p.hasAttribute('data-projection-movable')).toBe(false)
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await r.unmount()
  })

  it('Drag one occurrence to another day: an open record there, nothing on the 19th, the 26th still projected', async () => {
    const id = await createTask({ title: 'Weekly report', due: { date: '2026-10-12' }, recurrence: 'every monday' })
    const r = await month()
    const p = projectionOn(r.container, '2026-10-19')!
    expect(p.hasAttribute('data-projection-movable')).toBe(true)
    document.elementFromPoint = () => r.container.querySelector('[data-month-day="2026-10-20"]')
    await act(async () => {
      p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 }))
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 120 }))
    })
    await waitFor(async () => (await db.tasks.get(occurrenceId(id, '2026-10-19')))?.due?.date === '2026-10-20', 'the moved record')
    expect(await db.tasks.get(occurrenceId(id, '2026-10-19'))).toMatchObject({ completed_at: null, occurrence_date: '2026-10-19', series_id: id })
    await waitFor(() => projectionOn(r.container, '2026-10-19') === null && !!r.container.querySelector(`[data-month-day="2026-10-20"] [data-month-task="${occurrenceId(id, '2026-10-19')}"]`), 'the record on the 20th')
    expect(projectionOn(r.container, '2026-10-26')).toBeTruthy()
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-12' })
    expect(bulkToast()?.label).toBe('Occurrence moved')
    await r.unmount()
  })

  it('Viewer: the menu offers Open only and the drag does not start', async () => {
    await db.projects.put({ id: 'shared', name: 'Team', color: '#64748b', position: 1, archived: false, parent_id: null, created_at: 1, deleted_at: null, _clock: {} } as never)
    await db.memberships.put({ projectId: 'shared', role: 'viewer' } as never)
    await createTask({ title: 'Stand-up', project_id: 'shared', due: { date: '2026-10-12' }, recurrence: 'every day' })
    const r = await month()
    const p = projectionOn(r.container, '2026-10-14')!
    expect(p.hasAttribute('data-projection-movable')).toBe(false)
    await act(async () => { p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })) })
    await waitFor(() => menuItem('open') !== null, 'the menu')
    expect(menuItem('complete')).toBeNull()
    await r.unmount()
  })
})

describe('Occurrence panel scope', () => {
  it('Series row unchanged by default: All occurrences, a rename writes no record', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12' }, recurrence: 'every weekday' })
    const done = setTaskSplit(true)
    setPanelTaskId(id)
    const d = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => d.container.querySelector('[data-scope-control]') !== null, 'the scope control')
    expect(d.container.querySelector('[data-segment="all"]')!.getAttribute('aria-checked')).toBe('true')
    await updateTask(id, { title: 'Spanish' })
    expect(await db.tasks.filter((tk) => tk.series_id === id).count()).toBe(0)
    await d.unmount()
    done()
  })

  it('Edit one occurrence from the panel: Edit this occurrence writes its record and opens it on This occurrence', async () => {
    const id = await createTask({ title: 'Study', due: { date: '2026-10-12', time: '18:00' }, recurrence: 'every weekday' })
    const done = setTaskSplit(true)
    setPanelTaskId(id, '2026-10-14')
    const d = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => d.container.querySelector('[data-occurrence-action="edit"]') !== null, 'the actions')
    await click(d.container.querySelector('[data-occurrence-action="edit"]')!)
    const rec = occurrenceId(id, '2026-10-14')
    await waitFor(() => panelTaskId() === rec, 'the record in the panel')
    await updateTask(rec, { title: 'Study: exam prep' })
    expect((await db.tasks.get(id))?.title).toBe('Study')
    expect(await db.tasks.get(rec)).toMatchObject({ title: 'Study: exam prep', occurrence_date: '2026-10-14', due: { date: '2026-10-14', time: '18:00' } })
    const rd = await render(<TaskDetail taskId={rec} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => rd.container.querySelector('[data-segment="this"]')?.getAttribute('aria-checked') === 'true', 'This occurrence')
    await rd.unmount()
    await d.unmount()
    done()
  })

  it('Not on a plain task: no scope control', async () => {
    const id = await createTask({ title: 'Once', due: { date: '2026-10-12' } })
    const d = await render(<TaskDetail taskId={id} userId="u" projects={[]} labelMap={new Map()} onClose={() => {}} />)
    await waitFor(() => d.container.querySelector('[data-detail-for]') !== null, 'the panel')
    expect(d.container.querySelector('[data-scope-control]')).toBeNull()
    await d.unmount()
  })
})
