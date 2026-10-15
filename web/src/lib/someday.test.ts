// OpenSpec change `someday-and-evening`: fields, predicates and parking (tasks 1.3, 2.1, 2.2).
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { formatValue } from './history'
import { applyOps, createTask, getDeviceId, parkTask, resetDeviceId, unparkTask, updateTask } from './ops'
import type { Op } from './types'
import { inAnytime, inLater, inToday, inUpcoming, isActive, isDeferred, isSomeday, isStarted, openCount, overdueInToday } from './views'

let n = 0
beforeEach(() => {
  useDatabase(`someday-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('fields (1.3)', () => {
  it('remote ops read back; old rows read null and false', async () => {
    await applyOps([
      { id: 'a', entity: 'task', entityId: 't1', field: 'start', value: 'someday', ts: 1, device: 'A' },
      { id: 'b', entity: 'task', entityId: 't1', field: 'evening', value: true, ts: 1, device: 'A' },
      { id: 'c', entity: 'task', entityId: 't2', field: 'title', value: 'Old', ts: 1, device: 'A' },
    ])
    expect(await db.tasks.get('t1')).toMatchObject({ start: 'someday', evening: true })
    const old = (await db.tasks.get('t2'))!
    expect(old.start ?? null).toBeNull()
    expect(old.evening ?? false).toBe(false)
  })

  it('a plain create writes neither field; updateTask queues one op per field', async () => {
    const id = await createTask({ title: 'Plain' })
    expect((await db.outbox.toArray()).some((o) => o.field === 'start' || o.field === 'evening')).toBe(false)
    await db.outbox.clear()
    await updateTask(id, { start: '2026-10-21' })
    await updateTask(id, { evening: true })
    expect((await db.outbox.toArray()).map((o) => [o.field, o.value])).toEqual([['start', '2026-10-21'], ['evening', true]])
  })

  it('history formats them', () => {
    expect(formatValue('start', 'someday')).toBe('Someday')
    expect(formatValue('evening', true)).toBe('on')
  })
})

describe('predicates (2.1)', () => {
  const T = (o: { due?: string; deadline?: string; start?: string; done?: boolean }) => ({
    due: o.due ? { date: o.due } : null, deadline: o.deadline ?? null, start: o.start ?? null, completed_at: o.done ? 1 : null,
  })
  it('deferred until next week: out of Today, Upcoming, Anytime and the counts, in Later', () => {
    const t = T({ start: '2026-10-21' }), today = '2026-10-14'
    expect([inToday(t, today), inUpcoming(t, today), inAnytime(t, today), openCount(t, today)]).toEqual([false, false, false, false])
    expect(inLater(t, today)).toBe(true)
    expect(isDeferred(t, today)).toBe(true)
  })
  it('due later than start: not in Upcoming while deferred', () => {
    expect(inUpcoming(T({ due: '2026-10-24', start: '2026-10-21' }), '2026-10-14')).toBe(false)
  })
  it('hard date wins over deferral', () => {
    expect(inToday(T({ start: '2026-10-21', deadline: '2026-10-14' }), '2026-10-14')).toBe(true)
  })
  it('start day reached: in Today, counted, stays after the day', () => {
    const t = T({ start: '2026-10-21' })
    expect(inToday(t, '2026-10-21') && openCount(t, '2026-10-21')).toBe(true)
    expect(inToday(t, '2026-10-24') && isStarted(t, '2026-10-24')).toBe(true)
    expect(overdueInToday(t, '2026-10-24')).toBe(false)
  })
  it('started and due later: in Today and in Upcoming', () => {
    const t = T({ start: '2026-10-21', due: '2026-10-24' })
    expect(inToday(t, '2026-10-21') && inUpcoming(t, '2026-10-21')).toBe(true)
  })
  it('Someday: out of the planning views unless a hard date has come', () => {
    const t = T({ start: 'someday' })
    expect([isSomeday(t), isActive(t, '2026-10-14'), inToday(t, '2026-10-14'), inUpcoming(t, '2026-10-14'), inAnytime(t, '2026-10-14')]).toEqual([true, false, false, false, false])
    expect(inToday(T({ start: 'someday', due: '2026-10-14' }), '2026-10-14')).toBe(true)
  })
  it('Anytime: undated, no start', () => {
    const today = '2026-10-14'
    expect(inAnytime(T({}), today)).toBe(true)
    expect(inAnytime(T({ start: '2026-10-21' }), today)).toBe(false)
    expect(inAnytime(T({ due: '2026-10-15' }), today)).toBe(false)
    expect(inAnytime(T({ done: true }), today)).toBe(false)
  })
})

describe('parking (2.2)', () => {
  it('park a scheduled recurring task: one batch sets someday and clears due and rule', async () => {
    const id = await createTask({ title: 'Review', due: { date: '2026-10-16' }, recurrence: 'every week', evening: true })
    await db.outbox.clear()
    await parkTask(id)
    expect(await db.tasks.get(id)).toMatchObject({ start: 'someday', due: null, recurrence: null, evening: false })
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.field).sort()).toEqual(['due', 'evening', 'recurrence', 'start'])
    expect(new Set(ops.map((o) => `${o.ts}|${o.device}`)).size).toBe(1)
  })
  it('scheduling a parked task un-parks it in the same batch', async () => {
    const id = await createTask({ title: 'Idea', start: 'someday' })
    await db.outbox.clear()
    await updateTask(id, { due: { date: '2026-10-20' } })
    expect(await db.tasks.get(id)).toMatchObject({ start: null, due: { date: '2026-10-20' } })
    expect((await db.outbox.toArray()).map((o) => o.field).sort()).toEqual(['due', 'start'])
  })
  it('unpark returns it without a date', async () => {
    const id = await createTask({ title: 'Idea', start: 'someday' })
    await unparkTask(id)
    expect(await db.tasks.get(id)).toMatchObject({ start: null, due: null })
  })
  it('park offline on two devices: each field converges on the later edit', async () => {
    useDatabase(`A-${n++}`); resetDeviceId(); await getDeviceId()
    const id = await createTask({ title: 'Shared', due: { date: '2026-10-16' } })
    const created = await db.outbox.toArray()
    const ops: Op[] = created.map(({ local: _l, ...o }) => o as Op)
    useDatabase(`B-${n++}`); resetDeviceId(); await getDeviceId()
    await applyOps(ops)
    await db.outbox.clear()
    await updateTask(id, { due: { date: '2026-10-18' } })
    const fromB = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    useDatabase(`A2-${n++}`); resetDeviceId(); await getDeviceId()
    await applyOps(ops)
    await db.outbox.clear()
    await parkTask(id) // later than B's edit
    const fromA = (await db.outbox.toArray()).map(({ local: _l, ...o }) => o as Op)
    await applyOps(fromB)
    expect(await db.tasks.get(id)).toMatchObject({ start: 'someday', due: null })
    useDatabase(`B2-${n++}`); resetDeviceId(); await getDeviceId()
    await applyOps(ops); await applyOps(fromA); await applyOps(fromB)
    expect(await db.tasks.get(id)).toMatchObject({ start: 'someday', due: null })
  })
})
