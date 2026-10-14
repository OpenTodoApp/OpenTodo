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
import { addReminder } from '../lib/reminders'
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
    await click(container.querySelector('button[aria-label="Add reminder"]')!)
    await settle()
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes('At a time'))!)
    await settle()
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

  it('adds a preset, snoozes a fired reminder and deletes one, from the keyboard (task-detail-redesign 9.1)', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-20', time: '18:00' } })
    const past = await addReminder(id, { kind: 'absolute', fire_at: new Date(2026, 9, 14, 11, 0).getTime() })
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    await settle()
    const live = () => db.reminders.where('task_id').equals(id).filter((r) => !r.deleted_at).toArray()

    // Add: the menu opens on its first preset; Down twice reaches "30 minutes before".
    const add = container.querySelector('button[aria-label="Add reminder"]') as HTMLButtonElement
    add.focus()
    await click(add)
    await settle()
    expect(document.activeElement?.textContent).toContain('At due time')
    await key(document.activeElement!, 'ArrowDown')
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('30 minutes before')
    await click(document.activeElement!) // Enter on a native button activates it
    await settle()
    expect((await live()).map((r) => r.offset_minutes).sort()).toEqual([-30, null])
    expect(document.activeElement).toBe(add)

    // Snooze: the fired reminder's menu offers it; type-ahead "s" finds it.
    const menuFor = () => container.querySelector(`[data-reminder-id="${past}"] button[aria-haspopup="menu"]`) as HTMLButtonElement
    menuFor().focus()
    await click(menuFor())
    await settle()
    await key(document.activeElement!, 's')
    expect(document.activeElement?.textContent).toContain('Snooze 10 minutes')
    await click(document.activeElement!)
    await settle()
    expect((await db.reminders.get(past))!.fire_at).toBe(new Date(2026, 9, 14, 12, 10).getTime())

    // Delete: End jumps to the last item.
    menuFor().focus()
    await click(menuFor())
    await settle()
    await key(document.activeElement!, 'End')
    expect(document.activeElement?.textContent).toContain('Delete reminder')
    await click(document.activeElement!)
    await settle()
    expect((await live()).map((r) => r.id)).not.toContain(past)
    await unmount()
  })
})
