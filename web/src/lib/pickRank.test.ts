import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, db, entityTables, useDatabase } from './db'
import { createTask } from './ops'
import { pickScore, pickScores, rankBy, recordPick } from './pickRank'

let n = 0
beforeEach(() => { useDatabase(`pick-${Date.now()}-${n++}`) })

describe('pickRank', () => {
  it('ranks a recent pick first, then frequent ones, then natural order', async () => {
    const now = 1_760_000_000_000
    for (let i = 0; i < 3; i++) await recordPick('label', 'home', now - 30 * 86_400_000)
    await recordPick('label', 'errands', now)
    const order = rankBy(['alpha', 'errands', 'home', 'zulu'], (k) => k, await pickScores('label', now))
    expect(order).toEqual(['errands', 'home', 'alpha', 'zulu'])
  })

  it('halves the weight every 14 days', () => {
    expect(pickScore(4, 0, 14 * 86_400_000)).toBeCloseTo(2)
    expect(pickScore(4, 0, 28 * 86_400_000)).toBeCloseTo(1)
  })

  it('keeps contexts apart and at most 200 rows per context', async () => {
    for (let i = 0; i < 205; i++) await recordPick('assignee:p1', `u${i}`, 1_000 + i)
    await recordPick('label', 'x', 1)
    expect(await db.pickHistory.where('context').equals('assignee:p1').count()).toBe(200)
    expect((await pickScores('label')).has('x')).toBe(true)
  })

  it('is device-local: not an entity table, never in the outbox, cleared on sign-out', async () => {
    expect(entityTables().map((t) => t.name)).not.toContain('pickHistory')
    await createTask({ title: 'x' })
    const before = await db.outbox.count()
    await recordPick('label', 'errands')
    expect(await db.outbox.count()).toBe(before)
    await clearLocalData()
    expect(await db.pickHistory.count()).toBe(0)
  })
})
