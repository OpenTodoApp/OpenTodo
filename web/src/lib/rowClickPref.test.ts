// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { readRowClick, rowClickMode, setRowClick, setServerRowClick } from './rowClickPref'

let n = 0
beforeEach(() => {
  useDatabase(`rowclick-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
})

describe('Click a task to (click-default)', () => {
  it('follows the server default until the account chooses', () => {
    expect(rowClickMode(null)).toBe('select')
    setServerRowClick('open')
    expect(rowClickMode(null)).toBe('open')
    expect(rowClickMode({ row_click: '' })).toBe('open')
    // An unknown value from a newer client follows the server and is kept.
    expect(readRowClick({ row_click: 'expand' })).toBe('')
    expect(rowClickMode({ row_click: 'expand' })).toBe('open')
    // An older server reports nothing: select, then edit the title.
    setServerRowClick(undefined)
    expect(rowClickMode(null)).toBe('select')
  })

  it('the account choice wins over the server default', () => {
    setServerRowClick('open')
    expect(rowClickMode({ row_click: 'select' })).toBe('select')
    setServerRowClick('select')
    expect(rowClickMode({ row_click: 'open' })).toBe('open')
  })

  it('mirrors the server default on the device for the next start', () => {
    setServerRowClick('open')
    expect(localStorage.getItem('opentodo.rowClickDefault')).toBe('open')
    setServerRowClick('select')
    expect(localStorage.getItem('opentodo.rowClickDefault')).toBeNull()
  })

  it('the choice is one synced op, and a later remote write wins', async () => {
    await setRowClick('open')
    expect(readRowClick(await db.userPrefs.get('me'))).toBe('open')
    const queued = (await db.outbox.toArray()).map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value }))
    expect(queued).toEqual([{ entity: 'user_prefs', entityId: 'me', field: 'row_click', value: 'open' }])
    const clock = (await db.userPrefs.get('me'))!._clock.row_click
    await applyOps([{ id: 'x', entity: 'user_prefs', entityId: 'me', field: 'row_click', value: '', ts: clock.ts + 1, device: 'phone' }])
    expect(readRowClick(await db.userPrefs.get('me'))).toBe('')
  })
})
