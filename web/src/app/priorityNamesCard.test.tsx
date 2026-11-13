// @vitest-environment happy-dom
// Settings → General → Priorities (OpenSpec change priority-names, task 2.4): one
// field per level written as it is typed, the 24-character stop, Reset, the card in
// search, and every level's name following on the same device without a reload.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { publishEncryption } from '../lib/e2ee'
import { resetDeviceId } from '../lib/ops'
import { priorityAccessibleName, priorityName } from '../lib/priority'
import type { User } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { DateTimePrefsProvider, useDateTimeFormat } from './DateTimePrefsProvider'
import { PrioritiesSection, PrioritiesView } from './PrioritiesSettings'
import { searchSettings } from './settingsIndex'

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { vi.unstubAllGlobals() })

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const field = (n: number) => document.querySelector<HTMLInputElement>(`[data-priority-name="${n}"]`)!

/** Reads the names the way every list does: re-rendered with the date format. */
function Probe() {
  useDateTimeFormat()
  return <span data-probe>{[1, 2, 3, 4].map((n) => priorityName(n)).join('|')}</span>
}

describe('the Priorities card', () => {
  it('four fields in order, each labelled with its level, then Reset', async () => {
    const r = await render(<PrioritiesView names={['', '', '', '']} onChange={() => {}} onReset={() => {}} />)
    // Learn more sits in the card's line, above the fields.
    const order = [...document.querySelectorAll<HTMLElement>('input, button:not([data-learn-more])')]
    expect(order.map((el) => el.dataset.priorityName ?? (el.hasAttribute('data-priority-names-reset') ? 'reset' : '?'))).toEqual(['1', '2', '3', '4', 'reset'])
    for (const n of [1, 2, 3, 4]) {
      expect(document.querySelector(`label[for="priority-name-${n}"]`)?.textContent).toBe(n === 4 ? 'No priority' : `Priority ${n}`)
      expect(field(n).maxLength).toBe(24)
    }
    await r.unmount()
  })

  it('Rename two levels: written as typed, shown at once, no task changes; Reset brings back every default', async () => {
    await db.tasks.put({ id: 't1', title: 'Pay rent', priority: 1 } as never)
    const r = await render(<DateTimePrefsProvider><PrioritiesSection /><Probe /></DateTimePrefsProvider>)
    await waitFor(() => !!field(1), 'fields')
    await typeInto(field(1), 'Must ')
    await typeInto(field(2), 'Should')
    await waitFor(async () => (await db.userPrefs.get('me'))?.priority_name_2 === 'Should', 'written')
    expect((await db.userPrefs.get('me'))?.priority_name_1).toBe('Must')
    // The space typed after a word stays in the field while the stored name is trimmed.
    expect(field(1).value).toBe('Must ')
    await waitFor(() => document.querySelector('[data-probe]')?.textContent === 'Must|Should|Priority 3|No priority', 'shown')
    expect(priorityAccessibleName(1)).toBe('Must, priority 1')
    expect((await db.tasks.get('t1'))?.priority).toBe(1)
    expect((await db.outbox.toArray()).every((o) => o.entity === 'user_prefs')).toBe(true)

    await click(document.querySelector<HTMLButtonElement>('[data-priority-names-reset]')!)
    await waitFor(async () => {
      const row = await db.userPrefs.get('me')
      return [1, 2, 3, 4].every((n) => row?.[`priority_name_${n}` as 'priority_name_1'] === '')
    }, 'reset')
    await waitFor(() => field(1).value === '' && field(2).value === '', 'fields cleared')
    await waitFor(() => document.querySelector('[data-probe]')?.textContent === 'Priority 1|Priority 2|Priority 3|No priority', 'defaults')
    await r.unmount()
  })

  it('Locked device (priority-names D7): the default names until it is unlocked', async () => {
    await db.userPrefs.put({ id: 'me', priority_name_1: 'Must' } as never)
    act(() => publishEncryption({ enabled: true, unlocked: false }))
    const r = await render(<DateTimePrefsProvider><Probe /></DateTimePrefsProvider>)
    await waitFor(() => !!document.querySelector('[data-probe]'), 'probe')
    expect(document.querySelector('[data-probe]')?.textContent).toBe('Priority 1|Priority 2|Priority 3|No priority')
    act(() => publishEncryption({ unlocked: true }))
    await waitFor(() => document.querySelector('[data-probe]')?.textContent === 'Must|Priority 2|Priority 3|No priority', 'unlocked')
    act(() => publishEncryption({ enabled: false, unlocked: false }))
    await r.unmount()
  })

  it('Too long: the field stops at 24 characters and says so', async () => {
    const r = await render(<PrioritiesSection />)
    await waitFor(() => !!field(3), 'fields')
    expect(document.querySelector('[data-priority-name-full]')).toBeNull()
    await typeInto(field(3), 'x'.repeat(24))
    expect(document.querySelector('[data-priority-name-full="3"]')?.textContent).toBe('At most 24 characters')
    await waitFor(async () => (await db.userPrefs.get('me'))?.priority_name_3 === 'x'.repeat(24), 'written')
    await r.unmount()
  })

  it('Find the card: "rename" and "priority" list Priorities under General', () => {
    for (const q of ['rename', 'priority']) {
      const hits = searchSettings(q, member)
      const general = hits.find((h) => h.section.id === 'general')
      expect(general?.entries.map((e) => e.anchor), q).toContain('priorities-heading')
    }
  })
})
