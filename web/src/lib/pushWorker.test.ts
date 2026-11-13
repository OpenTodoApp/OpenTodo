// The service worker's reminder handlers (public/push-sw.js) run against the same
// IndexedDB as the app. These tests load the script into a stubbed worker scope
// over fake-indexeddb and check the push and notification-click paths.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta, useDatabase } from './db'
import { CLOCK_OFFSET_META } from './hlc'
import { createTask, getDeviceId, resetDeviceId } from './ops'
import { addReminder } from './reminders'
import { checkReminders, SHOWN_KEY, type ShownSet } from './reminderWatcher'
import { formatDate, formatTime, logicalDay, resolveDateTime } from './dates'
import { setUserPref, type DateTimePrefs } from './userPrefs'
import { applyReminderAction, handleShellUrl } from './shellActions'
import { occurrenceId } from './ids'
import source from '../../public/push-sw.js?raw'
import { MAINTAINED } from '../locales'

const HOUR = 3_600_000

interface Scope {
  listeners: Record<string, (ev: unknown) => void>
  shown: { title: string; options: Record<string, unknown> }[]
  messages: unknown[]
  fetches: { url: string; body: unknown }[]
  opened: string[]
}

function loadWorker(opts: { windows?: { focused: boolean }[]; maxActions?: number; fetchOk?: boolean; answer?: (body: { ops: { id: string; field: string }[] }) => unknown; badge?: (number | 'clear')[] } = {}): Scope {
  const scope: Scope = { listeners: {}, shown: [], messages: [], fetches: [], opened: [] }
  const badge = opts.badge
  const windows = (opts.windows ?? []).map((w) => ({
    focused: w.focused, visibilityState: w.focused ? 'visible' : 'hidden',
    postMessage: (m: unknown) => scope.messages.push(m), focus: async () => undefined,
  }))
  const self = {
    crypto: globalThis.crypto,
    Notification: opts.maxActions === undefined ? undefined : { maxActions: opts.maxActions },
    navigator: badge ? { setAppBadge: async (n: number) => { badge.push(n) }, clearAppBadge: async () => { badge.push('clear') } } : {},
    addEventListener: (type: string, fn: (ev: unknown) => void) => (scope.listeners[type] = fn),
    clients: { matchAll: async () => windows, openWindow: vi.fn(async (url: string) => scope.opened.push(url)) },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => scope.shown.push({ title, options }) },
  }
  const fetchStub = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    scope.fetches.push({ url, body })
    const answer = opts.answer ? opts.answer(body) : { ops: [], cursor: 0, hasMore: false, rejected: [] }
    return { ok: opts.fetchOk ?? true, status: 200, json: async () => answer }
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
    expect((sw.shown[0].options.actions as { action: string }[]).map((a) => a.action)).toEqual(['done', 'snooze10', 'dismiss'])
    const shown = await getMeta<ShownSet>(SHOWN_KEY, {})
    expect(shown[reminderId]).toEqual({ fireAt: now - 1000, by: 'sw' })
    // The in-app path does not repeat a reminder the worker already showed.
    expect(await checkReminders(now)).toEqual([])
  })

  it('a habit with a tiny version names it in the body (habits-home "Reminder text")', async () => {
    const now = Date.now()
    const taskId = await createTask({ title: 'Read', due: { date: '2026-10-11', time: '21:00' }, recurrence: 'every day' })
    await db.tasks.update(taskId, { habit: true, habit_tiny: 'one page' })
    const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: now - 1000 })
    db.close()
    await db.open()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(sw.shown[0].title).toBe('Read')
    expect(sw.shown[0].options.body).toBe('One page is enough')
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

  it('stamps its ops with the app’s stored offset to server time', async () => {
    const { taskId, reminderId } = await setup()
    // The app found this device's clock an hour slow (src/lib/hlc.ts, sync.ts).
    await setMeta(CLOCK_OFFSET_META, HOUR)
    const before = Date.now()
    const sw = loadWorker({ fetchOk: false })
    await dispatch(sw, 'notificationclick', { action: 'dismiss', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    const [op] = await db.outbox.toArray()
    expect(op.ts).toBeGreaterThanOrEqual(before + HOUR)
    expect(op.ts).toBeLessThan(Date.now() + HOUR + 1000)
    expect((await db.reminders.get(reminderId))!._clock.dismissed_at.ts).toBe(op.ts)
    expect(await getMeta<number>('hlc', 0)).toBe(op.ts)
  })

  it('keeps ops the server refused queued for the app’s next sync', async () => {
    const { taskId, reminderId } = await setup()
    const sw = loadWorker({
      answer: (body) => ({ ops: [], cursor: 0, hasMore: false, rejected: body.ops.filter((o) => o.field === 'fire_at').map((o) => ({ id: o.id, reason: 'clock_skew', serverTime: Date.now() })) }),
    })
    await dispatch(sw, 'notificationclick', { action: 'snooze10', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect(sw.fetches).toHaveLength(1)
    const fireAt = (sw.fetches[0].body as { ops: { id: string; field: string }[] }).ops.find((o) => o.field === 'fire_at')!
    expect((await db.outbox.toArray()).map((o) => o.id)).toEqual([fireAt.id])
  })

  it('keeps every op queued when the answer is not the server’s', async () => {
    const { taskId, reminderId } = await setup()
    const sw = loadWorker({ answer: () => null })
    await dispatch(sw, 'notificationclick', { action: 'dismiss', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect(sw.fetches).toHaveLength(1)
    expect(await db.outbox.count()).toBe(1)
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

  it('a pushed reminder reads the due date and 12h time as lib/dates formats them', async () => {
    const taskId = await createTask({ title: 'Pay rent', due: { date: `${new Date().getFullYear()}-11-03`, time: '15:00' } })
    const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: Date.now() - 1000 })
    await setUserPref('date_format', 'month-day')
    await setUserPref('time_format', '12h')
    db.close()
    await db.open()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: Date.now() - 1000 }))
    // The worker keeps the host's locale when no language is stored (design D4),
    // so compute the English-or-local expectation from the same formatter the
    // app uses instead of hard-coding one language.
    const year = new Date().getFullYear()
    const r = resolveDateTime({ date_format: 'month-day', time_format: '12h', week_start: 'system' }, { order: 'MD', hour12: false, weekStart: 1 })
    const want = `${formatDate(`${year}-11-03`, 'compact', r, `${year}-10-14`)}, ${formatTime('15:00', r)}`
    expect(sw.shown[0].options.body).toBe(`Due ${want}`)
  })

  it('falls back to the locale date and the stored time without preferences', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    const date = new Date(2026, 9, 11).toLocaleDateString(undefined, new Date().getFullYear() === 2026 ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
    expect(sw.shown[0].options.body).toBe(`Due ${date}, 10:00`)
  })
})

describe('service worker due dates in the chosen language (#1009)', () => {
  // A browser in another language: the stored language decides, never the browser.
  function formatterOn(languages: string[]): DueFormatter {
    const self: { addEventListener: () => void; navigator: { languages: string[] }; __opentodoFormatDue?: DueFormatter } = { addEventListener: () => undefined, navigator: { languages } }
    new Function('self', 'fetch', 'indexedDB', source)(self, undefined, undefined)
    return self.__opentodoFormatDue!
  }
  const TODAY = '2026-10-14'
  const DUE = { date: '2026-11-03', time: '15:00' }

  it('English on a German browser writes English month names', () => {
    expect(formatterOn(['de-DE', 'de'])(DUE, { language: 'en', time_format: '12h' } as never, TODAY)).toBe('Nov 3, 3:00 PM')
  })

  it('English takes the browser’s English region, like the app', () => {
    expect(formatterOn(['de-DE', 'en-GB'])(DUE, { language: 'en', time_format: '24h' } as never, TODAY)).toBe('3 Nov, 15:00')
  })

  it('German on an English browser writes German month names', () => {
    expect(formatterOn(['en-US'])(DUE, { language: 'de', time_format: '24h' } as never, TODAY)).toBe('3. Nov., 15:00')
  })

  it('an unknown stored language is the browser’s locale', () => {
    const want = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(2026, 10, 3))
    expect(formatterOn([])({ date: '2026-11-03' }, { language: 'xx' } as never, TODAY)).toBe(want)
  })
})

