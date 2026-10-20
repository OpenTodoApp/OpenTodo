import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { DAY_STARTS, readDayStart, readLanguage, readUserPrefs, setUserPref } from './userPrefs'

let n = 0
beforeEach(() => {
  useDatabase(`userprefs-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('user_prefs (date-time-preferences D1)', () => {
  it('a missing row and unknown values read as system, without rewriting the row', async () => {
    expect(readUserPrefs(undefined)).toEqual({ date_format: 'system', time_format: 'system', week_start: 'system' })
    await applyOps([{ id: 'r1', entity: 'user_prefs', entityId: 'me', field: 'date_format', value: 'dd.mm.yyyy-future', ts: 10, device: 'newer' }])
    const row = await db.userPrefs.get('me')
    expect(row?.date_format).toBe('dd.mm.yyyy-future')
    expect(readUserPrefs(row).date_format).toBe('system')
  })

  it('applies a remote op and reads it back', async () => {
    await applyOps([
      { id: 'r1', entity: 'user_prefs', entityId: 'me', field: 'time_format', value: '24h', ts: 10, device: 'laptop' },
      { id: 'r2', entity: 'user_prefs', entityId: 'me', field: 'week_start', value: 'sun', ts: 11, device: 'laptop' },
    ])
    expect(readUserPrefs(await db.userPrefs.get('me'))).toEqual({ date_format: 'system', time_format: '24h', week_start: 'sun' })
  })

  it('a local change applies at once and waits in the outbox for the next sync', async () => {
    await setUserPref('date_format', 'iso')
    expect(readUserPrefs(await db.userPrefs.get('me')).date_format).toBe('iso')
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'user_prefs', entityId: 'me', field: 'date_format', value: 'iso' }])
  })

  it('a later remote write wins by last-writer-wins', async () => {
    await setUserPref('date_format', 'day-month')
    const clock = (await db.userPrefs.get('me'))!._clock.date_format
    await applyOps([{ id: 'x', entity: 'user_prefs', entityId: 'me', field: 'date_format', value: 'month-day', ts: clock.ts + 1, device: 'phone' }])
    expect((await db.userPrefs.get('me'))?.date_format).toBe('month-day')
    await applyOps([{ id: 'y', entity: 'user_prefs', entityId: 'me', field: 'date_format', value: 'iso', ts: clock.ts - 1, device: 'old' }])
    expect((await db.userPrefs.get('me'))?.date_format).toBe('month-day')
  })
})

describe('language (app-localization D1)', () => {
  it('a shipped code reads back; a missing row or an unknown code reads as system and the row keeps it', async () => {
    expect(readLanguage(undefined)).toBe('system')
    await applyOps([{ id: 'l1', entity: 'user_prefs', entityId: 'me', field: 'language', value: 'de', ts: 10, device: 'laptop' }])
    expect(readLanguage(await db.userPrefs.get('me'))).toBe('de')
    await applyOps([{ id: 'l2', entity: 'user_prefs', entityId: 'me', field: 'language', value: 'ja', ts: 11, device: 'newer' }])
    const row = await db.userPrefs.get('me')
    expect(row?.language).toBe('ja')
    expect(readLanguage(row)).toBe('system')
  })

  it('a change made offline applies at once and waits in the outbox', async () => {
    await setUserPref('language', 'it')
    expect(readLanguage(await db.userPrefs.get('me'))).toBe('it')
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'user_prefs', entityId: 'me', field: 'language', value: 'it' }])
  })
})

describe('day start (day-boundary D1)', () => {
  it('reads HH:MM up to 06:00 as minutes; anything else as midnight', () => {
    const cases: [unknown, number][] = [
      [undefined, 0], ['', 0], ['00:00', 0], ['04:00', 240], ['03:30', 210], ['06:00', 360],
      ['06:01', 0], ['09:00', 0], ['4am', 0], ['4:00', 0], ['03:60', 0], [240, 0],
    ]
    for (const [value, minutes] of cases) expect(readDayStart(value === undefined ? undefined : { day_start: value as string })).toBe(minutes)
    expect(readDayStart(null)).toBe(0)
    expect(DAY_STARTS).toEqual(['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'])
  })

  it('a change goes through the op log; an out-of-range value from elsewhere is kept as stored', async () => {
    await setUserPref('day_start', '04:00')
    expect(readDayStart(await db.userPrefs.get('me'))).toBe(240)
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs').map((o) => [o.field, o.value])).toEqual([['day_start', '04:00']])
    await applyOps([{ id: 'r9', entity: 'user_prefs', entityId: 'me', field: 'day_start', value: '09:00', ts: Date.now() + 60_000, device: 'newer' }])
    const row = await db.userPrefs.get('me')
    expect(row?.day_start).toBe('09:00')
    expect(readDayStart(row)).toBe(0)
  })
})
