// OpenSpec change calendar-slots, task 2.1: the tasks a slot shows (D2), the add,
// move, take-out and delete batches (D3, D5) and the capacity contribution (D6).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { dayLoad } from './calendar'
import { calendarDays } from './calendarDays'
import { db, useDatabase } from './db'
import { createTask, DEFAULTS, resetDeviceId, SLOT_DEFAULTS } from './ops'
import { planLoad } from './plan'
import {
  addChanges, addTaskToSlot, clampSlotMinutes, createSlot, deleteSlot, MAX_SLOT_TASKS, moveChanges, moveSlot, nextFreeStart, resizeSlot,
  slotAt, slotCapacity, slotName, slotOf, slotsOnDate, takeOutOfSlot,
} from './slots'
import type { Slot, Task } from './types'
import { undoBatch } from './undo'

const slot = (over: Partial<Slot>): Slot => ({ ...SLOT_DEFAULTS, id: 's1', date: '2026-11-04', start: '16:00', minutes: 45, _clock: {}, ...over } as Slot)
const task = (over: Partial<Task>): Task => ({ ...(DEFAULTS.task as Omit<Task, 'id' | '_clock'>), id: 't', title: 't', due: { date: '2026-11-04' }, _clock: {}, ...over } as Task)
const byId = (...tasks: Task[]) => new Map(tasks.map((x) => [x.id, x]))
const WED = '2026-11-04'

describe('tasks a slot shows (D2)', () => {
  it('shows listed open tasks in order, completed ones after them, and skips moved, deleted and unknown ids', () => {
    const tasks = byId(
      task({ id: 'a', estimate_minutes: 5 }), task({ id: 'b', completed_at: 1 }), task({ id: 'c', due: null, estimate_minutes: 10 }),
      task({ id: 'moved', due: { date: '2026-11-05' } }), task({ id: 'gone', deleted_at: 1 }),
    )
    const [v] = slotsOnDate([slot({ task_ids: ['b', 'moved', 'a', 'gone', 'unknown', 'c'] })], WED, tasks)
    expect(v.open.map((x) => x.id)).toEqual(['a', 'c'])
    expect(v.done.map((x) => x.id)).toEqual(['b'])
    expect(v.start).toBe(960)
    expect(v.end).toBe(1005)
    expect(v.estimate).toBe(15)
    expect(v.counted).toBe(45)
    expect(v.overfull).toBe(false)
  })

  it('a task listed by two slots of the day shows in the one created first', () => {
    const tasks = byId(task({ id: 'a' }))
    const views = slotsOnDate([slot({ id: 'late', created_at: 20, task_ids: ['a'] }), slot({ id: 'early', created_at: 10, start: '09:00', task_ids: ['a'] })], WED, tasks)
    expect(views.find((v) => v.slot.id === 'early')!.open).toHaveLength(1)
    expect(views.find((v) => v.slot.id === 'late')!.open).toHaveLength(0)
  })

  it('deleted slots and slots without a date are not drawn; an empty title reads "Slot"', () => {
    expect(slotsOnDate([slot({ deleted_at: 1 }), slot({ id: 'x', date: null })], WED, new Map())).toEqual([])
    expect(slotName(slot({ title: '  ' }))).toBe('Slot')
    expect(slotName(slot({ title: 'Admin' }))).toBe('Admin')
  })

  it('the grid draws the slot once and not its tasks as blocks or in the lane', () => {
    const a = task({ id: 'a', estimate_minutes: 5 })
    const timed = task({ id: 'timed', due: { date: WED, time: '10:00' }, estimate_minutes: 60 })
    const views = new Map([[WED, slotsOnDate([slot({ task_ids: ['a'] })], WED, byId(a, timed))]])
    const [day] = calendarDays([WED], [a, timed], [], undefined, views)
    expect(day.lane).toEqual([])
    expect([...day.blocks.keys()]).toEqual(['timed'])
    expect(day.layout.blocks.map((b) => b.id).sort()).toEqual(['slot:s1', 'timed'])
    expect(day.slots.get('slot:s1')!.open).toHaveLength(1)
  })

  it('finds the slot under a placement and the slot of a list row', () => {
    const views = slotsOnDate([slot({ task_ids: ['a'] })], WED, byId(task({ id: 'a' })))
    expect(slotAt(views, 970)?.slot.id).toBe('s1')
    expect(slotAt(views, 1005)).toBeNull()
    expect(slotOf(task({ id: 'a' }), [slot({ task_ids: ['a'] })])?.id).toBe('s1')
    expect(slotOf(task({ id: 'a', due: { date: '2026-11-05' } }), [slot({ task_ids: ['a'] })])).toBeNull()
  })
})

