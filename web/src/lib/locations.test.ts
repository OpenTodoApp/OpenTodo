import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import {
  createPlace, deletePlace, formatCoordinates, locationFromPlace, locationLabel, locationOf, makeLocation, mapsPrefOn,
  openInMapsHref, parseCoordinates, reorderPlaces, setMapsPref, setTaskLocation, shownLocation, sortedPlaces, updatePlace,
} from './locations'
import { applyOps, createTask, resetDeviceId } from './ops'
import type { Op, Place } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`locations-${Date.now()}-${n++}`)
  resetDeviceId()
})

const remoteOp = (p: Pick<Op, 'entity' | 'entityId' | 'field' | 'value' | 'ts' | 'device'>): Op => ({ id: crypto.randomUUID(), ...p })

describe('makeLocation and parsing', () => {
  it('keeps only what the server accepts', () => {
    expect(makeLocation({ name: '  Post office ', lat: 45.46421234, lon: 9.19 })).toEqual({ name: 'Post office', lat: 45.464212, lon: 9.19 })
    expect(makeLocation({ name: '', address: '' })).toBeNull()
    expect(makeLocation({ lat: 45.46 })).toBeNull() // half a coordinate is dropped, nothing left
    expect(makeLocation({ name: 'Home', lat: 91, lon: 9 })).toEqual({ name: 'Home' })
    expect(makeLocation({ name: 'x'.repeat(300) })?.name).toHaveLength(200)
  })

  it('reads typed coordinates', () => {
    expect(parseCoordinates('45.4642, 9.1900')).toEqual({ lat: 45.4642, lon: 9.19 })
    expect(parseCoordinates('45.4642 9.19')).toEqual({ lat: 45.4642, lon: 9.19 })
    expect(parseCoordinates('45,4642; 9,19')).toEqual({ lat: 45.4642, lon: 9.19 })
    expect(parseCoordinates('-33.86, 151.21')).toEqual({ lat: -33.86, lon: 151.21 })
    expect(parseCoordinates('91, 9')).toBeNull()
    expect(parseCoordinates('Via Roma 1')).toBeNull()
    expect(formatCoordinates(45.4642, 9.19)).toBe('45.4642, 9.19')
  })

  it('opens the maps app on a phone and openstreetmap.org on a computer', () => {
    expect(openInMapsHref(45.4642, 9.19, true)).toBe('geo:45.4642,9.19?q=45.4642,9.19')
    expect(openInMapsHref(45.4642, 9.19, false)).toBe('https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=17/45.4642/9.19')
  })
})

describe('task locations', () => {
  it('sets and clears a location as one value, offline', async () => {
    const id = await createTask({ title: 'Post the parcel' })
    await setTaskLocation(id, makeLocation({ name: 'Post office', lat: 45.46, lon: 9.19 }))
    const { db } = await import('./db')
    expect(locationOf(await db.tasks.get(id))).toEqual({ name: 'Post office', lat: 45.46, lon: 9.19 })
    const ops = (await db.outbox.toArray()).filter((o) => o.field === 'location')
    expect(ops).toHaveLength(1) // one whole value, not one op per member
    await setTaskLocation(id, null)
    expect(locationOf(await db.tasks.get(id))).toBeNull()
  })

  it('converges whole: the newer write wins with all of its members', async () => {
    const id = await createTask({ title: 'Meet' })
    const { db } = await import('./db')
    await applyOps([
      remoteOp({ entity: 'task', entityId: id, field: 'location', value: { address: 'Via Roma 1, Torino' }, ts: Date.now() + 1000, device: 'B' }),
    ])
    await applyOps([
      remoteOp({ entity: 'task', entityId: id, field: 'location', value: { name: 'Post office', lat: 45.46, lon: 9.19 }, ts: Date.now() + 500, device: 'A' }),
    ])
    expect(locationOf(await db.tasks.get(id))).toEqual({ address: 'Via Roma 1, Torino' })
  })

  it('a location survives an edit of another field', async () => {
    const id = await createTask({ title: 'Gym' })
    await setTaskLocation(id, { name: 'Gym' })
    const { db } = await import('./db')
    const { updateTask } = await import('./ops')
    await updateTask(id, { title: 'Gym session' })
    expect(locationOf(await db.tasks.get(id))).toEqual({ name: 'Gym' })
  })

  it('shows "Encrypted" for a value this device cannot read', () => {
    expect(shownLocation({ location: 'Encrypted' }, new Map())).toMatchObject({ encrypted: true })
  })
})

