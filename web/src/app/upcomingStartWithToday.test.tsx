// @vitest-environment happy-dom
// Start with Today in Upcoming (OpenSpec change upcoming-start-with-today): off by
// default; the menu item turns it on for the account with one synced op, and Upcoming
// then opens with Today's own groups before Tomorrow. Today itself is unchanged.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, render, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`upcoming-today-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: false, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const groupKeys = (root: Element) => [...root.querySelectorAll('[data-group]')].map((e) => e.getAttribute('data-group'))

describe('Start with Today in Upcoming', () => {
  it('is off by default; turned on, Upcoming leads with Earlier and Today, and the choice is one synced preference', async () => {
    await createTask({ title: 'Late', due: { date: '2026-10-12' } })
    await createTask({ title: 'Now', due: { date: '2026-10-14' } })
    await createTask({ title: 'Dentist', due: { date: '2026-10-15' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Dentist'))
    expect(r.container.textContent).not.toContain('Late')
    expect(groupKeys(r.container)).toEqual(['2026-10-15'])

    await click(r.container.querySelector('[data-page-header] button[aria-label="More actions"]')!)
    await waitFor(() => document.querySelector('[data-upcoming-today-toggle]') !== null, 'the menu item')
    expect(document.querySelector('[data-upcoming-today-toggle]')!.getAttribute('aria-checked')).toBe('false')
    await click(document.querySelector('[data-upcoming-today-toggle]')!)
    await waitFor(() => r.container.textContent!.includes('Late'), 'Today’s tasks')
    expect(groupKeys(r.container)).toEqual(['earlier', 'today', '2026-10-15'])
    expect((await db.userPrefs.get(USER_PREFS_ID))?.upcoming_today).toBe('on')
    await r.unmount()

    // Today itself is unchanged.
    const today = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => today.container.textContent!.includes('Now'))
    expect(today.container.textContent).not.toContain('Dentist')
    expect(groupKeys(today.container)).toEqual(['earlier', 'today'])
    await today.unmount()
  })
})
