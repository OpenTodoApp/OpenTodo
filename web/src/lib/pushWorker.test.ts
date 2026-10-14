// The service worker's reminder handlers (public/push-sw.js) run against the same
// IndexedDB as the app. These tests load the script into a stubbed worker scope
// over fake-indexeddb and check the push and notification-click paths.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, useDatabase } from './db'
import { createTask, getDeviceId, resetDeviceId } from './ops'
import { addReminder } from './reminders'
import { checkReminders, SHOWN_KEY, type ShownSet } from './reminderWatcher'
import { formatDate, formatTime, resolveDateTime } from './dates'
import { setUserPref, type DateTimePrefs } from './userPrefs'
import source from '../../public/push-sw.js?raw'

interface Scope {
  listeners: Record<string, (ev: unknown) => void>
  shown: { title: string; options: Record<string, unknown> }[]
  messages: unknown[]
  fetches: { url: string; body: unknown }[]
  opened: string[]
}

function loadWorker(opts: { windows?: { focused: boolean }[]; fetchOk?: boolean } = {}): Scope {
  const scope: Scope = { listeners: {}, shown: [], messages: [], fetches: [], opened: [] }
  const windows = (opts.windows ?? []).map((w) => ({
    focused: w.focused, visibilityState: w.focused ? 'visible' : 'hidden',
    postMessage: (m: unknown) => scope.messages.push(m), focus: async () => undefined,
  }))
  const self = {
    crypto: globalThis.crypto,
    addEventListener: (type: string, fn: (ev: unknown) => void) => (scope.listeners[type] = fn),
    clients: { matchAll: async () => windows, openWindow: vi.fn(async (url: string) => scope.opened.push(url)) },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => scope.shown.push({ title, options }) },
  }
  const fetchStub = async (url: string, init: { body: string }) => {
    scope.fetches.push({ url, body: JSON.parse(init.body) })
    return { ok: opts.fetchOk ?? true, status: 200 }
  }
  // The app database name is the default one in production; tests use per-test names.
  const code = source.replace("const DB_NAME = 'opentodo'", `const DB_NAME = ${JSON.stringify(db.name)}`)
  new Function('self', 'fetch', 'indexedDB', code)(self, fetchStub, globalThis.indexedDB)
  return scope
}

async function dispatch(scope: Scope, type: string, ev: Record<string, unknown>) {
  let work: Promise<unknown> = Promise.resolve()
  scope.listeners[type]({ ...ev, waitUntil: (p: Promise<unknown>) => (work = p) })
  await work
}

function pushEvent(data: unknown) {
  return { data: { json: () => data } }
}

