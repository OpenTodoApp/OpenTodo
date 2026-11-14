// @vitest-environment happy-dom
// Settings → Notifications in the Android app (OpenSpec change native-shells, reminders
// "Notification settings": "Enable in the Android app", "Android permission refused").
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { addReminder } from '../lib/reminders'
import type { OpenTodoShell } from '../lib/shell'
import { EXACT_ALARMS_EVENT, META_EXACT_NOTICED, META_SHELL_NOTIFICATIONS, publishReminders, setShellNotifications, shellNotificationsEnabled, shellTitlesEnabled } from '../lib/shellPublish'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { noticeExactAlarms } from './shellExactNotice'
import { ShellNotificationsView } from './ShellNotifications'

function install(answer: 'granted' | 'denied') {
  const scheduleReminders = vi.fn(async () => answer)
  const testNotification = vi.fn(async () => true)
  window.opentodoShell = { bridge: 1, platform: 'android', app: '0.10.0', capabilities: ['reminders'], scheduleReminders, testNotification } as OpenTodoShell
  return { scheduleReminders, testNotification }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => { delete window.opentodoShell })

describe('notifications through the Android app', () => {
  it('enabling hands the coming reminders to the shell and creates no push subscription', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { scheduleReminders } = install('granted')
    const id = await createTask({ title: 'Call the bank' })
    await addReminder(id, { kind: 'absolute', fire_at: Date.now() + 60 * 60 * 1000 })
    expect(await setShellNotifications(true)).toBe('granted')
    expect(await getMeta(META_SHELL_NOTIFICATIONS, false)).toBe(true)
    const handed = JSON.parse((scheduleReminders.mock.calls.at(-1) as unknown as [string])[0])
    expect(handed).toHaveLength(1)
    expect(handed[0]).toMatchObject({ taskId: id })
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/push'))).toBe(false)
    fetchSpy.mockRestore()
  })

  it('a refused Android permission keeps the setting off and explains where to allow it', async () => {
    install('denied')
    expect(await setShellNotifications(true)).toBe('denied')
    expect(await getMeta(META_SHELL_NOTIFICATIONS, false)).toBe(false)
    const html = renderToStaticMarkup(
      <ShellNotificationsView state={{ enabled: false, includeContent: false, permission: 'denied' }} busy={false} message={null} onEnable={() => {}} onIncludeContent={() => {}} onTest={() => {}} />,
    )
    expect(html).toContain('Android refused notifications for OpenTodo')
    expect(html).toContain('reminders still appear inside the app')
  })

  it('turning it off hands over an empty schedule', async () => {
    const { scheduleReminders } = install('granted')
    await setShellNotifications(false)
    expect(scheduleReminders).toHaveBeenLastCalledWith('[]')
  })
})

