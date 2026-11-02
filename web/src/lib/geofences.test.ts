// @vitest-environment happy-dom
// Location reminders on this device (OpenSpec change location-reminders, D2–D4):
// which reminders are armed, what reaches the shell, and the per-device switch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta } from './db'
import { isArmed, MAX_GEOFENCES, publishGeofences, radiusOf, reminderPoint, setShellGeofences, shellGeofences, META_SHELL_GEOFENCES } from './geofences'
import { forgetShellData, type OpenTodoShell, type ShellLocationPermission } from './shell'
import type { Place, Reminder, Task } from './types'

const enc = vi.hoisted(() => ({ state: { enabled: false, unlocked: false } }))
vi.mock('./e2ee', async (orig) => ({ ...(await orig<typeof import('./e2ee')>()), encryptionSnapshot: () => enc.state }))

const NOW = Date.UTC(2026, 9, 22, 12, 0)
const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, project_id: null, parent_id: null, due: null, priority: 4, labels: [], position: 1, created_at: 0, completed_at: null, deleted_at: null, ...extra }) as unknown as Task
const loc = (id: string, kind: 'arrive' | 'leave', taskId: string, extra: Partial<Reminder> = {}): Reminder =>
  ({ id, task_id: taskId, kind, offset_minutes: null, fire_at: null, radius_m: 150, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null, ...extra }) as unknown as Reminder
const place = (id: string, geo: Place['geo'], extra: Partial<Place> = {}): Place =>
  ({ id, name: id, address: '', geo, position: 1, created_at: 0, deleted_at: null, ...extra }) as unknown as Place

const office = { name: 'Post office', lat: 45.4642, lon: 9.19 }

describe('armed location reminders', () => {
  const places = new Map<string, Place>()

  it('are live, not dismissed, on an open task with a point', () => {
    const open = task('t', { location: office })
    expect(isArmed(loc('r', 'arrive', 't'), open, places)).toBe(true)
    expect(isArmed(loc('r', 'arrive', 't', { dismissed_at: NOW }), open, places)).toBe(false)
    expect(isArmed(loc('r', 'arrive', 't', { deleted_at: NOW }), open, places)).toBe(false)
    expect(isArmed(loc('r', 'arrive', 't'), task('t', { location: office, completed_at: NOW }), places)).toBe(false)
    expect(isArmed(loc('r', 'arrive', 't'), task('t', { location: office, deleted_at: NOW }), places)).toBe(false)
    expect(isArmed(loc('r', 'arrive', 't'), task('t', { location: { address: 'Via Roma 1' } }), places)).toBe(false)
    expect(isArmed(loc('r', 'arrive', 't'), task('t', { location: 'enc:v1:abc' }), places)).toBe(false)
    expect(isArmed({ ...loc('r', 'arrive', 't'), kind: 'relative' }, open, places)).toBe(false)
  })

  it('follow a linked place\'s current pin, and the task\'s own point once the place is gone', () => {
    const t = task('t', { location: { name: 'Gym', lat: 1, lon: 1, place_id: 'gym' } })
    expect(reminderPoint(t, new Map([['gym', place('gym', { lat: 45.5, lon: 9.2 })]]))).toEqual({ lat: 45.5, lon: 9.2 })
    expect(reminderPoint(t, new Map([['gym', place('gym', { lat: 45.5, lon: 9.2 }, { deleted_at: NOW })]]))).toEqual({ lat: 1, lon: 1 })
    expect(reminderPoint(t, new Map([['gym', place('gym', 'enc:v1:abc')]]))).toEqual({ lat: 1, lon: 1 })
  })

  it('keep the radius within 100 to 5,000 metres', () => {
    expect(radiusOf({ radius_m: null })).toBe(150)
    expect(radiusOf({ radius_m: 20 })).toBe(100)
    expect(radiusOf({ radius_m: 99999 })).toBe(5000)
    expect(radiusOf({ radius_m: 300 })).toBe(300)
  })

  it('reach the shell sorted by id, at most 100, with titles only when allowed', () => {
    const tasks = [task('a', { location: office }), task('b', { location: office })]
    const rs = [loc('z', 'leave', 'b', { radius_m: 300 }), loc('m', 'arrive', 'a')]
    const p = shellGeofences(rs, tasks, [], { titles: true, encrypted: false })
    expect(p).toEqual({ version: 1, regions: [
      { id: 'm', taskId: 'a', lat: office.lat, lon: office.lon, radius: 150, on: 'arrive', title: 'Task a' },
      { id: 'z', taskId: 'b', lat: office.lat, lon: office.lon, radius: 300, on: 'leave', title: 'Task b' },
    ] })
    expect(shellGeofences(rs, tasks, [], { titles: true, encrypted: true }).regions.every((r) => r.title === undefined)).toBe(true)
    expect(shellGeofences(rs, tasks, [], { titles: false, encrypted: false }).regions.every((r) => r.title === undefined)).toBe(true)
    const many = Array.from({ length: 130 }, (_, i) => loc(`r${String(i).padStart(3, '0')}`, 'arrive', 'a'))
    const big = shellGeofences(many, tasks, [], { titles: false, encrypted: false })
    expect(big.regions).toHaveLength(MAX_GEOFENCES)
    expect(big.regions[0].id).toBe('r000')
  })
})

