// Task locations and places (OpenSpec change task-locations). A task's
// `location` is one value {name?, address?, lat?, lon?, place_id?}; a place is a
// personal, synced entity whose coordinates are one `geo` value. With a
// `place_id` the task shows the place's current members while the place exists,
// and its own snapshot otherwise (design D2). Maps and address search go through
// the server's map proxy and are on unless the server or the user turned them off.
import { useLiveQuery } from 'dexie-react-hooks'
import { api, type MapResult } from './api'
import { db, getMeta, setMeta } from './db'
import { currentLanguage, t } from './i18n'
import { uuid } from './ids'
import { mutate, mutateMany, updateTask } from './ops'
import { USER_PREFS_ID } from './userPrefs'
import type { Geo, Place, Task, TaskLocation, UserPrefs } from './types'

/** Longest name and address the server accepts ("Location validation"). */
export const MAX_NAME = 200
export const MAX_ADDRESS = 500

/** Rounds a coordinate to 6 decimals, about 10 cm (design D8). */
export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

const validLat = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
const validLon = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180

/**
 * A location the server accepts, or null when there is nothing to store: empty
 * strings are dropped, text is trimmed and bounded, coordinates are rounded and
 * kept only as a valid pair.
 */
export function makeLocation(input: { name?: string; address?: string; lat?: number; lon?: number; place_id?: string }): TaskLocation | null {
  const out: TaskLocation = {}
  const name = input.name?.trim().slice(0, MAX_NAME)
  const address = input.address?.trim().slice(0, MAX_ADDRESS)
  if (name) out.name = name
  if (address) out.address = address
  if (validLat(input.lat) && validLon(input.lon)) {
    out.lat = round6(input.lat)
    out.lon = round6(input.lon)
  }
  if (!out.name && !out.address && out.lat === undefined) return null
  if (input.place_id) out.place_id = input.place_id
  return out
}

/** The task's plaintext location, 'encrypted' when this device cannot read it, or null. */
export function locationOf(task: Pick<Task, 'location'> | null | undefined): TaskLocation | 'encrypted' | null {
  const l = task?.location
  if (l === null || l === undefined) return null
  if (typeof l === 'string') return 'encrypted'
  return typeof l === 'object' ? l : null
}

/** The place a task's location links to, or null (also when it cannot be read here). */
export function linkedPlaceId(task: Pick<Task, 'location'>): string | null {
  const loc = locationOf(task)
  return loc && loc !== 'encrypted' ? loc.place_id ?? null : null
}

/** A place's coordinates, 'encrypted' when unreadable here, or null. */
export function geoOf(place: Pick<Place, 'geo'>): Geo | 'encrypted' | null {
  const g = place.geo
  if (g === null || g === undefined) return null
  if (typeof g === 'string') return 'encrypted'
  return validLat(g.lat) && validLon(g.lon) ? g : null
}

/** Whether a place's name or address could not be decrypted on this device. */
export function placeEncrypted(place: Place): boolean {
  return geoOf(place) === 'encrypted' || !!place._e2ee?.raw?.name
}

/** What the panel shows for a task's location (design D2). */
export interface ShownLocation {
  name: string
  address: string
  lat?: number
  lon?: number
  /** The linked place, when the task links to one that exists here. */
  place?: Place
  /** True when the stored value (or the linked place) cannot be read on this device. */
  encrypted: boolean
}

/** The location to show: the live linked place when it exists, the task's own members otherwise. */
export function shownLocation(task: Pick<Task, 'location'>, places: ReadonlyMap<string, Place>): ShownLocation | null {
  const loc = locationOf(task)
  if (loc === null) return null
  if (loc === 'encrypted') return { name: t('Encrypted'), address: '', encrypted: true }
  const place = loc.place_id ? places.get(loc.place_id) : undefined
  if (place && !place.deleted_at && !placeEncrypted(place)) {
    const g = geoOf(place)
    const geo = g && g !== 'encrypted' ? g : undefined
    return { name: place.name, address: place.address, lat: geo?.lat, lon: geo?.lon, place, encrypted: false }
  }
  return { name: loc.name ?? '', address: loc.address ?? '', lat: loc.lat, lon: loc.lon, encrypted: false }
}