// shell-reminders-on: on until turned off, asked only where a person can answer.
describe('reminders through the apps are on by default', () => {
  const shellWith = (capabilities: string[], answer: 'granted' | 'denied' | 'exact-denied', platform: 'android' | 'ios' = 'android') => {
    const scheduleReminders = vi.fn(async () => answer)
    window.opentodoShell = { bridge: 1, platform, app: '1.6.0', capabilities, scheduleReminders } as OpenTodoShell
    return scheduleReminders
  }
  const reminderInAnHour = async (title = 'Call the bank') => {
    const id = await createTask({ title })
    await addReminder(id, { kind: 'absolute', fire_at: Date.now() + 60 * 60 * 1000 })
    return id
  }
  const handed = (fn: ReturnType<typeof vi.fn>) => JSON.parse((fn.mock.calls.at(-1) as unknown as [string])[0]) as { taskId: string; title?: string }[]

  it('a device that never touched the switch is handed the reminders, with their titles', async () => {
    const schedule = shellWith(['reminders', 'links'], 'granted')
    const id = await reminderInAnHour()
    expect(await shellNotificationsEnabled()).toBe(true)
    expect(await shellTitlesEnabled()).toBe(true)
    await publishReminders()
    expect(handed(schedule)).toEqual([expect.objectContaining({ taskId: id, title: 'Call the bank' })])
    // Nothing was stored: the default, not a choice.
    expect(await getMeta<boolean | null>(META_SHELL_NOTIFICATIONS, null)).toBeNull()
  })

  it('a device where it was turned off stays off', async () => {
    const schedule = shellWith(['reminders', 'links'], 'granted')
    await reminderInAnHour()
    await setShellNotifications(false)
    await publishReminders()
    expect(schedule).toHaveBeenLastCalledWith('[]')
    expect(await shellNotificationsEnabled()).toBe(false)
  })

  it('the person saying no turns the setting off', async () => {
    shellWith(['reminders', 'links'], 'denied')
    await reminderInAnHour()
    expect(await publishReminders()).toBe('denied')
    expect(await getMeta<boolean | null>(META_SHELL_NOTIFICATIONS, null)).toBe(false)
  })

  it('a background run, or a schedule without reminders, is nobody\'s answer', async () => {
    shellWith(['reminders', 'widgets', 'background'], 'denied')
    await reminderInAnHour()
    expect(await publishReminders()).toBe('denied')
    expect(await getMeta<boolean | null>(META_SHELL_NOTIFICATIONS, null)).toBeNull()
    await db.reminders.clear()
    shellWith(['reminders', 'links'], 'denied')
    await publishReminders()
    expect(await getMeta<boolean | null>(META_SHELL_NOTIFICATIONS, null)).toBeNull()
  })

  it('refused exact alarms are announced by the visible app only, and said once per device', async () => {
    const heard = vi.fn()
    window.addEventListener(EXACT_ALARMS_EVENT, heard)
    try {
      await reminderInAnHour()
      shellWith(['reminders', 'widgets', 'background'], 'exact-denied')
      await publishReminders()
      expect(heard).not.toHaveBeenCalled()
      shellWith(['reminders', 'links', 'alarm-settings'], 'exact-denied')
      expect(await publishReminders()).toBe('exact-denied')
      expect(heard).toHaveBeenCalledTimes(1)
      // Still on: late reminders are reminders.
      expect(await shellNotificationsEnabled()).toBe(true)
    } finally {
      window.removeEventListener(EXACT_ALARMS_EVENT, heard)
    }
    hideBulkToast()
    expect(await noticeExactAlarms()).toBe(true)
    expect(bulkToast()).toMatchObject({ label: 'Reminders may arrive a few minutes late.', action: { label: 'Allow' } })
    expect(await getMeta(META_EXACT_NOTICED, false)).toBe(true)
    hideBulkToast()
    expect(await noticeExactAlarms()).toBe(false)
    expect(bulkToast()).toBeNull()
    // An older shell cannot open the page: the notice has no button.
    await db.meta.delete(META_EXACT_NOTICED)
    shellWith(['reminders', 'links'], 'exact-denied')
    await noticeExactAlarms()
    expect(bulkToast()?.action).toBeUndefined()
    hideBulkToast()
  })

  it('Settings offers Allow for exact alarms only in a shell that can open the page, and names the iPhone on iOS', () => {
    const view = (extra: Partial<Parameters<typeof ShellNotificationsView>[0]>, permission: 'denied' | 'exact-denied') => renderToStaticMarkup(
      <ShellNotificationsView state={{ enabled: permission !== 'denied', includeContent: true, permission }} busy={false} message={null} onEnable={() => {}} onIncludeContent={() => {}} onTest={() => {}} {...extra} />,
    )
    expect(view({ onAllowAlarms: () => {} }, 'exact-denied')).toMatch(/Alarms &amp; reminders[\s\S]*>Allow</)
    expect(view({}, 'exact-denied')).not.toContain('>Allow<')
    const ios = view({ ios: true }, 'denied')
    expect(ios).toContain('iPhone')
    expect(ios).not.toContain('Android')
    expect(view({}, 'denied')).toContain('Android refused notifications')
  })
})
