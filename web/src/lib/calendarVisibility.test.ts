// Calendars hidden per workspace (OpenSpec change calendars-per-workspace, task 1.2,
// 2.1): reading the stored hide-list, the pruned value a write stores, and free time
// still counting a hidden calendar as busy.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSnapshot } from './assistantDevice/data'
import { findFreeTime } from './assistantDevice/readFreeTime'
import { calendarsHiddenValue, hiddenIn, readCalendarsHidden, setCalendarHidden } from './calendarVisibility'
import { db, setMeta, useDatabase } from './db'
import { resetDeviceId } from './ops'
import { USER_PREFS_ID } from './userPrefs'

let n = 0
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  useDatabase(`calendar-visibility-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('readCalendarsHidden', () => {
  it('reads an object of string arrays and nothing else', () => {
    expect(readCalendarsHidden({ calendars_hidden: JSON.stringify({ ws1: ['a', 'b'], ws2: ['c', 3] }) })).toEqual({ ws1: ['a', 'b'], ws2: ['c'] })
    for (const v of ['', 'not json', '[]', '"a"', 'null', '{"ws1":"a"}']) {
      expect(hiddenIn(readCalendarsHidden({ calendars_hidden: v }), 'ws1').size).toBe(0)
    }
    expect(readCalendarsHidden(null)).toEqual({})
  })

  it('is per workspace: another workspace or an unnamed calendar shows', () => {
    const hidden = readCalendarsHidden({ calendars_hidden: JSON.stringify({ personal: ['work'] }) })
    expect(hiddenIn(hidden, 'personal').has('work')).toBe(true)
    expect(hiddenIn(hidden, 'personal').has('holidays')).toBe(false)
    expect(hiddenIn(hidden, 'work').size).toBe(0)
  })
})

describe('calendarsHiddenValue', () => {
  it('prunes only the changed workspace, sorts, and stores "" for nothing', () => {
    const value = calendarsHiddenValue({ personal: ['work', 'gone', 'family', 'work'], other: ['unseen-cal'] }, 'personal', ['work', 'family'])
    expect(value).toBe(JSON.stringify({ other: ['unseen-cal'], personal: ['family', 'work'] }))
    expect(calendarsHiddenValue({ personal: ['gone'] }, 'personal', ['work'])).toBe('')
  })
})

describe('setCalendarHidden', () => {
  it('writes one op, pruning the current workspace only, and showing again clears it', async () => {
    const at = { workspace: 'personal', calendars: ['work', 'family'] }
    await setCalendarHidden({ calendars_hidden: JSON.stringify({ personal: ['gone'] }) }, at, 'work', true)
    const row = await db.userPrefs.get(USER_PREFS_ID)
    expect(row?.calendars_hidden).toBe(JSON.stringify({ personal: ['work'] }))
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'calendars_hidden')
    expect(ops).toHaveLength(1)
    await setCalendarHidden(row, at, 'work', false)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.calendars_hidden).toBe('')
  })

  it("keeps another workspace's hides that this device has not seen", async () => {
    // The laptop knows a workspace and a calendar this device has not synced yet.
    const stored = { calendars_hidden: JSON.stringify({ 'ws-new': ['cal-new'], personal: ['work'] }) }
    await setCalendarHidden(stored, { workspace: 'personal', calendars: ['work', 'family'] }, 'family', true)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.calendars_hidden).toBe(JSON.stringify({ personal: ['family', 'work'], 'ws-new': ['cal-new'] }))
  })

  it('writes nothing before the workspace is known', async () => {
    await setCalendarHidden(null, { workspace: '', calendars: ['work'] }, 'work', true)
    expect(await db.userPrefs.get(USER_PREFS_ID)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('free time', () => {
  it('still counts a calendar hidden in the workspace as busy', async () => {
    await db.calendarSubscriptions.put({ id: 'work', name: 'Work', color: '#2563eb', enabled: true, lastSuccessAt: Date.now() })
    await db.calendarEvents.put({ id: 'ev1', subscriptionId: 'work', uid: 'u1', summary: 'Standup', location: '', start: { date: '2026-10-14', time: '10:00' }, end: { date: '2026-10-14', time: '11:00' }, allDay: false, free: false })
    await setMeta('calendar.grid', { startHour: 9, endHour: 12, dayLength: 180 })
    await setCalendarHidden(null, { workspace: 'personal', calendars: ['work'] }, 'work', true)
    const out = await findFreeTime(await loadSnapshot(), { from: '2026-10-14', timezone: 'UTC' }, Date.UTC(2026, 9, 13, 12))
    expect(out.days[0].free).toEqual([{ start: '09:00', end: '10:00', minutes: 60 }, { start: '11:00', end: '12:00', minutes: 60 }])
  })
})
