// A long pull (a first sync, a long catch-up) at 10,000 tasks (OpenSpec change
// performance-10k, design D6): the activity it records is written once at its
// end, each project keeping its newest entries, and the screen's shared live
// data is read every few seconds instead of after every page.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetActivity, LONG_PULL_OPS, markLongPull, withDeferredActivity } from './activity'
import { db, useDatabase } from './db'
import { holdLiveSnapshots, HELD_REFRESH_MS, liveSnapshot } from './liveSnapshot'
import { applyOps, createProject, resetDeviceId } from './ops'
import type { Op } from './types'
import { waitFor } from '../ui/test-utils'

let n = 0
beforeEach(() => {
  useDatabase(`long-pull-${Date.now()}-${n++}`)
  resetDeviceId()
})

const ops = (count: number, from = 0, project = 'p1'): Op[] => Array.from({ length: count }, (_, k) => {
  const i = from + k
  return [
    { id: `t${i}-title`, entity: 'task', entityId: `t${i}`, field: 'title', value: `Task ${i}`, ts: 1_000 + i * 2, device: 'remote' },
    { id: `t${i}-project`, entity: 'task', entityId: `t${i}`, field: 'project_id', value: project, ts: 1_001 + i * 2, device: 'remote' },
  ] as Op[]
}).flat()

describe('activity during a sync exchange', () => {
  it('is written when the exchange ends', async () => {
    await withDeferredActivity(async () => {
      await applyOps(ops(10))
      expect(await db.activity.count()).toBe(0)
    })
    expect(await db.activity.count()).toBe(20)
  })

  it('a long pull keeps each project\'s newest entries', async () => {
    await withDeferredActivity(async () => {
      markLongPull()
      for (let page = 0; page < 5; page++) await applyOps(ops(100, page * 100))
    })
    const kept = await db.activity.toArray()
    expect(kept).toHaveLength(LONG_PULL_OPS)
    // The newest: the last tasks of the last page.
    expect(kept.some((e) => e.entityId === 't499')).toBe(true)
    expect(kept.some((e) => e.entityId === 't0')).toBe(false)
    // The rows themselves are all there.
    expect(await db.tasks.count()).toBe(500)
  })

  it('a refused op recorded meanwhile is never written', async () => {
    await withDeferredActivity(async () => {
      await applyOps(ops(2))
      await forgetActivity(['t0-title'])
    })
    expect((await db.activity.toArray()).map((e) => e.id).sort()).toEqual(['t0-project', 't1-project', 't1-title'])
  })

  it('nothing is written after a sign-out ended the exchange', async () => {
    await withDeferredActivity(async () => { await applyOps(ops(3)) }, () => false)
    expect(await db.activity.count()).toBe(0)
  })
})

describe('shared live data during a long pull', () => {
  it('is held until released, read again meanwhile, then follows writes again', async () => {
    const names = liveSnapshot('long pull projects', async () => (await db.projects.toArray()).map((p) => p.name).sort())
    const stop = names.subscribe(() => undefined)
    await waitFor(() => names.read() !== undefined, 'the first read')
    const release = holdLiveSnapshots()
    const held = Date.now()
    await createProject({ name: 'During' })
    // The write shows only with the read HELD_REFRESH_MS after the hold.
    await waitFor(() => names.read()?.length === 1, 'the read while held', HELD_REFRESH_MS + 5_000)
    expect(Date.now() - held).toBeGreaterThanOrEqual(HELD_REFRESH_MS - 50)
    await createProject({ name: 'Later' })
    release()
    await waitFor(() => names.read()?.length === 2, 'the release')
    await createProject({ name: 'After' })
    await waitFor(() => names.read()?.length === 3, 'live again')
    stop()
  }, 15_000)
})
