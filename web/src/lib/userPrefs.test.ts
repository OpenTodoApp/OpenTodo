import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { readUserPrefs, setUserPref } from './userPrefs'

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
