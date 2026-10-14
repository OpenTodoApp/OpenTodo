// @vitest-environment happy-dom
// DueField on the date and time fields (date-time-preferences 3.4): typed dates
// write the floating due, a zoned due stays fixed to its zone, and `z` toggles it.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { flush, key, render, type } from '../ui/test-utils'
import { DueField } from './DueField'

let n = 0
beforeEach(() => {
  useDatabase(`duefield-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => { setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }) })

async function task(due: Task['due']): Promise<Task> {
  const id = await createTask({ title: 'Pay rent', due })
  return (await db.tasks.get(id))!
}
const inputs = (c: HTMLElement) => [...c.querySelectorAll('input')] as HTMLInputElement[]

describe('DueField', () => {
  it('a typed day-month date writes the floating {date}', async () => {
    const t = await task(null)
    const { container, unmount } = await render(<DueField task={t} />)
    const [date, time] = inputs(container)
    expect(date.getAttribute('aria-label') ?? date.labels?.[0]?.textContent).toBeTruthy()
    expect(time.disabled).toBe(true)
    await type(date, '2026-11-03')
    await key(date, 'Enter')
    await flush(20)
    expect((await db.tasks.get(t.id))!.due).toEqual({ date: '2026-11-03' })
    await unmount()
  })

  it('shows the due in the user format and keeps a zoned due in its zone', async () => {
    const t = await task({ date: '2026-11-03', time: '09:00', tz: 'UTC' })
    const { container, unmount } = await render(<DueField task={t} />)
    const [date, time] = inputs(container)
    expect(date.value).toMatch(/^\d{2}\/\d{2}\/2026$/)
    expect(time.value).toMatch(/^\d{2}:\d{2}$/)
    await type(time, '3pm')
    await key(time, 'Enter')
    await flush(20)
    const due = (await db.tasks.get(t.id))!.due!
    expect(due.tz).toBe('UTC')
    expect(container.querySelector('button[aria-haspopup="dialog"][aria-label^="Time zone"]')?.getAttribute('aria-label')).toBe('Time zone: UTC')
    await unmount()
  })

  it('z toggles the zone of a timed due', async () => {
    const t = await task({ date: '2026-11-03', time: '09:00' })
    const { unmount } = await render(<DueField task={t} />)
    await key(document.body, 'z')
    await flush(20)
    expect((await db.tasks.get(t.id))!.due?.tz).toBeTruthy()
    await unmount()
  })
})
