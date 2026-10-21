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
import { META_SHELL_NOTIFICATIONS, setShellNotifications } from '../lib/shellPublish'
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