describe('Done on a reminder notification (reminder-done-action)', () => {
  function localDate(offsetDays = 0): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function repeating() {
    const taskId = await createTask({ title: 'Water the plants', due: { date: localDate(), time: '09:00' }, recurrence: 'every day' })
    const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: Date.now() - 1000 })
    await db.outbox.clear()
    db.close()
    await db.open()
    return { taskId, reminderId }
  }

  async function expectAdvanced(taskId: string) {
    const series = await db.tasks.get(taskId)
    expect(series).toMatchObject({ completed_at: null, recurrence: 'every day', due: { date: localDate(1), time: '09:00' } })
    const record = await db.tasks.get(occurrenceId(taskId, localDate()))
    expect(record?.completed_at).toBeGreaterThan(0)
    expect(record?.series_id).toBe(taskId)
    // The completion is queued as ordinary ops, uploaded by the next sync.
    expect((await db.outbox.toArray()).some((o) => o.entityId === taskId && o.field === 'due')).toBe(true)
  }

  it('a browser with two buttons keeps Done and Snooze 10 min', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker({ maxActions: 2 })
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect((sw.shown[0].options.actions as { action: string }[]).map((a) => a.action)).toEqual(['done', 'snooze10'])
  })

  it('with a window open, the worker writes nothing and one window completes the task: a repeating task advances', async () => {
    const { taskId, reminderId } = await repeating()
    const sw = loadWorker({ windows: [{ focused: false }, { focused: true }] })
    await dispatch(sw, 'notificationclick', { action: 'done', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect(sw.messages).toEqual([{ type: 'reminders:done', reminderId }])
    expect(sw.opened).toEqual([])
    expect(await db.outbox.count()).toBe(0)
    // What the app does with the message (ReminderToasts): the app's completion.
    await applyReminderAction(reminderId, 'done')
    await expectAdvanced(taskId)
  })

  it('with no window, the app opens at the Done address, which advances a repeating task', async () => {
    const { taskId, reminderId } = await repeating()
    const sw = loadWorker()
    await dispatch(sw, 'notificationclick', { action: 'done', notification: { data: { reminderId, taskId, fireAt: 1 }, close: () => undefined } })
    expect(sw.opened).toEqual([`/?reminder=${reminderId}&action=done`])
    expect(sw.fetches).toEqual([])
    const url = new URL(sw.opened[0], 'https://todo.example')
    const replaced: string[] = []
    const loc = { search: url.search, pathname: url.pathname, hash: '' } as Location
    const hist = { state: null, replaceState: (_s: unknown, _t: string, u: string) => replaced.push(u) } as unknown as History
    expect(await handleShellUrl(() => false, loc, hist)).toEqual({ kind: 'reminder', id: reminderId, action: 'done' })
    expect(replaced).toEqual(['/'])
    await expectAdvanced(taskId)
  })
})

