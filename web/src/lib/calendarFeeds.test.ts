import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calendarEvents = vi.fn(async (_from: string, _to: string) => ({
  events: [{ id: 'e1', subscriptionId: 's1', uid: 'u', summary: 'Team sync', location: '', start: { date: '2026-10-19', time: '10:00', tz: 'Europe/Berlin' }, end: { date: '2026-10-19', time: '11:00', tz: 'Europe/Berlin' }, allDay: false, free: false }],
  subscriptions: [{ id: 's1', name: 'Work', color: '#3b82f6', enabled: true, lastSuccessAt: 1 }],
}))
vi.mock('./api', () => ({ api: { calendarEvents: (from: string, to: string) => calendarEvents(from, to) } }))

import { cachedWindow, covers, ensureEventsFor, eventsStatus, fetchRange, refreshEvents, setShowEvents, showEvents } from './calendarFeeds'
import { clearLocalData, db, useDatabase } from './db'

let n = 0
beforeEach(() => {
  useDatabase(`calfeeds-${Date.now()}-${n++}`)
  calendarEvents.mockClear()
})

describe('calendar events cache (5.1, 5.2)', () => {
  const week = { from: '2026-10-19', to: '2026-10-25' }

  it('fetches the range ± 28 days, stores rows and the window, and sign-out empties them', async () => {
    await ensureEventsFor(week)
    expect(calendarEvents).toHaveBeenCalledWith('2026-09-21', '2026-11-22')
    expect(await db.calendarEvents.count()).toBe(1)
    expect(await db.calendarSubscriptions.count()).toBe(1)
    expect(covers(await cachedWindow(), week)).toBe(true)
    await clearLocalData()
    expect(await db.calendarEvents.count()).toBe(0)
    expect(await db.calendarSubscriptions.count()).toBe(0)
  })

  it('makes no request inside a fresh window, refreshes a 10-minute-old one, fetches outside it', async () => {
    await ensureEventsFor(week)
    calendarEvents.mockClear()
    const win = (await cachedWindow())!
    await ensureEventsFor(week, win.fetchedAt + 60_000)
    expect(calendarEvents).not.toHaveBeenCalled()
    await ensureEventsFor(week, win.fetchedAt + 11 * 60_000)
    expect(calendarEvents).toHaveBeenCalledTimes(1)
    await ensureEventsFor({ from: '2027-03-01', to: '2027-03-07' })
    expect(calendarEvents).toHaveBeenLastCalledWith('2027-02-01', '2027-04-04')
  })

  it('keeps the cache when the API fails', async () => {
    await refreshEvents(week)
    calendarEvents.mockRejectedValueOnce(new TypeError('offline'))
    expect(await refreshEvents(week)).toBe(false)
    expect(await db.calendarEvents.count()).toBe(1)
  })

  it('reports the status and keeps the toggle per device', async () => {
    expect(eventsStatus(null, week)).toBe('missing')
    expect(eventsStatus({ from: '2026-10-01', to: '2026-10-31', fetchedAt: 0 }, week, 60_000)).toBe('fresh')
    expect(eventsStatus({ from: '2026-10-01', to: '2026-10-31', fetchedAt: 0 }, week, 11 * 60_000)).toBe('stale')
    expect(fetchRange({ from: '2026-10-01', to: '2026-11-30' })).toEqual({ from: '2026-09-16', to: '2026-12-16' })
    expect(await showEvents()).toBe(true)
    await setShowEvents(false)
    expect(await showEvents()).toBe(false)
  })
})
