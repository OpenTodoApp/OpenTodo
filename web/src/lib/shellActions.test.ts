// @vitest-environment happy-dom
// Addresses a native shell opens the app at (OpenSpec change native-shells, "Snooze
// from the notification", "Quick add from the widget").
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createTask, resetDeviceId } from './ops'
import { addReminder } from './reminders'
import { applyReminderAction, handleShellUrl, shellUrlAction, takeQuickAddPrefill } from './shellActions'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('shell address actions', () => {
  it('reads the actions and ignores anything else', () => {
    expect(shellUrlAction('?reminder=r1&action=snooze')).toEqual({ kind: 'reminder', id: 'r1', action: 'snooze' })
    expect(shellUrlAction('?reminder=r1&action=delete')).toBeNull()
    expect(shellUrlAction('?add=Call%20the%20plumber%20tomorrow%209am')).toEqual({ kind: 'add', text: 'Call the plumber tomorrow 9am' })
    expect(shellUrlAction('?add=')).toEqual({ kind: 'add', text: '' })
    expect(shellUrlAction('?task=t1')).toBeNull()
  })

  it('Snooze and Dismiss write the same fields as the push worker', async () => {
    const id = await createTask({ title: 'Renew passport' })
    const now = Date.UTC(2026, 9, 22, 15, 0)
    const rid = await addReminder(id, { kind: 'absolute', fire_at: now - 1000 })
    await applyReminderAction(rid, 'snooze', now)
    // push-sw.js: { fire_at: now + 10 min, delivered_at: null, dismissed_at: null }
    expect(await db.reminders.get(rid)).toMatchObject({ fire_at: now + 10 * 60 * 1000, delivered_at: null, dismissed_at: null })
    await applyReminderAction(rid, 'dismiss', now + 1)
    // push-sw.js: { dismissed_at: now }
    expect((await db.reminders.get(rid))!.dismissed_at).toBe(now + 1)
    // Each is an ordinary op in the outbox, so it reaches every device.
    expect((await db.outbox.toArray()).filter((op) => (op as { entityId?: string; entity_id?: string }).entityId === rid || (op as { entity_id?: string }).entity_id === rid).length).toBeGreaterThanOrEqual(2)
  })

  it('add prefills quick add without creating a task, and leaves the address clean', async () => {
    history.replaceState(null, '', '/?add=Call%20the%20plumber%20tomorrow%209am')
    let opened = 0
    const action = await handleShellUrl(() => { opened++; return true })
    expect(action).toEqual({ kind: 'add', text: 'Call the plumber tomorrow 9am' })
    expect(opened).toBe(1)
    expect(takeQuickAddPrefill()).toBe('Call the plumber tomorrow 9am')
    expect(takeQuickAddPrefill()).toBeNull()
    expect(location.search).toBe('')
    expect(await db.tasks.count()).toBe(0)
  })
})
