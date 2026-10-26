// @vitest-environment happy-dom
// Quick add reads repeats and reminders (OpenSpec change quick-add-recurrence,
// task 2.5): the two chips for an English line, Backspace twice dismissing the
// reminder chip, and the reminder written with the task; the ordinal weekday
// rule with its "of the month" tail (quick-add-nth-weekday 2.5).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate } from '../lib/dates'
import type { QuickAddInput } from '../lib/nlp'
import { key, render, type, waitFor } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0))
  localStorage.setItem('opentodo.quickadd', JSON.stringify({ enabled: true, languages: ['en'], dayMonthOrder: 'auto' }))
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('repeat and remind chips', () => {
  it('shows a Repeats and a Reminder chip, and Backspace twice keeps the reminder as text', async () => {
    const added: QuickAddInput[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={(i) => { added.push(i) }} />)
    const input = r.container.querySelector('input')!
    await type(input, 'Water plants every Monday remind me at 8')
    const kinds = () => [...r.container.querySelectorAll('[data-chip]')].map((c) => c.getAttribute('data-chip'))
    await waitFor(() => kinds().includes('reminder'), 'the reminder chip')
    expect(kinds()).toEqual(expect.arrayContaining(['recurrence', 'reminder']))
    expect(r.container.querySelector('[data-chip="recurrence"]')!.textContent).toMatch(/every Monday/i)
    input.setSelectionRange(input.value.length, input.value.length)
    await key(input, 'Backspace')
    await key(input, 'Backspace')
    await waitFor(() => !kinds().includes('reminder'), 'the reminder chip removed')
    expect(kinds()).not.toContain('reminder')
    expect(kinds()).toContain('recurrence')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length > 0, 'the add')
    expect(added).toHaveLength(1)
    expect(added[0].recurrence).toMatch(/every/i)
    expect(added[0].title).toContain('remind me at 8')
    expect(added[0].reminders ?? []).toEqual([])
    await r.unmount()
  })
})

describe('ordinal weekday rules (quick-add-nth-weekday 2.5)', () => {
  it('reads "of the month" after a monthly rule and shows the first date on the recurrence chip', async () => {
    vi.setSystemTime(new Date(2026, 9, 9, 9, 0))
    const added: QuickAddInput[] = []
    const r = await render(<QuickAdd placeholder="Add a task" onAdd={(i) => { added.push(i) }} />)
    const input = r.container.querySelector('input')!
    await type(input, 'Board every 2nd monday of the month')
    await waitFor(() => !!r.container.querySelector('[data-chip="recurrence"]'), 'the recurrence chip')
    const kinds = [...r.container.querySelectorAll('[data-chip]')].map((c) => c.getAttribute('data-chip'))
    expect(kinds).toEqual(['recurrence'])
    expect(r.container.querySelector('[data-chip="recurrence"]')!.textContent).toContain(`every 2nd monday · ${formatDate('2026-10-12', 'long')}`)
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => added.length > 0, 'the add')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ title: 'Board', recurrence: 'every 2nd monday', due: { date: '2026-10-12' } })
    await r.unmount()
  })
})

describe('the share screen', () => {
  it('writes a typed repeat and reminder with the shared task', async () => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const dbm = await import('../lib/db')
    const { resetDeviceId } = await import('../lib/ops')
    const { parseShare } = await import('../lib/share')
    const { ShareCapture, setPendingShare } = await import('./ShareCapture')
    dbm.useDatabase(`share-remind-${Date.now()}`)
    resetDeviceId()
    setPendingShare(parseShare('?title=Read%20this&url=https://example.org/post'))
    await render(<ShareCapture />)
    await waitFor(() => !!document.querySelector('#share-capture input[aria-label="Task title"]'), 'the capture form')
    const input = document.querySelector<HTMLInputElement>('#share-capture input[aria-label="Task title"]')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await type(input, 'Read this tomorrow at 9 every week remind me 30 minutes before')
    await waitFor(() => !!document.querySelector('#share-capture [data-chip="reminder"]'), 'the reminder chip')
    await act(async () => { (document.getElementById('share-capture') as HTMLFormElement).requestSubmit() })
    await waitFor(async () => (await dbm.db.tasks.count()) > 0, 'the saved task')
    const [task] = await dbm.db.tasks.toArray()
    expect(task.recurrence).toMatch(/every week/i)
    const reminders = await dbm.db.reminders.where('task_id').equals(task.id).toArray()
    expect(reminders.map((r) => [r.kind, r.offset_minutes])).toEqual([['relative', -30]])
  })
})
