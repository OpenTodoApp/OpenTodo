import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeApiError, updateCalendarEvent, deleteCalendarEvent, calendarEvents } = vi.hoisted(() => {
  class FakeApiError extends Error {
    serverMessage: string
    constructor(public status: number, public code: string, message: string) {
      super(message)
      this.serverMessage = message
    }
  }
  return { FakeApiError, updateCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), calendarEvents: vi.fn() }
})
vi.mock('./api', () => ({
  ApiError: FakeApiError,
  isNetworkError: (e: unknown) => e instanceof TypeError,
  api: {
    updateCalendarEvent: (...a: unknown[]) => updateCalendarEvent(...a),
    deleteCalendarEvent: (...a: unknown[]) => deleteCalendarEvent(...a),
    calendarEvents: (...a: unknown[]) => calendarEvents(...a),
    calendarFeedsSwitch: { get: async () => ({ enabled: false }) },
    calendarSyncSwitch: { get: async () => ({ enabled: true }) },
  },
}))

import { cancelEventDelete, discardEventEdit, editEvent, flushEventEdits, onEventNotice, retryEventEdit } from './calendarEventEdits'
import { applyQueued, refreshEvents } from './calendarFeeds'
import { clearLocalData, db, setMeta, useDatabase } from './db'
import type { CalendarEvent } from './types'

const ev: CalendarEvent = {
  id: 'e1', subscriptionId: 's1', uid: 'u1', summary: 'Standup', location: '', allDay: false, free: false, rev: 'r1',
  start: { date: '2026-11-12', time: '09:00', tz: 'Europe/Berlin' }, end: { date: '2026-11-12', time: '09:30', tz: 'Europe/Berlin' },
  access: { update: true, delete: true },
}
const at = (time: string, end: string) => ({ start: { date: '2026-11-12', time, tz: 'Europe/Berlin' }, end: { date: '2026-11-12', time: end, tz: 'Europe/Berlin' }, allDay: false })
const notices: string[] = []
let online = true

