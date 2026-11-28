// @vitest-environment happy-dom
// Addresses a native shell opens the app at (OpenSpec change native-shells, "Snooze
// from the notification", "Quick add from the widget").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { occurrenceId } from './ids'
import { completeTask, createTask, mutate, resetDeviceId } from './ops'
import { addReminder } from './reminders'
import { afterFirstSync, applyReminderAction, handleShellUrl, shellUrlAction, takeQuickAddPrefill } from './shellActions'

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
    // android-upcoming-calendar-widgets D6: the occurrence ticked, beside plain ids.
    expect(shellUrlAction('?complete=a%402026-10-23&complete=b')).toEqual({ kind: 'complete', ids: ['a', 'b'], on: { a: '2026-10-23' } })
    expect(shellUrlAction('?complete=a%40soon')).toEqual({ kind: 'complete', ids: ['a@soon'] })
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

    it('an occurrence already advanced is not advanced again (android-upcoming-calendar-widgets D6)', async () => {
      shellWith(['reminders', 'widgets', 'background'])
      try {
        const id = await createTask({ title: 'Water the plants', due: { date: '2026-10-23' } })
        await handleShellUrl(() => false, at(`?complete=${id}@2026-10-22`), hist)
        expect((await db.tasks.get(id))!.completed_at).toBeNull()
        await handleShellUrl(() => false, at(`?complete=${id}@2026-10-23`), hist)
        expect((await db.tasks.get(id))!.completed_at).not.toBeNull()
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

  describe('Done on a repeating task from a notification (#2183)', () => {
    const hist = { state: null, replaceState: () => undefined } as unknown as History
    const at = (search: string) => ({ pathname: '/', search, hash: '' }) as Location
    // 10:00 on 23 October, local time: the 09:00 reminder of the day has fired.
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 23, 10, 0)) })
    afterEach(() => { vi.useRealTimers() })

    async function dailyAt9(due: string) {
      const id = await createTask({ title: 'Water the plants' })
      await mutate('task', id, { due: { date: due, time: '09:00' }, recurrence: 'every day' })
      const rid = await addReminder(id, { kind: 'relative', offset_minutes: 0 })
      return { id, rid }
    }

    it('waits for the first sync, so a copy that is behind completes the occurrence the server is on', async () => {
      // The phone last synced on the 22nd; the 22nd was then completed on another device.
      const { id, rid } = await dailyAt9('2026-10-22')
      const sync = async () => { await completeTask(id) }
      await handleShellUrl(() => false, at(`?reminder=${rid}&action=done`), hist, sync)
      expect((await db.tasks.get(occurrenceId(id, '2026-10-23')))?.completed_at).not.toBeNull()
      expect((await db.tasks.get(id))!.due?.date).toBe('2026-10-24')
    })

    it('an occurrence already completed elsewhere is not completed again', async () => {
      const { id, rid } = await dailyAt9('2026-10-23')
      await completeTask(id)
      const before = await db.outbox.count()
      await applyReminderAction(rid, 'done')
      expect((await db.tasks.get(id))!.due?.date).toBe('2026-10-24')
      expect(await db.outbox.count()).toBe(before)
    })

    it('a snooze set on another device does not stop Done', async () => {
      const { id, rid } = await dailyAt9('2026-10-23')
      // Snoozed elsewhere until the afternoon: the stored firing is later, the occurrence is still today's.
      await mutate('reminder', rid, { fire_at: new Date(2026, 9, 23, 15, 0).getTime(), delivered_at: null })
      await applyReminderAction(rid, 'done')
      expect((await db.tasks.get(occurrenceId(id, '2026-10-23')))?.completed_at).not.toBeNull()
      expect((await db.tasks.get(id))!.due?.date).toBe('2026-10-24')
    })

    it('a firing written by a clock ahead or in another time zone does not stop Done', async () => {
      const { id, rid } = await dailyAt9('2026-10-23')
      // The stored fire_at is 09:00 read in a zone five hours behind: computed here, it is today's 09:00.
      await mutate('reminder', rid, { fire_at: new Date(2026, 9, 23, 14, 0).getTime() })
      await applyReminderAction(rid, 'done')
      expect((await db.tasks.get(occurrenceId(id, '2026-10-23')))?.completed_at).not.toBeNull()
    })

    it('a firing written east of the phone, already passed, does not stop Done', async () => {
      // The phone is west of the writer: here the series computes to 15:00 today, hours
      // ahead, but the stored fire_at, which the shell scheduled from, has passed.
      const { id, rid } = await dailyAt9('2026-10-23')
      await mutate('task', id, { due: { date: '2026-10-23', time: '15:00' } })
      await mutate('reminder', rid, { fire_at: new Date(2026, 9, 23, 9, 0).getTime() })
      await applyReminderAction(rid, 'done')
      expect((await db.tasks.get(occurrenceId(id, '2026-10-23')))?.completed_at).not.toBeNull()
    })

    it('today an absolute reminder of a series is not guarded: Done moves it again (follow-up: the occurrence shown)', async () => {
      const id = await createTask({ title: 'Water the plants' })
      await mutate('task', id, { due: { date: '2026-10-23', time: '09:00' }, recurrence: 'every day' })
      const rid = await addReminder(id, { kind: 'absolute', fire_at: new Date(2026, 9, 23, 9, 0).getTime() })
      await completeTask(id)
      await applyReminderAction(rid, 'done')
      expect((await db.tasks.get(id))!.due?.date).toBe('2026-10-25')
    })

    it('Snooze and Dismiss do not wait for the sync', async () => {
      const { rid } = await dailyAt9('2026-10-23')
      let waited = 0
      await handleShellUrl(() => false, at(`?reminder=${rid}&action=dismiss`), hist, async () => { waited++ })
      expect(waited).toBe(0)
      expect((await db.reminders.get(rid))!.dismissed_at).not.toBeNull()
    })
  })

  it('the first sync ends at its first exchange, when it cannot run, or at the limits', async () => {
    let snap = { state: 'idle', lastSyncedAt: null as number | null }
    const fns = new Set<() => void>()
    const listen = (fn: () => void) => { fns.add(fn); return () => void fns.delete(fn) }
    const set = (next: typeof snap) => { snap = next; fns.forEach((fn) => fn()) }
    let done = false
    const waiting = afterFirstSync(() => snap, listen, 1_000, 500).then(() => { done = true })
    set({ state: 'syncing', lastSyncedAt: null })
    await Promise.resolve()
    expect(done).toBe(false)
    set({ state: 'idle', lastSyncedAt: 1 })
    await waiting
    expect(fns.size).toBe(0)
    snap = { state: 'offline', lastSyncedAt: null }
    await afterFirstSync(() => snap, listen, 1_000, 500)
    // Sync never starts: the shorter limit.
    snap = { state: 'idle', lastSyncedAt: null }
    const t0 = Date.now()
    await afterFirstSync(() => snap, listen, 1_000, 50)
    expect(Date.now() - t0).toBeLessThan(900)
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
