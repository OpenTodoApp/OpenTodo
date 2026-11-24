// OpenSpec change day-manual-order, tasks 2.1 and 2.2: Today's and Upcoming's shared day
// order, written as one undoable batch on the user's prefs, and a line in another day or
// part that writes the date or part in the same batch.
import { describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { addDaysISO, logicalToday } from './dates'
import { applyOps, createProject, createTask, getDeviceId, mutate, resetDeviceId, setTaskCompleted, updateTask } from './ops'
import type { Op, Task } from './types'
import { undoBatch } from './undo'
import { dropInDay, moveInViewOrder, stepInViewOrder, type OrderHost } from './viewOrderMove'

const today = logicalToday()
const thursday = addDaysISO(today, 2)
const friday = addDaysISO(today, 3)
const upcoming: OrderHost = { entity: 'user_prefs', id: 'me', page: 'upcoming' }
const todayHost: OrderHost = { entity: 'user_prefs', id: 'me', page: 'today' }

async function tasksOf(ids: string[]): Promise<Task[]> {
  return (await db.tasks.bulkGet(ids)).filter((x): x is Task => !!x)
}

describe('the day order', () => {
  it('reorders within a day of Upcoming, switching only Upcoming to Manual order, seeded from what it shows, undone together', async () => {
    const gym = await createTask({ title: 'Gym', due: { date: thursday, time: '07:00' } })
    const bank = await createTask({ title: 'Call the bank', due: { date: thursday } })
    const shop = await createTask({ title: 'Shop', due: { date: friday } })
    await mutate('user_prefs', 'me', { today_sort_by: 'title' })
    await db.outbox.clear()
    const r = await moveInViewOrder(upcoming, await tasksOf([gym, bank, shop]), bank, { before: gym })
    expect(r?.label).toBe('Order changed')
    expect(await db.userPrefs.get('me')).toMatchObject({ today_manual_order: [bank, gym, shop], upcoming_sort_by: 'position', upcoming_sort_dir: 'asc', today_sort_by: 'title' })
    expect((await db.outbox.toArray()).every((op) => op.entity === 'user_prefs')).toBe(true)
    await undoBatch(r!.entry!.id)
    expect(await db.userPrefs.get('me')).toMatchObject({ today_manual_order: [], upcoming_sort_by: '', today_sort_by: 'title' })
  })

  it('a keyboard step under another order switches to Manual order first, and the edge writes nothing', async () => {
    const one = await createTask({ title: 'One', due: { date: today } })
    const two = await createTask({ title: 'Two', due: { date: today } })
    const shown = await tasksOf([one, two])
    await db.outbox.clear()
    expect(await stepInViewOrder(todayHost, shown, shown, one, -1)).toBeNull()
    expect(await db.outbox.count()).toBe(0)
    await stepInViewOrder(todayHost, shown, shown, two, -1)
    expect(await db.userPrefs.get('me')).toMatchObject({ today_manual_order: [two, one], today_sort_by: 'position' })
  })

  it('a line in another day writes the date and the place in one batch, with one Undo', async () => {
    const call = await createTask({ title: 'Call Ada', due: { date: addDaysISO(today, 1), time: '10:30' } })
    const gym = await createTask({ title: 'Gym', due: { date: thursday } })
    const shop = await createTask({ title: 'Shop', due: { date: thursday } })
    await mutate('user_prefs', 'me', { upcoming_sort_by: 'position', today_manual_order: [gym, shop] })
    await db.outbox.clear()
    const r = await dropInDay(upcoming, await tasksOf([call, gym, shop]), call, { kind: 'day', at: { after: gym }, date: thursday })
    expect(r?.label).toBe('Date changed')
    expect((await db.tasks.get(call))?.due).toEqual({ date: thursday, time: '10:30' })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([gym, call, shop])
    expect((await db.outbox.toArray()).map((op) => `${op.entity}.${op.field}`).sort()).toEqual(['task.due', 'user_prefs.today_manual_order'])
    await undoBatch(r!.entry!.id)
    expect((await db.tasks.get(call))?.due).toEqual({ date: addDaysISO(today, 1), time: '10:30' })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([gym, shop])
  })

  it('pins a task dropped into another day even where the sequence already agrees', async () => {
    const mon = await createTask({ title: 'Earlier day', due: { date: addDaysISO(today, 1) } })
    const tue = await createTask({ title: 'Later day', due: { date: thursday } })
    await mutate('user_prefs', 'me', { upcoming_sort_by: 'position' })
    await dropInDay(upcoming, await tasksOf([mon, tue]), mon, { kind: 'day', at: { before: tue }, date: thursday })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([mon])
    expect((await db.tasks.get(mon))?.due?.date).toBe(thursday)
  })

  it('a line in another part sets the part, keeps the due time, and places the task, undone together', async () => {
    const nine = await createTask({ title: 'Nine', due: { date: today, time: '09:00' } })
    const a = await createTask({ title: 'A', due: { date: today }, day_part: 'afternoon' })
    const b = await createTask({ title: 'B', due: { date: today }, day_part: 'afternoon' })
    await mutate('user_prefs', 'me', { day_parts: 'on', today_manual_order: [a, b], today_sort_by: 'position' })
    const r = await dropInDay(todayHost, await tasksOf([nine, a, b]), nine, { kind: 'day', at: { after: a }, part: 'afternoon' })
    expect(r?.label).toBe('Moved to Afternoon')
    expect(await db.tasks.get(nine)).toMatchObject({ day_part: 'afternoon', evening: false, due: { date: today, time: '09:00' } })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([a, nine, b])
    await undoBatch(r!.entry!.id)
    expect((await db.tasks.get(nine))?.day_part ?? null).toBeNull()
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([a, b])
  })

  it('a viewer orders their own day but changes no date or part by a drop', async () => {
    await db.memberships.put({ projectId: 'launch', role: 'viewer', ownerId: 'ana', members: [] })
    const brief = await createTask({ title: 'Brief', project_id: 'launch', due: { date: thursday } })
    const deck = await createTask({ title: 'Deck', project_id: 'launch', due: { date: thursday } })
    await db.outbox.clear()
    expect(await dropInDay(upcoming, await tasksOf([brief, deck]), deck, { kind: 'day', at: { before: brief }, date: friday })).toBeNull()
    expect(await db.outbox.count()).toBe(0)
    const r = await dropInDay(upcoming, await tasksOf([brief, deck]), deck, { kind: 'day', at: { before: brief } })
    expect(r?.entry).toBeTruthy()
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([deck, brief])
  })

  it('prunes completed and deleted ids on the next move, keeps open tasks another page shows, and a date edit elsewhere keeps the rank', async () => {
    const project = await createProject({ name: 'Home' })
    const [a, b, c, d] = [
      await createTask({ title: 'A', project_id: project, due: { date: today } }), await createTask({ title: 'B', project_id: project, due: { date: today } }),
      await createTask({ title: 'C', project_id: project, due: { date: today } }), await createTask({ title: 'D', project_id: project, due: { date: thursday } }),
    ]
    await mutate('user_prefs', 'me', { today_sort_by: 'position', today_manual_order: [a, b, c, d] })
    await updateTask(d, { due: { date: friday } })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([a, b, c, d])
    await setTaskCompleted(b, true)
    await updateTask(c, { deleted_at: Date.now() })
    const e = await createTask({ title: 'E', project_id: project, due: { date: today } })
    await moveInViewOrder(todayHost, await tasksOf([a, e]), e, { before: a })
    expect((await db.userPrefs.get('me'))?.today_manual_order).toEqual([e, a, d])
  })

  it('two devices reordering offline converge on the list written last, each task once', async () => {
    const strip = (rows: Op[]) => rows.map((row) => { const { local: _l, ...o } = row as Op & { local?: unknown }; return o as Op })
    useDatabase(`laptop-${Date.now()}`); resetDeviceId(); await getDeviceId()
    const ids = [await createTask({ title: 'A', due: { date: today } }), await createTask({ title: 'B', due: { date: today } }), await createTask({ title: 'C', due: { date: today } })]
    const created = strip(await db.outbox.toArray())
    useDatabase(`phone-${Date.now()}`); resetDeviceId(); await getDeviceId()
    await applyOps(created)
    await db.outbox.clear()
    await moveInViewOrder(todayHost, await tasksOf(ids), ids[2], { before: ids[0] })
    const fromPhone = strip(await db.outbox.toArray())
    useDatabase(`laptop2-${Date.now()}`); resetDeviceId(); await getDeviceId()
    await applyOps(created)
    await db.outbox.clear()
    await moveInViewOrder(todayHost, await tasksOf(ids), ids[1], { before: ids[0] })
    const fromLaptop = strip(await db.outbox.toArray())
    const orderOp = (ops: Op[]) => ops.find((op) => op.field === 'today_manual_order')!
    const stamp = (op: Op) => `${String(op.ts).padStart(16, '0')}:${op.device}`
    const later = stamp(orderOp(fromLaptop)) > stamp(orderOp(fromPhone)) ? fromLaptop : fromPhone
    const expected = later === fromLaptop ? [ids[1], ids[0], ids[2]] : [ids[2], ids[0], ids[1]]
    await applyOps(fromPhone)
    const here = (await db.userPrefs.get('me'))?.today_manual_order
    useDatabase(`phone2-${Date.now()}`); resetDeviceId(); await getDeviceId()
    await applyOps(created); await applyOps(fromPhone); await applyOps(fromLaptop)
    const there = (await db.userPrefs.get('me'))?.today_manual_order
    expect(here).toEqual(expected)
    expect(there).toEqual(expected)
    expect(new Set(there).size).toBe(there?.length)
  })
})
