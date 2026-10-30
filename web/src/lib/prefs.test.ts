import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from './db'
import { flushSeen, markSeen } from './feed'
import { applyOps, resetDeviceId } from './ops'
import { removeLocally } from './trash'
import { readAddPosition, setAddPosition, USER_PREFS_ID } from './userPrefs'

let n = 0
beforeEach(() => {
  useDatabase(`prefs-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('project_prefs seen marker', () => {
  it('never decreases', async () => {
    markSeen('p', 2000)
    await flushSeen()
    expect((await db.prefs.get('p'))?.feed_seen_at).toBe(2000)
    markSeen('p', 1000)
    await flushSeen()
    expect((await db.prefs.get('p'))?.feed_seen_at).toBe(2000)
    // A larger mark still moves it; marks within one open collapse to the largest.
    markSeen('p', 3000)
    markSeen('p', 2500)
    await flushSeen()
    expect((await db.prefs.get('p'))?.feed_seen_at).toBe(3000)
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'project_prefs')
    expect(queued.map((o) => o.value)).toEqual([2000, 3000])
  })

  it('syncs via outbox', async () => {
    markSeen('p1', 5000)
    markSeen('p2', 7000)
    await flushSeen()
    const queued = await db.outbox.toArray()
    expect(queued.map(({ entity, entityId, field, value }) => ({ entity, entityId, field, value })).sort((a, b) => a.entityId.localeCompare(b.entityId))).toEqual([
      { entity: 'project_prefs', entityId: 'p1', field: 'feed_seen_at', value: 5000 },
      { entity: 'project_prefs', entityId: 'p2', field: 'feed_seen_at', value: 7000 },
    ])
    // Another device's later mark arrives by sync and wins by LWW.
    const clock = (await db.prefs.get('p1'))!._clock.feed_seen_at
    await applyOps([{ id: 'x', entity: 'project_prefs', entityId: 'p1', field: 'feed_seen_at', value: 9000, ts: clock.ts + 1, device: 'other' }])
    expect((await db.prefs.get('p1'))?.feed_seen_at).toBe(9000)
    // The stored value is what markSeen compares with: an older mark writes nothing.
    markSeen('p1', 8000)
    await flushSeen()
    expect(await db.outbox.count()).toBe(2)
  })

  it('repeated marks do not postpone the write', async () => {
    // A view re-rendering every 100 ms keeps calling markSeen; the first mark's timer still fires.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (let i = 1; i <= 8; i++) {
      markSeen('p', 1000 + i)
      await vi.advanceTimersByTimeAsync(100)
    }
    vi.useRealTimers()
    await flushSeen()
    const values = (await db.outbox.toArray()).map((o) => o.value as number)
    expect(values.length).toBeGreaterThanOrEqual(2)
    expect(values[0]).toBeLessThan(1008)
    expect((await db.prefs.get('p'))?.feed_seen_at).toBe(1008)
  })

  it('goes with a purged project', async () => {
    markSeen('p', 5000)
    await flushSeen()
    await db.projects.put({ id: 'p', name: 'Home', color: '#000', position: 0, archived: false, parent_id: null, created_at: 1, deleted_at: 2, _clock: {} })
    await removeLocally([{ entity: 'project', entityId: 'p' }, { entity: 'project_prefs', entityId: 'p' }])
    expect(await db.prefs.get('p')).toBeUndefined()
    expect(await db.projects.get('p')).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('add position preference (add-position 1.2)', () => {
  it('reads empty or unknown as bottom without rewriting the row', () => {
    expect(readAddPosition(null)).toBe('bottom')
    expect(readAddPosition({ add_position: '' })).toBe('bottom')
    expect(readAddPosition({ add_position: 'middle' })).toBe('bottom')
    expect(readAddPosition({ add_position: 'bottom' })).toBe('bottom')
    expect(readAddPosition({ add_position: 'top' })).toBe('top')
  })

  it('writes one op on the synced row', async () => {
    await setAddPosition('top')
    expect(readAddPosition(await db.userPrefs.get(USER_PREFS_ID))).toBe('top')
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'add_position')
    expect(queued.map((o) => o.value)).toEqual(['top'])
  })
})