/** "45.4642, 9.19": a coordinate pair as people type it. */
export function formatCoordinates(lat: number, lon: number): string {
  const f = (v: number) => String(round6(v))
  return `${f(lat)}, ${f(lon)}`
}

/** The one line a location reads as: its name, else its address, else its coordinates. */
export function locationLabel(shown: ShownLocation): string {
  if (shown.name) return shown.name
  if (shown.address) return shown.address
  if (shown.lat !== undefined && shown.lon !== undefined) return formatCoordinates(shown.lat, shown.lon)
  return ''
}

/**
 * Reads typed coordinates: "45.4642, 9.19", "45.4642 9.19" or "45,4642; 9,19"
 * (decimal commas with a semicolon between). Null when the text is not a valid pair.
 */
export function parseCoordinates(text: string): Geo | null {
  const s = text.trim()
  let pair: [string, string] | null = null
  const m = /^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s)
  if (m) pair = [m[1], m[2]]
  const semi = /^(-?\d{1,3}(?:,\d+)?)\s*;\s*(-?\d{1,3}(?:,\d+)?)$/.exec(s)
  if (!pair && semi) pair = [semi[1].replace(',', '.'), semi[2].replace(',', '.')]
  if (!pair) return null
  const lat = Number(pair[0])
  const lon = Number(pair[1])
  return validLat(lat) && validLon(lon) ? { lat: round6(lat), lon: round6(lon) } : null
}

/**
 * "Open in maps": a `geo:` link on phones (their maps app) and the position on
 * openstreetmap.org on computers ("Setting a location", scenario "Open in maps").
 */
export function openInMapsHref(lat: number, lon: number, phone: boolean): string {
  const a = round6(lat)
  const o = round6(lon)
  return phone ? `geo:${a},${o}?q=${a},${o}` : `https://www.openstreetmap.org/?mlat=${a}&mlon=${o}#map=17/${a}/${o}`
}

