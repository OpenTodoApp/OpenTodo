// @vitest-environment happy-dom
// The device's notifications switch recovers after the permission is granted in the
// system settings (OpenSpec native-shells). A refusal turns the switch off and marks it
// an automatic off; on resume, once the shell reports the permission granted, it comes
// back on. A switch the user turned off is left alone.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getMeta, useDatabase, db } from './db'
import { META_SHELL_NOTIFICATIONS, META_SHELL_NOTIF_AUTO_OFF, recheckShellNotifications, setShellNotifications } from './shellPublish'
import type { OpenTodoShell } from './shell'
import type { Reminder, Task } from './types'

let permission: 'granted' | 'denied' | 'exact-denied' = 'granted'
function installShell(capabilities: string[]): void {
  ;(window as unknown as { opentodoShell?: OpenTodoShell }).opentodoShell = {
    bridge: 1, platform: 'android', app: '1.5.0', capabilities,
    scheduleReminders: (_json: string) => permission,
  } as unknown as OpenTodoShell
}

let n = 0
beforeEach(() => { useDatabase(`shellnotif-${Date.now()}-${n++}`); permission = 'granted' })
afterEach(() => { delete (window as unknown as { opentodoShell?: OpenTodoShell }).opentodoShell })

const task = (id: string): Task => ({ id, title: `Task ${id}`, project_id: null, due: null, priority: 4, completed_at: null, deleted_at: null }) as unknown as Task
const reminder = (id: string, taskId: string, fireAt: number): Reminder =>
  ({ id, task_id: taskId, kind: 'absolute', offset_minutes: null, fire_at: fireAt, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null }) as unknown as Reminder

describe('shell notifications recover after the permission is granted', () => {
  it('a refusal turns them off as an automatic off; a later grant on resume turns them back on', async () => {
    installShell(['reminders', 'links'])
    await db.tasks.add(task('t1'))
    await db.reminders.add(reminder('r1', 't1', Date.now() + 3_600_000))

    // The permission is refused: turning the switch on turns it off automatically and marks it.
    permission = 'denied'
    await setShellNotifications(true)
    expect(await getMeta(META_SHELL_NOTIFICATIONS, true)).toBe(false)
    expect(await getMeta(META_SHELL_NOTIF_AUTO_OFF, false)).toBe(true)

    // The user grants it in the system settings; the next resume turns it back on.
    permission = 'granted'
    await recheckShellNotifications()
    expect(await getMeta(META_SHELL_NOTIFICATIONS, false)).toBe(true)
    expect(await getMeta(META_SHELL_NOTIF_AUTO_OFF, true)).toBe(false)
  })

  it('a switch the user turned off is left off on resume', async () => {
    installShell(['reminders', 'links'])
    await setShellNotifications(false)
    expect(await getMeta(META_SHELL_NOTIF_AUTO_OFF, true)).toBe(false)

    permission = 'granted'
    await recheckShellNotifications()
    expect(await getMeta(META_SHELL_NOTIFICATIONS, true)).toBe(false)
  })

  it('a still-refused permission on resume leaves the switch off and the mark set', async () => {
    installShell(['reminders', 'links'])
    await db.tasks.add(task('t1'))
    await db.reminders.add(reminder('r1', 't1', Date.now() + 3_600_000))
    permission = 'denied'
    await setShellNotifications(true)

    await recheckShellNotifications()
    expect(await getMeta(META_SHELL_NOTIFICATIONS, true)).toBe(false)
    expect(await getMeta(META_SHELL_NOTIF_AUTO_OFF, false)).toBe(true)
  })
})
