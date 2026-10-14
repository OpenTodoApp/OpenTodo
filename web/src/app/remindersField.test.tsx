// @vitest-environment happy-dom
// RemindersField on the date and time fields (date-time-preferences 3.5): an
// absolute reminder is entered in the user's formats, stores the matching instant,
// and the list shows it as `Tue 3 Nov, 09:00` for day-month and 24-hour.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, type } from '../ui/test-utils'
import { RemindersField } from './RemindersField'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`remfield-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const settle = () => flush(30)

describe('RemindersField', () => {
  it('adds an absolute reminder typed in day-month and 24-hour format', async () => {
    const id = await createTask({ title: 'Call the dentist', due: null })
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    await settle()
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Add reminder'))!)
    const select = container.querySelector('select[aria-label="Add reminder"]') as HTMLSelectElement
    await act(async () => {
      select.value = 'absolute'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const [date, time] = [...container.querySelectorAll('form input')] as HTMLInputElement[]
    expect(date.value).toBe('15/10/2026') // tomorrow by default
    expect(time.value).toBe('09:00')
    await type(date, '3/11')
    await key(date, 'Enter')
    expect(date.value).toBe('03/11/2026')
    await type(time, '9')
    await key(time, 'Enter')
    await act(async () => { (container.querySelector('form') as HTMLFormElement).requestSubmit() })
    await settle()
    const [r] = await db.reminders.where('task_id').equals(id).toArray()
    expect(r.kind).toBe('absolute')
    expect(r.fire_at).toBe(new Date(2026, 10, 3, 9, 0).getTime())
    await settle()
    expect(container.querySelector('[data-testid="reminder-time"]')?.textContent).toBe('Tue 3 Nov, 09:00')
    await unmount()
  })
})
