// @vitest-environment happy-dom
// Settings → Preferences and Projects (settings-redesign 5.1, 5.4): the rebuilt rows
// write the same per-device preferences as before.
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, render } from '../ui/test-utils'
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
    const { container, unmount } = await render(<CalendarSettingsView prefs={{ startHour: 6, endHour: 8, dayLength: 480 }} onSave={onSave} />)
    await choose(container.querySelector('select[aria-label="Grid start hour"]') as HTMLSelectElement, '9')
    expect(onSave).toHaveBeenLastCalledWith({ startHour: 9, endHour: 10 })
    await choose(container.querySelector('select[aria-label="Day length"]') as HTMLSelectElement, '360')
    expect(onSave).toHaveBeenLastCalledWith({ dayLength: 360 })
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