let n = 0
beforeEach(async () => {
  useDatabase(`sw-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId() // the app has opened the database and has a device id
})

async function setup() {
  const now = Date.now()
  const taskId = await createTask({ title: 'Call the dentist', due: { date: '2026-10-11', time: '10:00' } })
  const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: now - 1000 })
  await db.outbox.clear()
  db.close() // the worker opens the database on its own connection
  await db.open()
  return { now, taskId, reminderId }
}

describe('service worker reminder handlers', () => {
  it('push with the app closed shows a notification titled from the local task and records it as shown', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0].title).toBe('Call the dentist')
    expect(sw.shown[0].options.tag).toBe(`reminder:${reminderId}`)
    expect((sw.shown[0].options.actions as { action: string }[]).map((a) => a.action)).toEqual(['snooze10', 'dismiss'])
    const shown = await getMeta<ShownSet>(SHOWN_KEY, {})
    expect(shown[reminderId]).toEqual({ fireAt: now - 1000, by: 'sw' })
    // The in-app path does not repeat a reminder the worker already showed.
    expect(await checkReminders(now)).toEqual([])
  })

  it('push while the app is focused goes to the app only', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker({ windows: [{ focused: true }] })
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(sw.shown).toEqual([])
    expect(sw.messages).toEqual([{ type: 'reminders:push', reminderId, taskId, fireAt: now - 1000 }])
    expect((await checkReminders(now)).length).toBe(1)
  })

  it('uses the opt-in title, or a generic one, when the task is not on the device', async () => {
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId: 'r-x', taskId: 't-x', fireAt: 5, title: 'From payload' }))
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId: 'r-y', taskId: 't-y', fireAt: 5 }))
    expect(sw.shown.map((s) => s.title)).toEqual(['From payload', 'Reminder'])
  })

  it('Snooze 10 min from the notification writes ops to the store and outbox and uploads them', async () => {
    const { taskId, reminderId } = await setup()
    const sw = loadWorker({ fetchOk: true })
    const before = Date.now()
    await dispatch(sw, 'notificationclick', { action: 'snooze10', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    const r = (await db.reminders.get(reminderId))!
    expect(r.fire_at).toBeGreaterThanOrEqual(before + 600_000)
    expect(r.delivered_at).toBeNull()
    expect(r._clock.fire_at.device).toBe(await getDeviceId())
    // No window open: posted to /api/v1/sync directly, then removed from the outbox.
    expect(sw.fetches).toHaveLength(1)
    expect(sw.fetches[0].url).toBe('/api/v1/sync')
    const body = sw.fetches[0].body as { ops: { field: string; entityId: string }[] }
    expect(body.ops.map((o) => o.field).sort()).toEqual(['delivered_at', 'dismissed_at', 'fire_at'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('offline, a dismiss stays queued in the outbox for the next sync', async () => {
    const { taskId, reminderId } = await setup()
    const sw = loadWorker({ fetchOk: false })
    await dispatch(sw, 'notificationclick', { action: 'dismiss', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect((await db.reminders.get(reminderId))?.dismissed_at).not.toBeNull()
    const queued = await db.outbox.toArray()
    expect(queued.map((o) => [o.entity, o.field])).toEqual([['reminder', 'dismissed_at']])
  })

  it('with a window open, asks it to sync instead of fetching', async () => {
    const { taskId, reminderId } = await setup()
    const sw = loadWorker({ windows: [{ focused: false }] })
    await dispatch(sw, 'notificationclick', { action: 'dismiss', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect(sw.fetches).toEqual([])
    expect(sw.messages).toMatchObject([{ type: 'reminders:changed', reminderIds: [reminderId] }])
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('service worker test pushes (push-test-delivery)', () => {
  it('shows a system notification even with the app focused, with a unique tag, and reports receipt', async () => {
    const scope = loadWorker({ windows: [{ focused: true }, { focused: false }] })
    await dispatch(scope, 'push', pushEvent({ type: 'test', testId: 'abc', sentAt: 1 }))
    await dispatch(scope, 'push', pushEvent({ type: 'test', testId: 'def', sentAt: 2 }))
    expect(scope.shown.map((s) => s.options.tag)).toEqual(['opentodo-test:abc', 'opentodo-test:def'])
    expect(scope.shown[0].options.body).toMatch(/push works on this device/)
    const receipts = scope.messages.filter((m) => (m as { type: string }).type === 'push:test-received')
    expect(receipts.map((m) => (m as { testId: string }).testId)).toEqual(['abc', 'abc', 'def', 'def'])
    expect(scope.messages.some((m) => (m as { type: string }).type === 'reminders:push')).toBe(false)
  })

  it('writes nothing to the database', async () => {
    const before = { outbox: await db.outbox.count(), meta: await getMeta(SHOWN_KEY, null) }
    const scope = loadWorker()
    await dispatch(scope, 'push', pushEvent({ type: 'test', testId: 'abc', sentAt: 1 }))
    expect({ outbox: await db.outbox.count(), meta: await getMeta(SHOWN_KEY, null) }).toEqual(before)
  })

  it('a click opens notification settings', async () => {
    const scope = loadWorker()
    await dispatch(scope, 'notificationclick', { notification: { data: { test: true, testId: 'abc' }, close: () => undefined }, action: '' })
    expect(scope.opened).toEqual(['/settings/notifications'])
    expect(scope.fetches).toEqual([])
  })
})

type DueFormatter = (due: { date: string; time?: string }, prefs: Partial<DateTimePrefs> | undefined, today: string) => string

/** Loads push-sw.js into a bare scope and returns its inline due formatter. */
function workerFormatter(): DueFormatter {
  const self: { addEventListener: () => void; __opentodoFormatDue?: DueFormatter } = { addEventListener: () => undefined }
  new Function('self', 'fetch', 'indexedDB', source)(self, undefined, undefined)
  return self.__opentodoFormatDue!
}

describe('service worker due text (date-time-preferences D7)', () => {
  const TODAY = '2026-10-14'
  const P = (p: Partial<DateTimePrefs>): DateTimePrefs => ({ date_format: 'system', time_format: 'system', week_start: 'system', ...p })
  // One table for both formatters: the inline copy in push-sw.js and lib/dates.ts.
  const FIXTURE: [Partial<DateTimePrefs>, { date: string; time?: string }][] = [
    [{}, { date: '2026-11-03', time: '15:00' }],
    [{}, { date: '2027-02-03' }],
    [{ date_format: 'day-month', time_format: '24h' }, { date: '2026-11-03', time: '9:05' }],
    [{ date_format: 'day-month' }, { date: '2027-02-03', time: '15:00' }],
    [{ date_format: 'month-day', time_format: '12h' }, { date: '2026-11-03', time: '15:00' }],
    [{ date_format: 'month-day', time_format: '12h' }, { date: '2027-02-03', time: '00:30' }],
    [{ date_format: 'iso', time_format: '12h' }, { date: '2026-11-03', time: '12:00' }],
    [{ date_format: 'unknown' as never, time_format: '36h' as never }, { date: '2026-11-03', time: '15:00' }],
  ]
  it.each(FIXTURE)('%o %o matches lib/dates.ts', (prefs, due) => {
    const fmt = workerFormatter()
    const r = resolveDateTime(P(prefs), { order: 'MD', hour12: false, weekStart: 1 })
    const want = due.time ? `${formatDate(due.date, 'compact', r, TODAY)}, ${formatTime(due.time, r)}` : formatDate(due.date, 'compact', r, TODAY)
    expect(fmt(due, prefs, TODAY)).toBe(want)
  })

  it('a pushed reminder reads Due Nov 3, 3:00 PM with month-day and 12h stored on the device', async () => {
    const taskId = await createTask({ title: 'Pay rent', due: { date: `${new Date().getFullYear()}-11-03`, time: '15:00' } })
    const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: Date.now() - 1000 })
    await setUserPref('date_format', 'month-day')
    await setUserPref('time_format', '12h')
    db.close()
    await db.open()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: Date.now() - 1000 }))
    expect(sw.shown[0].options.body).toBe('Due Nov 3, 3:00 PM')
  })

  it('falls back to the locale date and the stored time without preferences', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    const date = new Date(2026, 9, 11).toLocaleDateString(undefined, new Date().getFullYear() === 2026 ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
    expect(sw.shown[0].options.body).toBe(`Due ${date}, 10:00`)
  })
})
