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
import { click, key, render, type, waitFor } from '../ui/test-utils'
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

const menuItem = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(text))
/** Opens the Add reminder menu once the field is there, and waits for its items. */
async function openAdd(root: HTMLElement) {
  const add = () => root.querySelector<HTMLButtonElement>('button[aria-label="Add reminder"]')
  await waitFor(() => !!add(), 'the Add reminder button')
  await click(add()!)
  await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0, 'the reminder menu')
}
const reminders = (id: string) => db.reminders.where('task_id').equals(id).toArray()

describe('RemindersField', () => {
  it('adds an absolute reminder typed in day-month and 24-hour format', async () => {
    const id = await createTask({ title: 'Call the dentist', due: null })
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    await openAdd(container)
    await click(menuItem('At a time')!)
    await waitFor(() => container.querySelectorAll('form input').length >= 2, 'the date and time fields')
    const [date, time] = [...container.querySelectorAll('form input')] as HTMLInputElement[]
    expect(date.value).toBe('15/10/2026') // tomorrow by default
    expect(time.value).toBe('09:00')
    await type(date, '3/11')
    await key(date, 'Enter')
    expect(date.value).toBe('03/11/2026')
    await type(time, '9')
    await key(time, 'Enter')
    await act(async () => { (container.querySelector('form') as HTMLFormElement).requestSubmit() })
    await waitFor(async () => (await reminders(id)).length === 1, 'the stored reminder')
    const [r] = await reminders(id)
    expect(r.kind).toBe('absolute')
    expect(r.fire_at).toBe(new Date(2026, 10, 3, 9, 0).getTime())
    await waitFor(() => !!container.querySelector('[data-testid="reminder-time"]'), 'the listed reminder')
    expect(container.querySelector('[data-testid="reminder-time"]')?.textContent).toBe('Tue 3 Nov, 09:00')
    await unmount()
  })

  it('adds a preset, snoozes a fired reminder and deletes one, from the keyboard (task-detail-redesign 9.1)', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-20', time: '18:00' } })
    const past = await addReminder(id, { kind: 'absolute', fire_at: new Date(2026, 9, 14, 11, 0).getTime() })
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    const menuFor = () => container.querySelector(`[data-reminder-id="${past}"] button[aria-haspopup="menu"]`) as HTMLButtonElement
    await waitFor(() => !!menuFor() && !!container.querySelector('button[aria-label="Add reminder"]'), 'the reminder list')
    const live = () => db.reminders.where('task_id').equals(id).filter((r) => !r.deleted_at).toArray()

    // Add: the menu opens on its first preset; Down twice reaches "30 minutes before".
    const add = container.querySelector('button[aria-label="Add reminder"]') as HTMLButtonElement
    add.focus()
    await click(add)
    await waitFor(() => !!document.activeElement?.textContent?.includes('At due time'), 'the menu on its first preset')
    await key(document.activeElement!, 'ArrowDown')
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('30 minutes before')
    await click(document.activeElement!) // Enter on a native button activates it
    await waitFor(async () => (await live()).length === 2, 'the preset added')
    await waitFor(() => document.activeElement === add, 'focus back on Add')
    expect((await live()).map((r) => r.offset_minutes).sort()).toEqual([-30, null])
    expect(document.activeElement).toBe(add)

    // Snooze: the fired reminder's menu offers it; type-ahead "s" finds it.
    menuFor().focus()
    await click(menuFor())
    await waitFor(() => !!document.activeElement?.closest('[role="menu"]'), 'the reminder menu')
    await key(document.activeElement!, 's')
    expect(document.activeElement?.textContent).toContain('Snooze 10 minutes')
    await click(document.activeElement!)
    await waitFor(async () => (await db.reminders.get(past))!.fire_at === new Date(2026, 9, 14, 12, 10).getTime(), 'the snoozed time')

    // Delete: End jumps to the last item.
    await waitFor(() => !document.querySelector('[role="menu"]'), 'the menu closed')
    menuFor().focus()
    await click(menuFor())
    await waitFor(() => !!document.activeElement?.closest('[role="menu"]'), 'the reminder menu')
    await key(document.activeElement!, 'End')
    expect(document.activeElement?.textContent).toContain('Delete reminder')
    await click(document.activeElement!)
    await waitFor(async () => !(await live()).some((r) => r.id === past), 'the reminder deleted')
    await unmount()
  })

  it('offers deadline presets once the task has a deadline and shows the chip (OpenSpec deadlines 5.1)', async () => {
    const plain = await createTask({ title: 'No deadline yet' })
    let r = await render(<RemindersField task={(await db.tasks.get(plain))!} />)
    await openAdd(r.container)
    expect([...document.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent?.includes('the deadline'))).toBe(false)
    await r.unmount()
    document.body.innerHTML = ''

    const id = await createTask({ title: 'Tax return', deadline: '2026-11-06' })
    r = await render(<RemindersField task={(await db.tasks.get(id))!} />)
    await openAdd(r.container)
    await click(menuItem('1 day before the deadline')!)
    await waitFor(async () => (await reminders(id)).length === 1, 'the stored reminder')
    const [rem] = await reminders(id)
    expect(rem).toMatchObject({ kind: 'deadline', offset_minutes: -1440, fire_at: new Date(2026, 10, 5, 9, 0).getTime() })
    await waitFor(() => !!r.container.querySelector('[data-reminder-id]'), 'the listed reminder')
    expect(r.container.querySelector('[data-reminder-id]')?.textContent).toContain('1 day before the deadline')
    await r.unmount()
  })

  it('a custom deadline reminder: 2 hours before the deadline', async () => {
    const id = await createTask({ title: 'Tax return', deadline: '2026-11-06' })
    const { container, unmount } = await render(<RemindersField task={(await db.tasks.get(id))!} />)
    await openAdd(container)
    await click(menuItem('Custom before the deadline')!)
    await waitFor(() => !!container.querySelector('input[aria-label="Offset amount"]'), 'the custom offset form')
    const amount = container.querySelector('input[aria-label="Offset amount"]') as HTMLInputElement
    await type(amount, '2')
    const unit = container.querySelector('select[aria-label="Offset unit"]') as HTMLSelectElement
    await act(async () => { unit.value = '60'; unit.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('form')?.textContent).toContain('the deadline')
    await act(async () => { (container.querySelector('form') as HTMLFormElement).requestSubmit() })
    await waitFor(async () => (await reminders(id)).length === 1, 'the stored reminder')
    const [rem] = await reminders(id)
    expect(rem).toMatchObject({ kind: 'deadline', offset_minutes: -120, fire_at: new Date(2026, 10, 6, 7, 0).getTime() })
    await unmount()
  })
})
