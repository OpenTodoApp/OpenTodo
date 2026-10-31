// @vitest-environment happy-dom
// Settings → Preferences and Projects (settings-redesign 5.1, 5.4): the rebuilt rows
// write the same per-device preferences as before.
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, key, render, type } from '../ui/test-utils'
import { ClosedListView } from './ClosedListSettings'
import { CalendarSettingsView } from './CalendarSettings'
import { KeyboardView, StartViewView } from './PreferencesPanels'
import { AutoArchiveView } from './ProjectsSettings'

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Preferences rows', () => {
  it('start view: the select writes the chosen view', async () => {
    const onChange = vi.fn()
    const { container, unmount } = await render(<StartViewView views={[{ id: 'v1', name: 'Morning' } as never]} startView="inbox" onChange={onChange} />)
    const select = container.querySelector('select[aria-label="Start view on this device"]') as HTMLSelectElement
    await choose(select, 'view:v1')
    expect(onChange).toHaveBeenCalledWith('view:v1')
    await unmount()
  })

  it('start view: lists Display: Today and Display: Upcoming, and a display pinned from the display itself (display-mode 4.2)', async () => {
    const onChange = vi.fn()
    const { container, rerender, unmount } = await render(<StartViewView views={[]} startView="inbox" onChange={onChange} />)
    const select = () => container.querySelector('select[aria-label="Start view on this device"]') as HTMLSelectElement
    const labels = () => [...select().querySelectorAll('optgroup[label="Display mode"] option')].map((o) => o.textContent)
    expect(labels()).toEqual(['Display: Today', 'Display: Upcoming'])
    await choose(select(), 'display:/display/upcoming')
    expect(onChange).toHaveBeenCalledWith('display:/display/upcoming')
    await rerender(<StartViewView views={[]} startView="display:/display/project/p1?eink=1" onChange={onChange} />)
    expect(labels()).toEqual(['Display: Today', 'Display: Upcoming', 'Display pinned on this device'])
    expect(select().value).toBe('display:/display/project/p1?eink=1')
    await unmount()
  })

  it('keyboard: the Vim switch is a switch and toggles the device preference', async () => {
    const onVim = vi.fn()
    const { container, unmount } = await render(<KeyboardView vim={false} onVim={onVim} />)
    const sw = container.querySelector('[data-vim-switch] [role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await click(sw)
    expect(onVim).toHaveBeenCalledWith(true)
    await unmount()
  })

  it('calendar: start, end and day length write grid preferences, end follows start', async () => {
    const onSave = vi.fn()
    const { container, unmount } = await render(<CalendarSettingsView prefs={{ startHour: 6, endHour: 8, dayLength: 480, planDays: 14, countEvents: false }} onSave={onSave} />)
    await choose(container.querySelector('select[aria-label="Grid start hour"]') as HTMLSelectElement, '9')
    expect(onSave).toHaveBeenLastCalledWith({ startHour: 9, endHour: 10 })
    await choose(container.querySelector('select[aria-label="Day length"]') as HTMLSelectElement, '360')
    expect(onSave).toHaveBeenLastCalledWith({ dayLength: 360 })
    await unmount()
  })

  it('Today limit (today-closed-list D5): Off, the presets and Custom from 1 to 20; Done today is a switch', async () => {
    const onLimit = vi.fn()
    const onDone = vi.fn()
    const { container, unmount } = await render(<ClosedListView limit={0} done={false} onLimit={onLimit} onDone={onDone} />)
    const select = container.querySelector('[data-today-limit]') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['0', '3', '5', '7', '10', 'custom'])
    await choose(select, '5')
    expect(onLimit).toHaveBeenLastCalledWith(5)
    await choose(select, 'custom')
    const custom = container.querySelector('[data-today-limit-custom]') as HTMLInputElement
    await type(custom, '12')
    await key(custom, 'Enter')
    expect(onLimit).toHaveBeenLastCalledWith(12)
    onLimit.mockClear()
    await type(custom, '25')
    await key(custom, 'Enter')
    expect(onLimit).not.toHaveBeenCalled()
    expect(container.querySelector('[data-today-limit-error]')!.textContent).toBe('Choose a whole number from 1 to 20.')
    await click(container.querySelector('[data-today-done-switch] [role="switch"]')!)
    expect(onDone).toHaveBeenCalledWith(true)
    await unmount()
  })

  it('Today limit: a stored custom value opens on Custom', async () => {
    const { container, unmount } = await render(<ClosedListView limit={12} done onLimit={() => {}} onDone={() => {}} />)
    expect((container.querySelector('[data-today-limit]') as HTMLSelectElement).value).toBe('custom')
    expect((container.querySelector('[data-today-limit-custom]') as HTMLInputElement).value).toBe('12')
    await unmount()
  })

  it('projects: the auto-archive switch writes the device setting', async () => {
    const onChange = vi.fn()
    const { container, unmount } = await render(<AutoArchiveView on onChange={onChange} />)
    await click(container.querySelector('[role="switch"]')!)
    expect(onChange).toHaveBeenCalledWith(false)
    await unmount()
  })
})
