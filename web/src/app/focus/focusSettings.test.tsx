// @vitest-environment happy-dom
// Settings → General → Focus (OpenSpec change focus-mode, task 6.1): the defaults,
// bounds checked before a write, the card in the General section and in search;
// the presets, the noise and the device volume (focus-everywhere).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { FOCUS_DEFAULTS, forgetNoiseVolume, NOISE_VOLUME_KEY, readNoiseVolume, writeNoiseVolume } from '../../lib/focus/prefs'
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
afterEach(() => { vi.unstubAllGlobals() })

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

// Presets, background noise and the device volume (OpenSpec focus-everywhere,
// tasks 1.2, 3.2 and 3.4).
describe('presets and noise', () => {
  const presetFields = () => [...document.querySelectorAll<HTMLInputElement>('[data-focus-presets-edit] input')]

  it('Edit the presets: 15, 45 and 90 are stored; 200 is refused with the range and nothing is written; Reset goes back to 10, 20, 40', async () => {
    const r = await render(<FocusSection />)
    await waitFor(() => presetFields().length === 4, 'four fields')
    expect(presetFields().map((i) => i.value)).toEqual(['10', '20', '40', ''])
    await typeInto(presetFields()[2], '200')
    expect(document.querySelector('[data-focus-range="focus_presets"]')?.textContent).toBe('From 5 to 180 minutes')
    expect(await db.outbox.count()).toBe(0)
    await typeInto(presetFields()[0], '15')
    expect(await db.outbox.count()).toBe(0)
    await typeInto(presetFields()[2], '90')
    await typeInto(presetFields()[1], '45')
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_presets === '15,45,90', 'stored')
    await click(document.querySelector<HTMLButtonElement>('[data-focus-presets-reset]')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_presets === '', 'reset')
    await waitFor(() => presetFields()[0].value === '10', 'fields reset')
    await r.unmount()
  })

  it('Noise: Off by default with no volume; choosing Brown writes it and shows this device\'s volume (never synced) with Preview', async () => {
    localStorage.removeItem(NOISE_VOLUME_KEY)
    const r = await render(<FocusSection />)
    const select = () => document.getElementById('focus-noise') as HTMLSelectElement
    await waitFor(() => !!select(), 'the choice')
    expect(select().value).toBe('off')
    expect(document.querySelector('[data-focus-noise-volume]')).toBeNull()
    await act(async () => {
      select().value = 'brown'
      select().dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitFor(async () => (await db.userPrefs.get('me'))?.focus_noise === 'brown', 'stored')
    await waitFor(() => !!document.querySelector('[data-focus-noise-volume]'), 'volume')
    const slider = document.querySelector<HTMLInputElement>('[data-focus-noise-volume]')!
    expect(slider.value).toBe('40')
    await typeInto(slider, '10')
    expect(localStorage.getItem(NOISE_VOLUME_KEY)).toBe('10')
    expect(readNoiseVolume()).toBe(10)
    expect((await db.outbox.toArray()).map((o) => o.field)).toEqual(['focus_noise'])
    await r.unmount()
  })

  it('Volume: 40 by default, clamped to 0-100, removed at sign-out', () => {
    localStorage.removeItem(NOISE_VOLUME_KEY)
    expect(readNoiseVolume()).toBe(40)
    writeNoiseVolume(250)
    expect(readNoiseVolume()).toBe(100)
    localStorage.setItem(NOISE_VOLUME_KEY, 'loud')
    expect(readNoiseVolume()).toBe(40)
    writeNoiseVolume(10)
    forgetNoiseVolume()
    expect(localStorage.getItem(NOISE_VOLUME_KEY)).toBeNull()
  })
})