/** True on a touch-first phone, where `geo:` opens the maps app. */
export function isPhone(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

// ---- writes ----

/** Sets or clears a task's location as one edit (one whole value, design D1). */
export async function setTaskLocation(taskId: string, location: TaskLocation | null): Promise<void> {
  await updateTask(taskId, { location })
}

/** Creates a place; returns its id. */
export async function createPlace(input: { name: string; address?: string; geo?: Geo | null }): Promise<string> {
  const name = input.name.trim().slice(0, MAX_NAME)
  if (!name) throw new Error(t('A saved location needs a name'))
  const id = uuid()
  const now = Date.now()
  const geo = input.geo && validLat(input.geo.lat) && validLon(input.geo.lon) ? { lat: round6(input.geo.lat), lon: round6(input.geo.lon) } : null
  await mutate('place', id, { name, address: (input.address ?? '').trim().slice(0, MAX_ADDRESS), geo, position: now, created_at: now, deleted_at: null })
  return id
}

/** Renames, re-addresses or moves a place: one op per changed field; no task is written (design D2). */
export async function updatePlace(id: string, patch: Partial<Pick<Place, 'name' | 'address' | 'position'>> & { geo?: Geo | null }): Promise<void> {
  const out: Record<string, unknown> = { ...patch }
  if (patch.name !== undefined) {
    out.name = patch.name.trim().slice(0, MAX_NAME)
    if (!out.name) throw new Error(t('A saved location needs a name'))
  }
  if (patch.address !== undefined) out.address = patch.address.trim().slice(0, MAX_ADDRESS)
  if (patch.geo) out.geo = { lat: round6(patch.geo.lat), lon: round6(patch.geo.lon) }
  await mutate('place', id, out)
}

/** Deletes a place (a tombstone); linked tasks keep their own snapshot (design D2). */
export async function deletePlace(id: string): Promise<void> {
  await mutate('place', id, { deleted_at: Date.now() })
}

/** Puts the places in the given order, writing only the positions that change. */
export async function reorderPlaces(ids: readonly string[]): Promise<void> {
  const places = await db.places.bulkGet([...ids])
  const changes = ids.flatMap((id, i) => {
    const p = places[i]
    const position = (i + 1) * 1024
    return p && p.position !== position ? [{ entity: 'place' as const, entityId: id, patch: { position } }] : []
  })
  if (changes.length) await mutateMany(changes)
}

/** A task's location linking to a place, with the place's members as the snapshot. */
export function locationFromPlace(place: Place): TaskLocation | null {
  const g = geoOf(place)
  const geo = g && g !== 'encrypted' ? g : undefined
  return makeLocation({ name: place.name, address: place.address, lat: geo?.lat, lon: geo?.lon, place_id: place.id })
}

/** The live places in their order (deleted ones left out). */
export function sortedPlaces(places: readonly Place[]): Place[] {
  return places.filter((p) => !p.deleted_at).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

// ---- reads for screens (web-layering: screens never touch the database) ----

const NO_PLACES: Place[] = []

/** Every place row, deleted ones included (a task's linked place may be gone). */
export function usePlaceRows(): Place[] {
  return useLiveQuery(() => db.places.toArray(), [], NO_PLACES) ?? NO_PLACES
}

/** The live places in their order. */
export function useLivePlaces(): Place[] {
  return useLiveQuery(async () => sortedPlaces(await db.places.toArray()), [], NO_PLACES) ?? NO_PLACES
}

/** One place: undefined while loading or without an id, null when it does not exist. */
export function usePlace(id: string | null): Place | null | undefined {
  return useLiveQuery(async () => (id ? (await db.places.get(id)) ?? null : undefined), [id])
}

/** One place, read once (quick add in a location's list). */
export function getPlace(id: string): Promise<Place | undefined> {
  return db.places.get(id)
}

/** The user's own maps switch, live. */
export function useMapsPref(): boolean {
  return mapsPrefOn(useLiveQuery(() => db.userPrefs.get(USER_PREFS_ID), []))
}

// ---- maps switches (design D6) ----

const MAPS_KEY = 'mapsAvailable'

/** Fetches whether maps are on for the server and remembers it; offline keeps the last answer. */
export async function refreshMapsAvailable(): Promise<boolean> {
  try {
    const me = await api.me()
    await setMeta(MAPS_KEY, me.maps === true)
    return me.maps === true
  } catch {
    return getMeta<boolean>(MAPS_KEY, false)
  }
}

/** The user's own switch: anything but "off" reads as on. */
export function mapsPrefOn(row: Partial<UserPrefs> | null | undefined): boolean {
  return row?.maps !== 'off'
}

/** Turns maps on or off for this user on every device (synced). */
export function setMapsPref(on: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { maps: on ? 'on' : 'off' })
}

/** Whether this device shows maps and offers address search: the server's switch and the user's. */
export function useMapsOn(): boolean {
  return (
    useLiveQuery(async () => {
      const [available, prefs] = await Promise.all([getMeta<boolean>(MAPS_KEY, false), db.userPrefs.get(USER_PREFS_ID)])
      return available && mapsPrefOn(prefs)
    }, [], false) ?? false
  )
}

// ---- search ----

/** Searches an address through the server's map proxy, in the interface language. */
export async function searchAddress(q: string): Promise<MapResult[]> {
  return (await api.mapSearch(q, currentLanguage())).results
}

/** The nearest address to a point, or null. */
export async function reverseAddress(lat: number, lon: number): Promise<MapResult | null> {
  return (await api.mapReverse(lat, lon, currentLanguage())).result
}