describe('capacity (D6)', () => {
  it('"Slot counted once": a 45-minute slot with 25 minutes of tasks and a 1-hour block count 1 h 45 m', () => {
    const a = task({ id: 'a', estimate_minutes: 10 }), b = task({ id: 'b', estimate_minutes: 15 })
    const block = task({ id: 'blk', due: { date: WED, time: '09:00' }, estimate_minutes: 60 })
    const views = slotsOnDate([slot({ task_ids: ['a', 'b'] })], WED, byId(a, b, block))
    const load = dayLoad([a, b, block], WED, 480, 0, slotCapacity(views))
    expect(load.planned).toBe(105)
    expect(planLoad([a, b, block], [], [], WED, 480, undefined, slotCapacity(views)).total).toBe(105)
  })

  it('"Overfull": 50 minutes of tasks in a 45-minute slot count 50 minutes', () => {
    const a = task({ id: 'a', estimate_minutes: 30 }), b = task({ id: 'b', estimate_minutes: 20 })
    const [v] = slotsOnDate([slot({ task_ids: ['a', 'b'] })], WED, byId(a, b))
    expect(v.overfull).toBe(true)
    expect(v.counted).toBe(50)
    expect(dayLoad([a, b], WED, 480, 0, slotCapacity([v])).planned).toBe(50)
  })

  it('unestimated tasks in a slot are covered by its length', () => {
    const a = task({ id: 'a' })
    const views = slotsOnDate([slot({ task_ids: ['a'] })], WED, byId(a))
    expect(dayLoad([a], WED, 480, 0, slotCapacity(views))).toMatchObject({ planned: 45, unestimated: 0 })
  })
})

describe('batches (D3, D5)', () => {
  it('adding dates the task to the slot, appends it and takes it out of the day\'s other slots', () => {
    const s = slot({ task_ids: ['x'] })
    const other = slot({ id: 's2', task_ids: ['a', 'y'] })
    const r = addChanges(s, { id: 'a', due: { date: '2026-11-06', time: '10:00' } }, { date: '2026-11-06', time: '10:00' }, [s, other], true)
    expect('changes' in r && r.changes).toEqual([
      { entity: 'slot', entityId: 's1', patch: { task_ids: ['x', 'a'] } },
      { entity: 'task', entityId: 'a', patch: { due: { date: WED } } },
      { entity: 'slot', entityId: 's2', patch: { task_ids: ['y'] } },
    ])
  })

  it('a viewer\'s task is added only when already due on the day; a full slot refuses', () => {
    const s = slot({})
    expect(addChanges(s, { id: 'a', due: { date: '2026-11-06' } }, { date: '2026-11-06' }, [s], false)).toEqual({ error: "You can't change this task's date" })
    const ok = addChanges(s, { id: 'a', due: { date: WED } }, { date: WED }, [s], false)
    expect('changes' in ok && ok.changes).toEqual([{ entity: 'slot', entityId: 's1', patch: { task_ids: ['a'] } }])
    const full = slot({ task_ids: Array.from({ length: MAX_SLOT_TASKS }, (_, i) => `t${i}`) })
    expect(addChanges(full, { id: 'a', due: null }, null, [full], true)).toEqual({ error: 'A slot holds up to 20 tasks.' })
  })

  it('moving to another day dates the shown tasks the user may edit', () => {
    const a = task({ id: 'a' }), b = task({ id: 'b', project_id: 'shared' })
    const [v] = slotsOnDate([slot({ task_ids: ['a', 'b'] })], WED, byId(a, b))
    const viewer = new Map([['shared', { projectId: 'shared', role: 'viewer' as const, ownerId: 'o', members: [] }]])
    const r = moveChanges(v, '2026-11-05', 540, viewer)
    expect('changes' in r && r.changes).toEqual([
      { entity: 'slot', entityId: 's1', patch: { date: '2026-11-05', start: '09:00' } },
      { entity: 'task', entityId: 'a', patch: { due: { date: '2026-11-05' } } },
    ])
    expect(clampSlotMinutes(5)).toBe(15)
    expect(clampSlotMinutes(1000)).toBe(480)
    expect(clampSlotMinutes(52)).toBe(45)
  })

  it('the next free quarter hour skips busy intervals', () => {
    expect(nextFreeStart(607, [])).toBe(615)
    expect(nextFreeStart(607, [{ start: 600, end: 660 }])).toBe(660)
  })
})

