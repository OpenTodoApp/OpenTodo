// @vitest-environment happy-dom
// Repeating occurrences in Upcoming (OpenSpec change series-occurrences, design D4):
// off by default and per device; while on, the next 14 days' projections follow each
// day's tasks as read-only rows, outside the counts, with the note on the last day.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, render, waitFor } from '../ui/test-utils'
import { setUpcomingProjections, UPCOMING_PROJECTIONS_KEY } from './calendar/projections'
import { panelTaskId, resetPanel, setTaskSplit } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`upcoming-projections-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

describe('Repeating occurrences in Upcoming', () => {
  it('Default off: a new device lists no projected row and the daily task once', async () => {
    await createTask({ title: 'Stretch', due: { date: '2026-10-15' }, recurrence: 'every day' })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Stretch'))
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- proves that nothing appears, and no event marks "nothing drawn"
    await flush(30)
    expect(r.container.querySelector('[data-projected]')).toBeNull()
    expect(localStorage.getItem(UPCOMING_PROJECTIONS_KEY)).toBeNull()
    await r.unmount()
  })

  it('Turned on: tomorrow lists the task, each of the 13 days after a projected row, the last with the note', async () => {
    const id = await createTask({ title: 'Stretch', due: { date: '2026-10-15' }, recurrence: 'every day' })
    await createTask({ title: 'Dentist', due: { date: '2026-10-17' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Dentist'))
    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => document.querySelector('[data-projections-toggle="upcoming"]') !== null, 'the menu item')
    expect(document.querySelector('[data-projections-toggle="upcoming"]')!.getAttribute('aria-checked')).toBe('false')
    await click(document.querySelector('[data-projections-toggle="upcoming"]')!)
    await waitFor(() => r.container.querySelectorAll('[data-projected]').length === 13, 'thirteen projected rows')
    expect(localStorage.getItem(UPCOMING_PROJECTIONS_KEY)).toBe('1')

    // Tomorrow: the series row itself, no projection.
    expect(r.container.querySelector('[data-group="2026-10-15"] [data-projected]')).toBeNull()
    const days = [...r.container.querySelectorAll('[data-group-projected]')].map((e) => e.getAttribute('data-group-projected'))
    expect(days[0]).toBe('2026-10-16')
    expect(days.at(-1)).toBe('2026-10-28')
    // A day with a task keeps its task first and counts it alone.
    const sat = r.container.querySelector('[data-group="2026-10-17"]')!
    expect(sat.querySelector('[data-group-projected]')!.compareDocumentPosition(sat.querySelector('li')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // Only the last day carries the note.
    const notes = [...r.container.querySelectorAll('[data-projected-note]')]
    expect(notes).toHaveLength(1)
    expect(notes[0].closest('[data-group]')!.getAttribute('data-group')).toBe('2026-10-28')
    expect(notes[0].textContent).toMatch(/^Repeating tasks shown up to /)

    // Opening a projected row opens the series.
    const done = setTaskSplit(true)
    await click(r.container.querySelector('[data-group="2026-10-20"] [data-projected]')!)
    await waitFor(() => panelTaskId() === id)
    done()
    await r.unmount()
  })

  it('the device setting survives a reload', async () => {
    await createTask({ title: 'Stretch', due: { date: '2026-10-15' }, recurrence: 'every week' })
    setUpcomingProjections(true)
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    // 22 October; the 29th is past the 14 days.
    await waitFor(() => r.container.querySelectorAll('[data-projected]').length === 1, 'one weekly projection')
    await r.unmount()
  })
})
