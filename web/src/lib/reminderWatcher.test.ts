import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from './db'
import { createTask, resetDeviceId, setTaskCompleted } from './ops'
import { addReminder, dismissReminder, snoozeReminder } from './reminders'
import { checkReminders, markShown, startReminderWatcher, type DueReminder } from './reminderWatcher'

let n = 0
beforeEach(() => {
  useDatabase(`watcher-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => {
  vi.useRealTimers()
})

/** Let IndexedDB work (fake-indexeddb schedules with setImmediate, which is not faked). */
async function settle(rounds = 20) {
  const tick = (globalThis as unknown as { setImmediate: (fn: () => void) => void }).setImmediate
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => tick(r))
}

describe('reminder watcher', () => {
  it('fires a due reminder with fake timers and skips a completed task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const start = new Date(2026, 9, 10, 9, 0).getTime()
    vi.setSystemTime(start)
    const open = await createTask({ title: 'Call the dentist' })
    const done = await createTask({ title: 'Already done' })
    await addReminder(open, { kind: 'absolute', fire_at: start + 60_000 })
    await addReminder(done, { kind: 'absolute', fire_at: start + 60_000 })
    await setTaskCompleted(done, true)

    const seen: DueReminder[][] = []
    const w = startReminderWatcher((d) => seen.push(d))
    await settle()
    expect(seen).toEqual([]) // nothing due yet, nothing published
    await vi.advanceTimersByTimeAsync(30_000)
    await settle()
    expect(seen.length).toBe(0)
    // Past the firing time: within one interval the reminder shows, the completed one never.
    await vi.advanceTimersByTimeAsync(31_000)
    await settle()
    expect(seen.length).toBe(1)
    expect(seen[0].map((d) => d.task.title)).toEqual(['Call the dentist'])
    // Unchanged state is not re-published.
    await vi.advanceTimersByTimeAsync(30_000)
    await settle()
    expect(seen.length).toBe(1)
    // Dismissing clears it.
    await dismissReminder(seen[0][0].reminder.id)
    w.poke()
    await settle()
    expect(seen.at(-1)).toEqual([])
    w.stop()
  })

  it('a snoozed reminder disappears and returns at the new time', async () => {
    const now = Date.now()
    const t = await createTask({ title: 'Stretch' })
    const id = await addReminder(t, { kind: 'absolute', fire_at: now - 1000 })
    expect((await checkReminders(now)).length).toBe(1)
    const at = await snoozeReminder(id, '10m', now)
    expect(await checkReminders(now + 1000)).toEqual([])
    expect((await checkReminders(at)).map((d) => d.reminder.id)).toEqual([id])
  })

  it('skips a reminder the service worker already showed for the same firing', async () => {
    const now = Date.now()
    const t = await createTask({ title: 'x' })
    const id = await addReminder(t, { kind: 'absolute', fire_at: now - 1000 })
    await markShown(id, now - 1000, 'app')
    expect((await checkReminders(now)).length).toBe(1) // own toasts come back after a reload
    await markShown(id, now - 1000, 'sw')
    expect(await checkReminders(now)).toEqual([])
    // A new firing time (snooze) is shown again.
    const at = await snoozeReminder(id, '1h', now)
    expect((await checkReminders(at)).length).toBe(1)
  })

  it('ignores deleted tasks, undated relative reminders and future ones', async () => {
    const now = Date.now()
    const t = await createTask({ title: 'gone' })
    await addReminder(t, { kind: 'absolute', fire_at: now - 1000 })
    const u = await createTask({ title: 'undated' })
    await addReminder(u, { kind: 'relative', offset_minutes: -10 })
    await addReminder(u, { kind: 'absolute', fire_at: now + 60_000 })
    const { deleteTask } = await import('./ops')
    await deleteTask(t)
    expect(await checkReminders(now)).toEqual([])
  })

  it('skips tasks in a trashed project or under a trashed ancestor, and shows them after a restore', async () => {
    const now = Date.now()
    const { createProject, deleteProject, restoreProject, mutate } = await import('./ops')
    const work = await createProject({ name: 'Work' })
    const home = await createProject({ name: 'Home' })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    const a = await createTask({ title: 'In Work', project_id: work })
    const b = await createTask({ title: 'In Garden', project_id: garden })
    await addReminder(a, { kind: 'absolute', fire_at: now - 1000 })
    await addReminder(b, { kind: 'absolute', fire_at: now - 1000 })
    expect((await checkReminders(now)).length).toBe(2)
    await deleteProject(work)
    // A live sub-project under a tombstoned parent (concurrent edits) is covered too.
    await mutate('project', home, { deleted_at: now })
    expect(await checkReminders(now)).toEqual([])
    // Restored: the reminders whose time passed meanwhile show, once each.
    await restoreProject(work)
    await restoreProject(home)
    expect((await checkReminders(now + 60_000)).map((d) => d.task.title).sort()).toEqual(['In Garden', 'In Work'])
  })
})