let n = 0
describe('writes with one Undo', () => {
  beforeEach(() => {
    useDatabase(`slots-${Date.now()}-${n++}`)
    resetDeviceId()
  })

  it('"Drop a small task": dated without a time, listed, and one Undo restores both', async () => {
    const id = await createTask({ title: 'Reply to Marco', due: { date: '2026-11-06', time: '10:00' } })
    const { id: sid } = await createSlot({ date: WED, start: '16:00', minutes: 45, title: 'Admin' })
    const r = await addTaskToSlot(sid, id)
    expect(r.error).toBeUndefined()
    expect((await db.tasks.get(id))!.due).toEqual({ date: WED })
    expect((await db.slots.get(sid))!.task_ids).toEqual([id])
    await undoBatch(r.entry!.id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-06', time: '10:00' })
    expect((await db.slots.get(sid))!.task_ids).toEqual([])
  })

  it('"Move to tomorrow", resize, take out and delete', async () => {
    const ids = [await createTask({ title: 'a' }), await createTask({ title: 'b' })]
    const { id: sid } = await createSlot({ date: WED, start: '16:00', minutes: 45 })
    for (const id of ids) await addTaskToSlot(sid, id)
    const tasks = byId(...(await db.tasks.toArray()))
    const [v] = slotsOnDate(await db.slots.toArray(), WED, tasks)
    const moved = await moveSlot(v, '2026-11-05', 540)
    expect(await db.slots.get(sid)).toMatchObject({ date: '2026-11-05', start: '09:00' })
    for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-05' })
    await undoBatch(moved.entry!.id)
    expect(await db.slots.get(sid)).toMatchObject({ date: WED, start: '16:00' })
    for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual({ date: WED })

    await resizeSlot((await db.slots.get(sid))!, 70)
    expect((await db.slots.get(sid))!.minutes).toBe(75)

    await takeOutOfSlot((await db.slots.get(sid))!, ids[0], { date: WED, time: '14:00' })
    expect((await db.slots.get(sid))!.task_ids).toEqual([ids[1]])
    expect((await db.tasks.get(ids[0]))!.due).toEqual({ date: WED, time: '14:00' })

    const del = await deleteSlot((await db.slots.get(sid))!)
    expect((await db.slots.get(sid))!.deleted_at).not.toBeNull()
    expect((await db.tasks.get(ids[1]))!.due).toEqual({ date: WED })
    await undoBatch(del.entry!.id)
    expect(await db.slots.get(sid)).toMatchObject({ deleted_at: null, task_ids: [ids[1]] })
  })
})
