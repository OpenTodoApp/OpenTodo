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
    // focus-live-activity D4: Pause and Resume, only at /focus.
    expect(shellUrlAction('?action=pause', '/focus')).toEqual({ kind: 'focus', action: 'pause' })
    expect(shellUrlAction('?action=resume', '/focus')).toEqual({ kind: 'focus', action: 'resume' })
    expect(shellUrlAction('?action=pause')).toBeNull()
    expect(shellUrlAction('?action=stop', '/focus')).toBeNull()
  })

  it('Pause and Resume from the shell go through the Space transitions; a stale one writes nothing', async () => {
    const { startSession } = await import('./focus/session')
    const { readFocus } = await import('./focus/state')
    const { FOCUS_DEFAULTS } = await import('./focus/prefs')
    const { setCurrentUserId } = await import('./sharing')
    await setCurrentUserId('u1')
    const id = await createTask({ title: 'Write the report' })
    const t0 = Date.now()
    await startSession(id, FOCUS_DEFAULTS, t0)
    const running = async () => (await db.timeEntries.toArray()).filter((e) => !e.deleted_at && e.ended_at == null).length
    expect(await running()).toBe(1)
    const replaced: string[] = []
    const loc = { pathname: '/focus', search: '?action=pause', hash: '' } as Location
    const hist = { state: null, replaceState: (_s: unknown, _t: string, url: string) => void replaced.push(url) } as unknown as History
    expect(await handleShellUrl(() => false, loc, hist)).toEqual({ kind: 'focus', action: 'pause' })
    expect(replaced).toEqual(['/focus'])
    expect((await readFocus())?.resumedAt).toBeNull()
    expect(await running()).toBe(0)
    // Already paused: nothing changes and no op is written.
    const before = await db.outbox.count()
    const row = await readFocus()
    await handleShellUrl(() => false, loc, hist)
    expect(await readFocus()).toEqual(row)
    expect(await db.outbox.count()).toBe(before)
    await handleShellUrl(() => false, { ...loc, search: '?action=resume' } as Location, hist)
    expect((await readFocus())?.resumedAt).not.toBeNull()
    expect(await running()).toBe(1)
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

  it('the widget\'s completion is read from the address', () => {
    expect(shellUrlAction('?complete=t1')).toEqual({ kind: 'complete', ids: ['t1'] })
    expect(shellUrlAction('?complete=t%2F1')).toEqual({ kind: 'complete', ids: ['t/1'] })
    // Every tick queued since the last run, each once.
    expect(shellUrlAction('?complete=a&complete=b&complete=a&complete=')).toEqual({ kind: 'complete', ids: ['a', 'b'] })
    expect(shellUrlAction('?complete=')).toBeNull()
  })

  describe('the widget\'s completion (android-widget-list D2)', () => {
    const replaced: string[] = []
    const hist = { state: null, replaceState: (_s: unknown, _t: string, url: string) => void replaced.push(url) } as unknown as History
    const at = (search: string) => ({ pathname: '/', search, hash: '' }) as Location
    const shellWith = (capabilities: string[]) => { window.opentodoShell = { bridge: 1, platform: 'android', app: '1.0.0', capabilities } }

    it('completes the task through its op in a background run, once', async () => {
      shellWith(['reminders', 'widgets', 'background'])
      try {
        const id = await createTask({ title: 'Call the plumber' })
        const other = await createTask({ title: 'Water the plants' })
        const before = await db.outbox.count()
        expect(await handleShellUrl(() => false, at(`?complete=${id}&complete=${other}&complete=gone`), hist)).toEqual({ kind: 'complete', ids: [id, other, 'gone'] })
        expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
        expect((await db.tasks.get(other))!.completed_at).not.toBeNull()
        expect(await db.outbox.count()).toBeGreaterThan(before)
        expect(replaced.at(-1)).toBe('/')
        // Done already: a second run writes nothing.
        const after = await db.outbox.count()
        await handleShellUrl(() => false, at(`?complete=${id}`), hist)
        expect(await db.outbox.count()).toBe(after)
      } finally { delete window.opentodoShell }
    })

    it('the visible app ignores it: any app can open it at an address', async () => {
      shellWith(['reminders', 'widgets', 'share'])
      try {
        const id = await createTask({ title: 'Call the plumber' })
        await handleShellUrl(() => false, at(`?complete=${id}`), hist)
        expect((await db.tasks.get(id))!.completed_at).toBeNull()
        expect(replaced.at(-1)).toBe('/')
      } finally { delete window.opentodoShell }
    })
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