describe('places', () => {
  it('a linked place follows the place; a deleted one leaves the snapshot', async () => {
    const { db } = await import('./db')
    const pid = await createPlace({ name: 'Gym', address: 'Via Po 2', geo: { lat: 45.07, lon: 7.69 } })
    const place = (await db.places.get(pid))!
    const id = await createTask({ title: 'Swim' })
    await setTaskLocation(id, locationFromPlace(place))
    await updatePlace(pid, { name: 'Gym (new)', geo: { lat: 45.08, lon: 7.7 } })
    const task = (await db.tasks.get(id))!
    const writesToTask = (await db.outbox.toArray()).filter((o) => o.entity === 'task' && o.entityId === id && o.field === 'location')
    expect(writesToTask).toHaveLength(1) // renaming the place wrote nothing to the task
    const map = new Map((await db.places.toArray()).map((p) => [p.id, p]))
    const shown = shownLocation(task, map)!
    expect(locationLabel(shown)).toBe('Gym (new)')
    expect(shown).toMatchObject({ lat: 45.08, lon: 7.7, place: { id: pid } })

    await deletePlace(pid)
    const after = shownLocation(task, new Map((await db.places.toArray()).map((p) => [p.id, p])))!
    expect(after).toMatchObject({ name: 'Gym', address: 'Via Po 2', lat: 45.07, lon: 7.69 })
    expect(after.place).toBeUndefined()
  })

  it('converges per field: a rename and a move from two devices both survive', async () => {
    const { db } = await import('./db')
    const pid = await createPlace({ name: 'Office' })
    await applyOps([remoteOp({ entity: 'place', entityId: pid, field: 'name', value: 'Office HQ', ts: Date.now() + 1000, device: 'B' })])
    await applyOps([remoteOp({ entity: 'place', entityId: pid, field: 'geo', value: { lat: 1, lon: 2 }, ts: Date.now() + 1001, device: 'C' })])
    const p = (await db.places.get(pid))!
    expect(p.name).toBe('Office HQ')
    expect(p.geo).toEqual({ lat: 1, lon: 2 })
  })

  it('orders and filters places', async () => {
    const { db } = await import('./db')
    const a = await createPlace({ name: 'A' })
    const b = await createPlace({ name: 'B' })
    await reorderPlaces([b, a])
    const live = sortedPlaces(await db.places.toArray() as Place[])
    expect(live.map((p) => p.name)).toEqual(['B', 'A'])
    await deletePlace(a)
    expect(sortedPlaces(await db.places.toArray() as Place[]).map((p) => p.name)).toEqual(['B'])
    await expect(createPlace({ name: '  ' })).rejects.toThrow()
  })
})

describe('maps switch', () => {
  it('reads anything but "off" as on and syncs the choice', async () => {
    expect(mapsPrefOn(null)).toBe(true)
    expect(mapsPrefOn({ maps: '' })).toBe(true)
    expect(mapsPrefOn({ maps: 'off' })).toBe(false)
    await setMapsPref(false)
    const { db } = await import('./db')
    expect((await db.userPrefs.get('me'))?.maps).toBe('off')
    expect((await db.outbox.toArray()).some((o) => o.entity === 'user_prefs' && o.field === 'maps' && o.value === 'off')).toBe(true)
  })
})