describe('service worker texts in the stored language (app-localization D9)', () => {
  const KEYS = { reminder: 'Reminder', due: 'Due {date}', tiny: '{tiny} is enough', generic: 'You have a reminder', done: 'Done|task', snooze: 'Snooze 10 min', dismiss: 'Dismiss', test: 'Test notification: push works on this device.' } as const
  type Texts = Partial<Record<keyof typeof KEYS, string>>
  function worker(code = source): Record<string, unknown> {
    const self: Record<string, unknown> = { addEventListener: () => undefined }
    new Function('self', 'fetch', 'indexedDB', code)(self, async () => ({ ok: true }), globalThis.indexedDB)
    return self
  }
  const workerText = () => worker().__opentodoText as Record<string, Texts>

  it('every worker text is the catalog’s translation of the same English message', async () => {
    const text = workerText()
    for (const [lang, entries] of Object.entries(text)) {
      if (lang === 'en') {
        expect(entries).toEqual(KEYS)
        continue
      }
      const catalog = (await import(`../locales/${lang}.json`)).default as Record<string, string>
      for (const key of Object.keys(entries)) expect(entries[key as keyof typeof KEYS], `${lang}.${key}`).toBe(catalog[KEYS[key as keyof typeof KEYS]])
    }
  })

  it('every maintained language has every text (more-languages D6)', () => {
    const text = workerText()
    for (const { code } of MAINTAINED) expect(Object.keys(text[code] ?? {}).sort(), code).toEqual(Object.keys(KEYS).sort())
  })

  it('a language with an empty entry shows English (more-languages D4)', () => {
    const self = worker(source.replace('const OWN_TEXT = {', 'const OWN_TEXT = {\n    sv: {},'))
    const of = self.__opentodoTextOf as (prefs: { language: string }) => Texts
    expect(of({ language: 'sv' })).toEqual(KEYS)
  })

  it('a pushed reminder is German when the synced language is German', async () => {
    const year = new Date().getFullYear()
    const taskId = await createTask({ title: 'Miete zahlen', due: { date: `${year}-11-03`, time: '15:00' } })
    const reminderId = await addReminder(taskId, { kind: 'absolute', fire_at: Date.now() - 1000 })
    await setUserPref('language', 'de')
    await setUserPref('time_format', '24h')
    db.close()
    await db.open()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: Date.now() - 1000 }))
    expect(sw.shown[0].options.body).toBe('Fällig 3. Nov., 15:00')
    expect((sw.shown[0].options.actions as { title: string }[]).map((a) => a.title)).toEqual(['Erledigt', '10 Min. später', 'Verwerfen'])
  })

  it('without a preferences row the texts stay English', async () => {
    const { taskId, reminderId, now } = await setup()
    const sw = loadWorker()
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(String(sw.shown[0].options.body)).toMatch(/^Due /)
    expect((sw.shown[0].options.actions as { title: string }[]).map((a) => a.title)).toEqual(['Done', 'Snooze 10 min', 'Dismiss'])
  })
})

