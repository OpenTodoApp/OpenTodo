// OpenSpec change plan-objectives, task 3.1: reads by period, mutate() writes
// (offline, through the outbox), the per-period limit, convergence of
// concurrent edits, six after sync, and the review's periods.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import {
  addObjective, canAdd, carryObjective, dropObjective, followingPeriod, isObjectivePeriod, moveObjective, objectivePeriods,
  objectivesIn, openCount, previousPeriod, renameObjective, reviewPlan, setObjectiveDone,
} from './objectives'
import { applyOps } from './ops'
import { objectivesOn } from './objectivePrefs'
import type { Op } from './types'

let n = 0
const op = (device: string, ts: number, entityId: string, field: string, value: unknown): Op =>
  ({ id: `${device}-${n++}`, entity: 'objective', entityId, field, value, ts, device })
const remote = (id: string, title: string, period: string, ts = 1): Op[] => [
  op('R', ts, id, 'title', title), op('R', ts, id, 'period', period), op('R', ts, id, 'position', ts), op('R', ts, id, 'done_at', 0), op('R', ts, id, 'created_at', ts),
]

beforeEach(() => { useDatabase(`objectives-${Date.now()}-${n++}`) })

describe('periods', () => {
  it('accepts quarters and weeks, never months', () => {
    expect([isObjectivePeriod('2026-Q4'), isObjectivePeriod('2026-W44'), isObjectivePeriod('2026-11'), isObjectivePeriod(''), isObjectivePeriod('Q4')])
      .toEqual([true, true, false, false, false])
  })
  it('steps back and forth across years', () => {
    expect(previousPeriod('2027-Q1')).toBe('2026-Q4')
    expect(previousPeriod('2026-W45')).toBe('2026-W44')
    expect(previousPeriod('2027-W01')).toBe('2026-W53')
    expect(followingPeriod('2026-Q4')).toBe('2027-Q1')
  })
  it('names this quarter, this week and next week (Monday weeks)', () => {
    expect(objectivePeriods('2026-10-28', 1)).toEqual({ quarter: '2026-Q4', week: '2026-W44', nextWeek: '2026-W45' })
  })
  it('the switch reads as off unless "on"', () => {
    expect([objectivesOn(null), objectivesOn({ objectives: '' }), objectivesOn({ objectives: 'yes' }), objectivesOn({ objectives: 'on' })]).toEqual([false, false, false, true])
  })
})

describe('the weekly review plans the right week (weekly-review "Objectives in the weekly review")', () => {
  it('Sunday plans next week; Wednesday this week; the toggle flips it', () => {
    const sunday = reviewPlan('2026-11-01', 1, Date.UTC(2026, 9, 25))
    expect(sunday).toMatchObject({ planned: '2026-W45', plansNext: true, previousWeek: '2026-W44', previousQuarter: null })
    expect(reviewPlan('2026-10-28', 1, Date.UTC(2026, 9, 20))).toMatchObject({ planned: '2026-W44', plansNext: false, previousWeek: '2026-W43' })
    expect(reviewPlan('2026-11-01', 1, Date.UTC(2026, 9, 25), true)).toMatchObject({ planned: '2026-W44', plansNext: false })
  })
  it('with Sunday weeks the last three days are Thursday to Saturday', () => {
    // Sunday 2026-11-08 starts the viewer's week of Monday the 9th (2026-W46): it plans that week.
    expect(reviewPlan('2026-11-08', 0, 0)).toMatchObject({ planned: '2026-W46', plansNext: false })
    expect(reviewPlan('2026-11-07', 0, 0)).toMatchObject({ planned: '2026-W46', plansNext: true })
  })
  it('the first review of a new quarter offers the last quarter', () => {
    expect(reviewPlan('2027-01-06', 1, Date.UTC(2026, 11, 20)).previousQuarter).toBe('2026-Q4')
    expect(reviewPlan('2027-01-13', 1, Date.UTC(2027, 0, 6)).previousQuarter).toBeNull()
    expect(reviewPlan('2027-01-06', 1, 0).previousQuarter).toBe('2026-Q4')
  })
})

describe('writes', () => {
  it('adds offline through the outbox, applied locally first', async () => {
    const r = await addObjective('  Ship the 1.0 release ', '2026-Q4')
    expect(r?.id).toBeTruthy()
    expect(await db.objectives.get(r!.id)).toMatchObject({ title: 'Ship the 1.0 release', period: '2026-Q4', done_at: 0, deleted_at: null })
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'objective' && o.entityId === r!.id)
    expect(queued.map((o) => o.field).sort()).toEqual(['created_at', 'deleted_at', 'done_at', 'period', 'position', 'title'])
  })

  it('refuses an empty title, a month and a sixth open one; a done one frees a place', async () => {
    expect(await addObjective('   ', '2026-W44')).toBeNull()
    expect(await addObjective('Monthly', '2026-11')).toBeNull()
    const ids: string[] = []
    for (const title of ['a', 'b', 'c', 'd', 'e']) ids.push((await addObjective(title, '2026-W44'))!.id)
    expect(await addObjective('f', '2026-W44')).toBeNull()
    expect(await db.objectives.count()).toBe(5)
    await setObjectiveDone(ids[0], true)
    expect(await addObjective('f', '2026-W44')).not.toBeNull()
  })

  it('renames, moves, carries and drops, each one batch', async () => {
    const a = (await addObjective('Draft the talk', '2026-W44'))!.id
    const b = (await addObjective('Book the venue', '2026-W44'))!.id
    await renameObjective(a, 'Give the talk')
    await moveObjective(b, -1)
    let rows = objectivesIn(await db.objectives.toArray(), '2026-W44')
    expect(rows.map((o) => o.title)).toEqual(['Book the venue', 'Give the talk'])
    await carryObjective(a, '2026-W45')
    expect((await db.objectives.get(a))?.period).toBe('2026-W45')
    await dropObjective(b)
    rows = objectivesIn(await db.objectives.toArray(), '2026-W44')
    expect(rows).toEqual([])
    expect((await db.objectives.get(b))?.deleted_at).toBeTruthy()
    expect(await db.assistantUndo.count()).toBe(6)
  })

  it('concurrent edits converge per field', async () => {
    const seed = remote('o1', 'Draft the talk', '2026-W44', 1)
    const phone = [op('P', 30, 'o1', 'done_at', 1_790_000_000_000)]
    const laptop = [op('L', 25, 'o1', 'title', 'Give the talk')]
    await applyOps([...seed, ...phone, ...laptop])
    const one = await db.objectives.get('o1')
    useDatabase(`objectives-other-${n++}`)
    await applyOps([...laptop, ...seed, ...phone].reverse())
    const two = await db.objectives.get('o1')
    expect(one).toMatchObject({ title: 'Give the talk', done_at: 1_790_000_000_000 })
    expect({ title: two?.title, done_at: two?.done_at }).toEqual({ title: one?.title, done_at: one?.done_at })
  })

  it('six after sync: all shown, no Add, none removed', async () => {
    await applyOps(['1', '2', '3', '4', '5', '6'].flatMap((id, i) => remote(id, `Objective ${id}`, '2026-W44', i + 1)))
    const rows = await db.objectives.toArray()
    expect(objectivesIn(rows, '2026-W44')).toHaveLength(6)
    expect(openCount(rows, '2026-W44')).toBe(6)
    expect(canAdd(rows, '2026-W44')).toBe(false)
    expect(await addObjective('Seventh', '2026-W44')).toBeNull()
    expect((await db.objectives.toArray()).filter((o) => o.deleted_at)).toEqual([])
  })
})