let n = 0
beforeEach(async () => {
  useDatabase(`event-edits-${Date.now()}-${n++}`)
  vi.clearAllMocks()
  notices.length = 0
  onEventNotice((t) => notices.push(t))
  online = false // edits wait until a test goes online
  vi.stubGlobal('navigator', { get onLine() { return online } })
  await db.calendarSubscriptions.put({ id: 's1', name: 'Work', color: '', enabled: true, lastSuccessAt: 1, managed: true, connectionId: 'c1', calendarUrl: 'https://x/cal/', editEvents: true })
  await db.calendarEvents.put(ev)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('event outbox (calendar-event-edits 4.4)', () => {
  it('applies an edit at once and coalesces edits made offline into one command', async () => {
    await editEvent(ev, at('10:00', '10:30'))
    await editEvent(ev, at('10:15', '10:45'))
    await editEvent(ev, { summary: 'Planning' })
    expect((await db.calendarEvents.get('e1'))!.start.time).toBe('10:15')
    const cmds = await db.eventOutbox.toArray()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].patch).toEqual({ ...at('10:15', '10:45'), summary: 'Planning' })
    expect(cmds[0].rev).toBe('r1')
    expect(cmds[0].base.start.time).toBe('09:00')
    expect(updateCalendarEvent).not.toHaveBeenCalled()
    // Back online: one request with the final time and title.
    online = true
    updateCalendarEvent.mockResolvedValue({ event: { ...ev, id: 'e2', rev: 'r2', summary: 'Planning', ...at('10:15', '10:45') }, replaces: 'e1' })
    await flushEventEdits()
    expect(updateCalendarEvent).toHaveBeenCalledTimes(1)
    expect(updateCalendarEvent).toHaveBeenCalledWith('c1', 'e1', { ...at('10:15', '10:45'), summary: 'Planning', rev: 'r1' })
    expect(await db.calendarEvents.get('e1')).toBeUndefined()
    expect((await db.calendarEvents.get('e2'))!.rev).toBe('r2')
    expect(await db.eventOutbox.count()).toBe(0)
  })

  it('removes the command when an event is moved back before it is sent', async () => {
    await editEvent(ev, at('10:00', '10:30'))
    await editEvent(ev, at('09:00', '09:30'))
    expect(await db.eventOutbox.count()).toBe(0)
  })

  it('returns the inverse change for Undo', async () => {
    const inverse = await editEvent(ev, at('10:00', '10:30'))
    expect(inverse).toEqual({ start: ev.start, end: ev.end, allDay: false })
  })

  it('a delete replaces queued edits, waits 8 seconds and Undo cancels it', async () => {
    await editEvent(ev, at('10:00', '10:30'))
    await editEvent(ev, { delete: true }, 1_000)
    const cmd = (await db.eventOutbox.toArray())[0]
    expect(cmd.patch).toEqual({ delete: true })
    expect(cmd.notBefore).toBe(9_000)
    expect(await db.calendarEvents.get('e1')).toBeUndefined()
    expect(await cancelEventDelete(ev)).toBe(true)
    expect(await db.eventOutbox.count()).toBe(0)
    expect((await db.calendarEvents.get('e1'))!.start.time).toBe('09:00')
  })

  it('a refusal restores the event, drops the command and says why', async () => {
    online = true
    updateCalendarEvent.mockRejectedValue(new FakeApiError(409, 'event_changed', 'the event changed'))
    calendarEvents.mockResolvedValue({ events: [ev], subscriptions: [] })
    await editEvent(ev, at('10:00', '10:30'))
    await flushEventEdits()
    expect(await db.eventOutbox.count()).toBe(0)
    expect((await db.calendarEvents.get('e1'))!.start.time).toBe('09:00')
    expect(notices[0]).toContain('changed in your calendar')
  })

  it('a refused edit after editing was turned off says so', async () => {
    online = true
    updateCalendarEvent.mockRejectedValue(new FakeApiError(403, 'event_edits_off', 'editing events is off'))
    await editEvent(ev, { summary: 'x' })
    await flushEventEdits()
    expect(notices[0]).toBe('Editing events is off for this connection')
  })

  it('a failure while online is not retried alone: Retry sends it, Discard restores', async () => {
    online = true
    updateCalendarEvent.mockRejectedValueOnce(new FakeApiError(502, 'calendar_unreachable', 'timeout'))
    await editEvent(ev, { summary: 'Planning' })
    await flushEventEdits()
    let cmd = (await db.eventOutbox.toArray())[0]
    expect(cmd.failed).toBe('calendar_unreachable')
    await flushEventEdits()
    expect(updateCalendarEvent).toHaveBeenCalledTimes(1)
    updateCalendarEvent.mockResolvedValueOnce({ event: { ...ev, id: 'e2', rev: 'r2', summary: 'Planning' }, replaces: 'e1' })
    await retryEventEdit(cmd.key)
    expect(updateCalendarEvent).toHaveBeenCalledTimes(2)
    expect(await db.eventOutbox.count()).toBe(0)
    // Discard: a second failure, then the event as it was.
    updateCalendarEvent.mockRejectedValueOnce(new FakeApiError(500, 'internal', 'boom'))
    const e2 = (await db.calendarEvents.get('e2'))!
    await editEvent(e2, { summary: 'Other' })
    await flushEventEdits()
    cmd = (await db.eventOutbox.toArray())[0]
    await discardEventEdit(cmd.key)
    expect((await db.calendarEvents.get('e2'))!.summary).toBe('Planning')
  })

  it('an edit made while one is in flight goes out after it, against the new id', async () => {
    online = true
    let answer: (v: unknown) => void = () => {}
    updateCalendarEvent.mockImplementationOnce(() => new Promise((r) => { answer = r }))
    await editEvent(ev, at('10:00', '10:30'))
    await vi.waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledTimes(1))
    await editEvent(ev, { summary: 'Planning' })
    updateCalendarEvent.mockResolvedValueOnce({ event: { ...ev, id: 'e3', rev: 'r3', summary: 'Planning', ...at('10:00', '10:30') }, replaces: 'e2' })
    answer({ event: { ...ev, id: 'e2', rev: 'r2', ...at('10:00', '10:30') }, replaces: 'e1' })
    await vi.waitFor(() => expect(updateCalendarEvent).toHaveBeenCalledTimes(2))
    expect(updateCalendarEvent.mock.calls[1]).toEqual(['c1', 'e2', { summary: 'Planning', rev: 'r2' }])
    await flushEventEdits()
    await vi.waitFor(async () => expect((await db.calendarEvents.get('e3'))?.summary).toBe('Planning'))
  })

  it('a refresh keeps a queued edit drawn and hides a queued delete', async () => {
    await editEvent(ev, at('10:00', '10:30'))
    const fetched = new Map([['e1', ev], ['e9', { ...ev, id: 'e9' }]])
    applyQueued(fetched, await db.eventOutbox.toArray())
    expect(fetched.get('e1')!.start.time).toBe('10:00')
    await editEvent({ ...ev, id: 'e9' }, { delete: true }).catch(() => {})
    await db.calendarEvents.put({ ...ev, id: 'e9' })
    await editEvent({ ...ev, id: 'e9' }, { delete: true })
    const again = new Map([['e9', { ...ev, id: 'e9' }]])
    applyQueued(again, await db.eventOutbox.toArray())
    expect(again.has('e9')).toBe(false)
  })

  it('refreshEvents draws the queued edit over the server answer', async () => {
    await setMeta('calendar.events.window', { from: '2026-11-01', to: '2026-11-30', fetchedAt: 1 })
    calendarEvents.mockResolvedValue({ events: [ev], subscriptions: [{ id: 's1', name: 'Work', color: '', enabled: true, lastSuccessAt: 1, managed: true, connectionId: 'c1' }] })
    await editEvent(ev, at('11:00', '11:30'))
    expect(await refreshEvents()).toBe(true)
    expect((await db.calendarEvents.get('e1'))!.start.time).toBe('11:00')
  })

  it('two devices: the second one gets event_changed and shows the first one\'s time', async () => {
    online = true
    const first = { ...ev, id: 'e5', rev: 'r5', ...at('12:00', '12:30') }
    updateCalendarEvent.mockRejectedValue(new FakeApiError(409, 'event_changed', 'changed'))
    calendarEvents.mockResolvedValue({ events: [first], subscriptions: [{ id: 's1', name: 'Work', color: '', enabled: true, lastSuccessAt: 1, managed: true, connectionId: 'c1' }] })
    await setMeta('calendar.events.window', { from: '2026-11-01', to: '2026-11-30', fetchedAt: 1 })
    await editEvent(ev, at('10:00', '10:30'))
    await flushEventEdits()
    await vi.waitFor(async () => expect((await db.calendarEvents.get('e5'))?.start.time).toBe('12:00'))
  })

  it('a v32 database upgrades to v33 and keeps its events (4.2)', async () => {
    const name = `v32-${Math.random()}`
    const old = new Dexie(name)
    old.version(32).stores({ calendarEvents: 'id, subscriptionId, start.date', calendarSubscriptions: 'id', habitTallies: 'id, series_id' })
    await old.open()
    await old.table('calendarEvents').put(ev)
    old.close()
    const d = useDatabase(name)
    await d.open()
    expect(d.verno).toBe(33)
    expect(await d.calendarEvents.get('e1')).toMatchObject({ summary: 'Standup' })
    expect(await d.eventOutbox.count()).toBe(0)
    await d.delete()
  })

  it('sign-out deletes the queue', async () => {
    await editEvent(ev, { summary: 'x' })
    await clearLocalData()
    expect(await db.eventOutbox.count()).toBe(0)
  })

  it('refuses an event without a connection or a rev', async () => {
    await expect(editEvent({ ...ev, id: 'e7', subscriptionId: 'feed' }, { summary: 'x' })).rejects.toThrow()
  })
})
