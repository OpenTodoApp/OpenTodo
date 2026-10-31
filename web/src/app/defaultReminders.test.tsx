// @vitest-environment happy-dom
// OpenSpec change default-reminders, task 3.3: the "Default reminders" card in
// Settings → Notifications writes the synced preferences through ops.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { readDefaultReminders, USER_PREFS_ID } from '../lib/userPrefs'
import { click, render, type, waitFor } from '../ui/test-utils'
import { DefaultRemindersSection } from './DefaultRemindersSettings'
import { searchSettings } from './settingsIndex'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const stored = async () => readDefaultReminders(await db.userPrefs.get(USER_PREFS_ID))

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Settings → Notifications → Default reminders', () => {
  it('a choice writes the op and survives a reload', async () => {
    const r = await render(<DefaultRemindersSection />)
    const timed = () => r.container.querySelector<HTMLSelectElement>('#default-reminder-timed')!
    await waitFor(() => !!timed())
    expect(timed().value).toBe('none')
    expect(r.container.textContent).toContain('Added when a task gets a date. You can remove it from any task.')
    await choose(timed(), '-30')
    await waitFor(async () => (await stored()).timed === -30)
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'reminder_default_timed')
    expect(queued.map((o) => o.value)).toEqual(['-30'])
    await r.unmount()
    // Read again from the stored row, as after a reload.
    const again = await render(<DefaultRemindersSection />)
    await waitFor(() => again.container.querySelector<HTMLSelectElement>('#default-reminder-timed')?.value === '-30')
    await again.unmount()
  })

  it('Custom… sets any offset, which is then shown as it is', async () => {
    const r = await render(<DefaultRemindersSection />)
    const dated = () => r.container.querySelector<HTMLSelectElement>('#default-reminder-dated')!
    await waitFor(() => !!dated())
    await choose(dated(), 'custom')
    const form = r.container.querySelector<HTMLFormElement>('[data-testid="default-reminder-custom"]')!
    const amount = form.querySelector<HTMLInputElement>('input[type="number"]')!
    await type(amount, '5')
    await choose(form.querySelector<HTMLSelectElement>('select[aria-label="Offset unit"]')!, '1440')
    await click(form.querySelector<HTMLButtonElement>('button[type="submit"]')!)
    await waitFor(async () => (await stored()).dated === -7200)
    await waitFor(() => dated().value === '-7200')
    expect(dated().selectedOptions[0].textContent).toBe('5 days before')
    await choose(dated(), 'none')
    await waitFor(async () => (await stored()).dated === null)
    await r.unmount()
  })

  it('is found by the settings search', () => {
    const user = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'member' as const, createdAt: 1 }
    const hits = searchSettings('default reminders', user).flatMap((h) => h.entries)
    expect(hits.some((e) => e.anchor === 'default-reminders-heading' && e.page === 'push')).toBe(true)
  })
})
