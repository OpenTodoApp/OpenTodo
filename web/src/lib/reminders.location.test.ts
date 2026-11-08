// Location reminder writes (OpenSpec change location-reminders, D1, D2): a
// location kind never carries a firing time or an offset, other kinds no radius,
// and due changes never touch a location reminder.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, resetDeviceId, updateTask } from './ops'
import { addReminder, dismissReminder, rearmReminder, updateReminder } from './reminders'

let n = 0
beforeEach(() => {
  useDatabase(`reminders-location-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('location reminders', () => {
  it('are added with a radius and no firing time, and keep none when the due date moves', async () => {
    const t = await createTask({ title: 'Buy stamps', due: { date: '2030-01-07', time: '09:00' } })
    const id = await addReminder(t, { kind: 'arrive', radius_m: 300 })
    expect(await db.reminders.get(id)).toMatchObject({ kind: 'arrive', radius_m: 300, fire_at: null, offset_minutes: null })
    await updateTask(t, { due: { date: '2030-01-08', time: '10:00' } })
    expect(await db.reminders.get(id)).toMatchObject({ kind: 'arrive', fire_at: null })
    const ops = await db.outbox.toArray()
    expect(ops.some((o) => o.entityId === id && o.field === 'fire_at' && o.value !== null)).toBe(false)
  })

  it('refuse a radius out of range', async () => {
    const t = await createTask({ title: 'Buy stamps' })
    await expect(addReminder(t, { kind: 'leave', radius_m: 50 })).rejects.toThrow()
    await expect(addReminder(t, { kind: 'leave', radius_m: 20000 })).rejects.toThrow()
  })

  it('switch kinds clearing what the other kind does not have', async () => {
    const t = await createTask({ title: 'Call', due: { date: '2030-01-07', time: '09:00' } })
    const id = await addReminder(t, { kind: 'relative', offset_minutes: -30 })
    await updateReminder(id, { kind: 'leave', radius_m: 500 })
    expect(await db.reminders.get(id)).toMatchObject({ kind: 'leave', radius_m: 500, fire_at: null, offset_minutes: null })
    await updateReminder(id, { kind: 'relative', offset_minutes: -15 })
    const back = await db.reminders.get(id)
    expect(back).toMatchObject({ kind: 'relative', radius_m: null, offset_minutes: -15 })
    expect(back?.fire_at).toBeGreaterThan(0)
  })

  it('dismissed on one device, armed again with Arm again', async () => {
    const t = await createTask({ title: 'Take the parcel' })
    const id = await addReminder(t, { kind: 'leave', radius_m: 150 })
    await dismissReminder(id, 1234)
    expect((await db.reminders.get(id))?.dismissed_at).toBe(1234)
    await rearmReminder(id)
    expect((await db.reminders.get(id))?.dismissed_at).toBeNull()
  })
})