describe('focus session notifications (focus-mode D12)', () => {
  it('a click on a notification with an address brings an open window there', async () => {
    const scope = loadWorker()
    const navigated: string[] = []
    // loadWorker's stub windows cannot navigate: load the worker again over one that can.
    const win = { navigate: async (url: string) => { navigated.push(url) }, focus: async () => undefined, postMessage: () => undefined }
    const self = { clients: { matchAll: async () => [win], openWindow: async (url: string) => scope.opened.push(url) } }
    const code = source.replace("const DB_NAME = 'opentodo'", `const DB_NAME = ${JSON.stringify(db.name)}`)
    const listeners: Record<string, (ev: unknown) => void> = {}
    new Function('self', 'fetch', 'indexedDB', code)({ ...self, crypto: globalThis.crypto, registration: {}, addEventListener: (type: string, fn: (ev: unknown) => void) => (listeners[type] = fn) }, undefined, globalThis.indexedDB)
    await dispatch({ ...scope, listeners }, 'notificationclick', { notification: { data: { url: '/focus' }, close: () => undefined }, action: '' })
    expect(navigated).toEqual(['/focus'])
    expect(scope.opened).toEqual([])
  })

  it('opens the address when no window is open, and reminder clicks behave as before', async () => {
    const scope = loadWorker()
    await dispatch(scope, 'notificationclick', { notification: { data: { url: '/focus' }, close: () => undefined }, action: '' })
    expect(scope.opened).toEqual(['/focus'])
    const again = loadWorker()
    await dispatch(again, 'notificationclick', { notification: { data: { reminderId: 'r1', taskId: 't1', fireAt: 1 }, close: () => undefined }, action: '' })
    expect(again.opened).toEqual(['/?task=t1'])
  })
})

describe('app icon badge (app-icon-badge)', () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  it('a reminder push with the app closed sets the badge to today\'s stored count', async () => {
    const { taskId, reminderId, now } = await setup()
    await setMeta('badge:today', { dayStart: 0, counts: { [day(-1)]: 9, [day(0)]: 3, [day(1)]: 4 } })
    const badge: (number | 'clear')[] = []
    const sw = loadWorker({ badge })
    await dispatch(sw, 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(badge).toEqual([3])
    expect(sw.shown).toHaveLength(1)
  })

  it('a zero count clears it; no stored counts or no count for today leave it alone', async () => {
    const { taskId, reminderId, now } = await setup()
    const badge: (number | 'clear')[] = []
    await dispatch(loadWorker({ badge }), 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(badge).toEqual([])
    await setMeta('badge:today', { dayStart: 0, counts: { [day(5)]: 2 } })
    await dispatch(loadWorker({ badge }), 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(badge).toEqual([])
    await setMeta('badge:today', { dayStart: 0, counts: { [day(0)]: 0 } })
    await dispatch(loadWorker({ badge }), 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(badge).toEqual(['clear'])
  })

  it('with the app in front the worker leaves the badge to the app', async () => {
    const { taskId, reminderId, now } = await setup()
    await setMeta('badge:today', { dayStart: 0, counts: { [day(0)]: 3 } })
    const badge: (number | 'clear')[] = []
    await dispatch(loadWorker({ badge, windows: [{ focused: true }] }), 'push', pushEvent({ type: 'reminder', reminderId, taskId, fireAt: now - 1000 }))
    expect(badge).toEqual([])
  })

  it('finds the same logical day as the app, day start included (day-boundary)', () => {
    const self: { addEventListener: () => void; __opentodoBadgeDay?: (now: number, dayStart: number) => string } = { addEventListener: () => undefined }
    new Function('self', 'fetch', 'indexedDB', source)(self, undefined, undefined)
    const badgeDay = self.__opentodoBadgeDay!
    for (const [h, m] of [[0, 30], [3, 59], [4, 0], [12, 0], [23, 59]]) {
      const at = new Date(2026, 10, 1, h, m).getTime()
      for (const start of [0, 240, 360]) expect(badgeDay(at, start)).toBe(logicalDay(at, start))
    }
  })
})
