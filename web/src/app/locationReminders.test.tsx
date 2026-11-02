// @vitest-environment happy-dom
// Location reminders in the task panel and in Settings (OpenSpec change
// location-reminders 2.3, 2.4): "When I arrive" and "When I leave" with the radius
// form, the disabled state with the link to the location editor, the chip's words,
// "Fires on your phone" where it cannot fire, and the per-device switch for each
// answer of the shell.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, useDatabase } from '../lib/db'
import { META_SHELL_GEOFENCES, setShellGeofences } from '../lib/geofences'
import { createTask, resetDeviceId } from '../lib/ops'
import { addReminder } from '../lib/reminders'
import { forgetShellData, type OpenTodoShell, type ShellLocationPermission } from '../lib/shell'
import { click, render, waitFor } from '../ui/test-utils'
import { LocationRemindersView } from './LocationRemindersSettings'
import { RemindersField } from './RemindersField'

let n = 0
beforeEach(() => {
  useDatabase(`locrem-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => {
  forgetShellData()
  delete window.opentodoShell
})

const menuItem = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(text))
async function openAdd(root: HTMLElement) {
  const add = () => root.querySelector<HTMLButtonElement>('button[aria-label="Add reminder"]')
  await waitFor(() => !!add(), 'the Add reminder button')
  await click(add()!)
  await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0, 'the reminder menu')
}
const live = (id: string) => db.reminders.where('task_id').equals(id).filter((r) => !r.deleted_at).toArray()

describe('location reminders in the task panel', () => {
  it('adds "When I leave" with 300 m to a task at a place, and the chip says it fires on the phone', async () => {
    const id = await createTask({ title: 'Take the parcel' })
    await db.tasks.update(id, { location: { name: 'Home', lat: 45.4781, lon: 9.2272 } })
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    await openAdd(container)
    const leave = menuItem('When I leave')!
    expect(leave.disabled).toBe(false)
    await click(leave)
    await waitFor(() => !!container.querySelector('[data-location-reminder-editor]'), 'the radius form')
    expect(container.querySelector('[data-location-reminder-editor]')?.textContent).toContain('Home')
    await click(container.querySelector<HTMLButtonElement>('[data-segment="300"]')!)
    expect(container.querySelector('[data-radius-value]')?.textContent).toBe('300 m')
    await act(async () => { (container.querySelector('[data-location-reminder-editor]') as HTMLFormElement).requestSubmit() })
    await waitFor(async () => (await live(id)).length === 1, 'the stored reminder')
    const [r] = await live(id)
    expect(r).toMatchObject({ kind: 'leave', radius_m: 300, fire_at: null, offset_minutes: null })
    await waitFor(() => !!container.querySelector('[data-location-chip]'), 'the chip')
    const chip = container.querySelector('[data-location-chip]')!
    expect(chip.textContent).toContain('Leaving Home')
    expect(chip.textContent).toContain('300 m')
    expect(chip.textContent).toContain('Fires on your phone')
    await unmount()
  })

  it('a task with an address only offers both disabled, with the reason and a link to the location editor', async () => {
    const id = await createTask({ title: 'Ask about the card' })
    await db.tasks.update(id, { location: { address: 'Via Roma 1' } })
    const task = (await db.tasks.get(id))!
    const onAddLocation = vi.fn()
    const { container, unmount } = await render(<RemindersField task={task} onAddLocation={onAddLocation} />)
    await openAdd(container)
    expect(menuItem('When I arrive')!.disabled).toBe(true)
    expect(menuItem('When I leave')!.disabled).toBe(true)
    expect(menuItem('When I arrive')!.textContent).toContain('Add a location with a point on the map first')
    await click(document.querySelector<HTMLButtonElement>('[data-add-location]')!)
    expect(onAddLocation).toHaveBeenCalledOnce()
    await unmount()
  })

  it('on a phone with location reminders on, the chip carries no "Fires on your phone"', async () => {
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.21.0', capabilities: ['geofences'], scheduleGeofences: () => 'granted' } as OpenTodoShell
    const id = await createTask({ title: 'Buy stamps' })
    await db.tasks.update(id, { location: { name: 'Post office', lat: 45.4642, lon: 9.19 } })
    await addReminder(id, { kind: 'arrive', radius_m: 150 })
    await setShellGeofences(true)
    const task = (await db.tasks.get(id))!
    const { container, unmount } = await render(<RemindersField task={task} />)
    await waitFor(() => !!container.querySelector('[data-location-chip]'), 'the chip')
    await waitFor(() => !container.querySelector('[data-fires-on-phone]'), 'the hint gone')
    expect(container.querySelector('[data-location-chip]')?.textContent).toContain('Arriving at Post office')
    await unmount()
  })
})

describe('Settings → Notifications → Location reminders', () => {
  const install = (answer: ShellLocationPermission) => {
    const calls: string[] = []
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.21.0', capabilities: ['geofences'], scheduleGeofences: (json) => { calls.push(json); return answer } } as OpenTodoShell
    return calls
  }
  const view = (props: Partial<Parameters<typeof LocationRemindersView>[0]>) => renderToStaticMarkup(
    <LocationRemindersView mode="shell" platform="android" state={{ enabled: false, permission: null }} disclosing={false} busy={false} onToggle={() => {}} onContinue={() => {}} onCancel={() => {}} {...props} />,
  )

  it('granted: the switch stays on and the regions are handed over after asking', async () => {
    const calls = install('granted')
    expect(await setShellGeofences(true)).toBe('granted')
    expect(await getMeta(META_SHELL_GEOFENCES, false)).toBe(true)
    expect(JSON.parse(calls[0]).ask).toBe(true)
    expect(view({ state: { enabled: true, permission: 'granted' } })).toContain('On')
  })

  for (const answer of ['foreground-only', 'denied', 'unavailable'] as const) {
    it(`${answer}: the switch stays off and nothing is armed`, async () => {
      const calls = install(answer)
      expect(await setShellGeofences(true)).toBe(answer)
      expect(await getMeta(META_SHELL_GEOFENCES, false)).toBe(false)
      expect(JSON.parse(calls[calls.length - 1]).regions).toEqual([])
    })
  }

  it('explains each answer', () => {
    expect(view({ state: { enabled: false, permission: 'foreground-only' } })).toContain('Allow all the time')
    expect(view({ state: { enabled: false, permission: 'foreground-only' } })).toContain('Open settings')
    expect(view({ platform: 'ios', state: { enabled: false, permission: 'foreground-only' } })).toContain('Choose Always')
    expect(view({ state: { enabled: false, permission: 'denied' } })).toContain('Location access is off')
    expect(view({ state: { enabled: false, permission: 'unavailable' } })).toContain('cannot watch places')
  })

  it('shows the disclosure before asking, inline in the card', () => {
    const html = view({ disclosing: true })
    expect(html).toContain('Your location stays on this phone and is never sent to your server.')
    expect(html).toContain('Continue')
    expect(html).not.toContain('role="dialog"')
  })

  it('in a browser says where location reminders fire, with no switch', () => {
    const html = view({ mode: 'browser' })
    expect(html).toContain('Location reminders fire only in the Android or iPhone app')
    expect(html).not.toContain('role="switch"')
  })

  it('an older app without the capability shows no switch', () => {
    const html = view({ mode: 'update' })
    expect(html).toContain('Update the OpenTodo app')
    expect(html).not.toContain('role="switch"')
  })
})
