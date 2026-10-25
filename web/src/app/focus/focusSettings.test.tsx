// @vitest-environment happy-dom
// Settings → General → Focus (OpenSpec change focus-mode, task 6.1): the defaults,
// bounds checked before a write, the card in the General section and in search.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import type { User } from '../../lib/types'
import { click, render, waitFor } from '../../ui/test-utils'
import { searchSettings } from '../settingsIndex'
import { closeHelp, useHelpRequest } from '../../lib/helpRequest'
import { SettingsView } from '../SettingsView'
import { FocusSection, FocusSettingsView } from './FocusSettings'

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('the Focus card', () => {
  it('Defaults: Pomodoro, 25, 5 and 15 minutes, every 4, auto-starts off, the reminder off at 90, the sound off', async () => {
    const r = await render(<FocusSettingsView prefs={FOCUS_DEFAULTS} />)
    const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value
    expect(value('focus-mode')).toBe('pomodoro')
    expect([value('focus-focus_work_minutes'), value('focus-focus_short_break_minutes'), value('focus-focus_long_break_minutes'), value('focus-focus_long_break_every')]).toEqual(['25', '5', '15', '4'])
    const switches = [...document.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute('aria-checked'))
    expect(switches).toEqual(['false', 'false', 'false', 'false'])
    expect(document.querySelector('[data-focus-reminder-off]')?.textContent).toContain('90 minutes')
    await r.unmount()
  })

  it('Bounds: 0 and 400 are refused with the range and nothing is written; 50 is written', async () => {
    const r = await render(<FocusSection />)
    const input = document.getElementById('focus-focus_work_minutes') as HTMLInputElement
    await typeInto(input, '0')
    expect(document.querySelector('[data-focus-range="focus_work_minutes"]')?.textContent).toBe('From 1 to 180 minutes')
    await typeInto(input, '400')
    expect(document.querySelector('[data-focus-range="focus_work_minutes"]')).toBeTruthy()
    expect(await db.outbox.count()).toBe(0)
    await typeInto(input, '50')
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_work_minutes === 50, 'written')
    expect((await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)).toEqual(['focus_work_minutes=50'])
    await r.unmount()
  })

  it('the break reminder switch turns it on at 90 minutes and the sound switch writes on', async () => {
    const r = await render(<FocusSection />)
    const switches = () => [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    await click(switches()[2])
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_break_after_minutes === 90, 'reminder on')
    await click(switches()[3])
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_sound === 'on', 'sound on')
    await r.unmount()
  })

  it('Focus settings: the Pomodoro length and the break reminder are in General → Focus, found by search, with Help to the focus guide', async () => {
    const Probe = () => <span data-help-probe>{useHelpRequest()?.screen}</span>
    const r = await render(<><SettingsView user={member} onLogout={() => {}} section="general" page="focus" /><Probe /></>)
    await waitFor(() => !!document.querySelector('[data-testid="focus-settings"]'), 'card')
    const card = document.querySelector('[data-testid="focus-settings"]')!
    expect(card.textContent).toContain('Work session')
    expect(card.textContent).toContain('Break reminder')
    await click(card.querySelector('[data-learn-more]')!)
    expect(document.querySelector('[data-help-probe]')?.textContent).toBe('settings/focus')
    closeHelp()
    expect(searchSettings('pomodoro', member)[0]).toMatchObject({ section: { id: 'general' } })
    expect(searchSettings('break reminder', member).flatMap((h) => h.entries.map((e) => e.anchor))).toContain('focus-heading')
    await r.unmount()
  })
})