describe('the shell hand-over', () => {
  let calls: string[] = []
  let answer: ShellLocationPermission = 'granted'
  const install = (caps: string[]) => {
    window.opentodoShell = {
      bridge: 1, platform: 'android', app: '0.21.0', capabilities: caps,
      scheduleGeofences: (json) => { calls.push(json); return answer },
    } as OpenTodoShell
  }

  beforeEach(async () => {
    calls = []
    answer = 'granted'
    enc.state = { enabled: false, unlocked: false }
    forgetShellData() // also resets the last hand-over
    calls = []
    await Promise.all([db.tasks.clear(), db.reminders.clear(), db.places.clear(), db.meta.clear()])
    await db.tasks.put(task('t', { location: office }))
    await db.reminders.put(loc('r', 'arrive', 't'))
  })
  afterEach(() => { delete window.opentodoShell })

  it('an older shell without geofences is never called', async () => {
    window.opentodoShell = { bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['reminders'], scheduleGeofences: () => { calls.push('x'); return 'granted' } } as OpenTodoShell
    expect(await setShellGeofences(true)).toBeNull()
    expect(await publishGeofences()).toBeNull()
    expect(calls).toEqual([])
  })

  it('the switch is off by default: nothing is armed', async () => {
    install(['geofences'])
    await publishGeofences()
    expect(JSON.parse(calls[0]).regions).toEqual([])
  })

  it('turning it on asks and arms; an unchanged set is not handed over again', async () => {
    install(['geofences'])
    expect(await setShellGeofences(true)).toBe('granted')
    expect(JSON.parse(calls[0])).toMatchObject({ version: 1, ask: true, regions: [{ id: 'r', on: 'arrive' }] })
    await publishGeofences()
    expect(calls).toHaveLength(1)
    await db.reminders.put(loc('r', 'arrive', 't', { dismissed_at: NOW }))
    await publishGeofences()
    expect(JSON.parse(calls[1]).regions).toEqual([])
  })

  it('with only foreground location the switch stays off and nothing is armed', async () => {
    install(['geofences'])
    answer = 'foreground-only'
    expect(await setShellGeofences(true)).toBe('foreground-only')
    expect(await db.meta.get(META_SHELL_GEOFENCES)).toMatchObject({ value: false })
    expect(JSON.parse(calls[calls.length - 1]).regions).toEqual([])
  })

  it('a locked encrypted account clears every region; unlocking arms them again', async () => {
    install(['geofences'])
    await setMeta(META_SHELL_GEOFENCES, true)
    enc.state = { enabled: true, unlocked: true }
    await publishGeofences()
    expect(JSON.parse(calls[0]).regions).toHaveLength(1)
    expect(JSON.parse(calls[0]).regions[0].title).toBeUndefined()
    enc.state = { enabled: true, unlocked: false }
    await publishGeofences()
    expect(JSON.parse(calls[1]).regions).toEqual([])
    enc.state = { enabled: true, unlocked: true }
    await publishGeofences()
    expect(JSON.parse(calls[2]).regions).toHaveLength(1)
  })

  it('sign-out clears the regions', async () => {
    install(['geofences'])
    forgetShellData()
    expect(JSON.parse(calls[0])).toEqual({ version: 1, regions: [] })
  })
})
