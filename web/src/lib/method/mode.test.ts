import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../db'
import { applyOps, resetDeviceId } from '../ops'
import { readMethodMode, setMethodMode } from './mode'

let n = 0
beforeEach(() => {
  useDatabase(`method-mode-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('How you work (open-loops "How you work preference")', () => {
  it('an existing account reads lists and nothing is written', async () => {
    expect(readMethodMode(undefined)).toBe('lists')
    expect(readMethodMode(await db.userPrefs.get('me'))).toBe('lists')
    expect(await db.outbox.count()).toBe(0)
  })

  it('an unknown value from a newer client reads as lists and is kept', async () => {
    await applyOps([{ id: 'r1', entity: 'user_prefs', entityId: 'me', field: 'method', value: 'coach', ts: 10, device: 'newer' }])
    const row = await db.userPrefs.get('me')
    expect(row?.method).toBe('coach')
    expect(readMethodMode(row)).toBe('lists')
    expect(await db.outbox.count()).toBe(0)
  })

  it('a choice applies at once and waits in the outbox', async () => {
    await setMethodMode('first')
    expect(readMethodMode(await db.userPrefs.get('me'))).toBe('first')
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'user_prefs', entityId: 'me', field: 'method', value: 'first' }])
  })

  it('concurrent choices converge on the later write', async () => {
    await setMethodMode('companion')
    const clock = (await db.userPrefs.get('me'))!._clock.method
    await applyOps([{ id: 'b', entity: 'user_prefs', entityId: 'me', field: 'method', value: 'first', ts: clock.ts + 1, device: 'B' }])
    expect(readMethodMode(await db.userPrefs.get('me'))).toBe('first')
    await applyOps([{ id: 'c', entity: 'user_prefs', entityId: 'me', field: 'method', value: 'lists', ts: clock.ts - 1, device: 'C' }])
    expect(readMethodMode(await db.userPrefs.get('me'))).toBe('first')
  })
})
