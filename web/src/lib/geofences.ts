// Location reminders on this device (OpenSpec change location-reminders, design
// D2, D3, D4). A reminder of kind `arrive` or `leave` fires on a phone that
// crosses the circle of `radius_m` around its task's location; the native shell
// watches the circles, never the web app or the server. This module decides which
// location reminders are armed, builds what `scheduleGeofences` hands the shell,
// and keeps the per-device switch "Location reminders on this phone". Outside a
// shell with the `geofences` capability nothing here calls the shell.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from './db'
import { encryptionSnapshot } from './e2ee'
import { has, NO_GEOFENCES, scheduleGeofences, type ShellGeofence, type ShellGeofencePayload, type ShellLocationPermission } from './shell'
import type { Place, Reminder, Task } from './types'

/** The per-device switch, off by default (D4). */
export const META_SHELL_GEOFENCES = 'shell:geofences'
/** Shared with web push and the time reminders: whether notifications carry task titles. */
const META_INCLUDE = 'push:includeContent'

/** At most this many regions reach the shell; it registers the nearest 19 of them (D3). */
export const MAX_GEOFENCES = 100
export const MIN_RADIUS = 100
export const MAX_RADIUS = 5000
export const DEFAULT_RADIUS = 150
/** The radius presets of the task panel's form (D5). */
export const RADIUS_PRESETS = [100, 150, 300, 500, 1000] as const

export type LocationKind = 'arrive' | 'leave'

/** Whether a reminder kind is one of the location kinds. */
export function isLocationKind(kind: string | null | undefined): kind is LocationKind {
  return kind === 'arrive' || kind === 'leave'
}

/** A location reminder's radius: the stored one within 100–5,000 m, else the default. */
export function radiusOf(r: Pick<Reminder, 'radius_m'>): number {
  const m = r.radius_m
  return typeof m === 'number' && Number.isFinite(m) ? Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(m))) : DEFAULT_RADIUS
}

/** A finite latitude and longitude, or null. */
function point(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  return typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

/**
 * The point a task's location reminders watch: the linked place's current position
 * when the task links one that exists and is readable here (task-locations
 * "Places"), else the task's own coordinates. Null without coordinates, and when the
 * location (or the place) is encrypted and cannot be read on this device.
 */
export function reminderPoint(task: Pick<Task, 'location'>, places: ReadonlyMap<string, Pick<Place, 'geo' | 'deleted_at'>>): { lat: number; lon: number } | null {
  const loc = task.location
  if (!loc || typeof loc !== 'object') return null
  const place = loc.place_id ? places.get(loc.place_id) : undefined
  if (place && !place.deleted_at && place.geo && typeof place.geo === 'object') {
    const p = point(place.geo.lat, place.geo.lon)
    if (p) return p
  }
  return point(loc.lat, loc.lon)
}

/** D2: armed while live and not dismissed, its task open and not in the Trash, with a point. */
export function isArmed(r: Reminder, task: Task | undefined, places: ReadonlyMap<string, Pick<Place, 'geo' | 'deleted_at'>>): boolean {
  if (!isLocationKind(r.kind) || r.deleted_at || r.dismissed_at != null) return false
  if (!task || task.deleted_at || task.completed_at) return false
  return reminderPoint(task, places) !== null
}

/**
 * What `scheduleGeofences` hands the shell: every armed location reminder, at most
 * 100, sorted by reminder id for a stable payload. Titles only when the device's
 * include-titles option is on and the account is not encrypted.
 */
export function shellGeofences(
  reminders: readonly Reminder[], tasks: readonly Task[], places: readonly Place[],
  opts: { titles: boolean; encrypted: boolean },
): ShellGeofencePayload {
  const byTask = new Map(tasks.map((task) => [task.id, task]))
  const byPlace = new Map(places.map((p) => [p.id, p]))
  const regions: ShellGeofence[] = []
  for (const r of [...reminders].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const task = byTask.get(r.task_id)
    if (!isArmed(r, task, byPlace) || !task) continue
    const p = reminderPoint(task, byPlace)
    if (!p) continue
    const region: ShellGeofence = { id: r.id, taskId: r.task_id, lat: p.lat, lon: p.lon, radius: radiusOf(r), on: r.kind as LocationKind }
    if (opts.titles && !opts.encrypted && task.title) region.title = task.title
    regions.push(region)
    if (regions.length === MAX_GEOFENCES) break
  }
  return { version: 1, regions }
}

/**
 * Whether location reminders can fire on this device (D5): a shell with
 * `geofences` and "Location reminders on this phone" on. Elsewhere the task panel
 * says "Fires on your phone".
 */
export function useGeofencesHere(): boolean {
  const on = useLiveQuery(async () => (await db.meta.get(META_SHELL_GEOFENCES))?.value === true, [], false)
  return has('geofences') && on === true
}

/** Whether this device watches location reminders (D4). */
export async function geofencesEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_SHELL_GEOFENCES, false)
}

/**
 * Computes and hands over the armed regions now: none while the switch is off, the
 * encrypted account is locked, or the shell lacks `geofences` (then null).
 */
export async function publishGeofences(mode: 'change' | 'ask' | 'check' = 'change'): Promise<ShellLocationPermission | null> {
  if (!has('geofences')) return null
  const enc = encryptionSnapshot()
  if (!(await geofencesEnabled()) || (enc.enabled && !enc.unlocked)) return scheduleGeofences(NO_GEOFENCES, mode === 'check')
  const [reminders, tasks, places, titles] = await Promise.all([
    db.reminders.toArray(), db.tasks.toArray(), db.places.toArray(), getMeta<boolean>(META_INCLUDE, false),
  ])
  const payload = shellGeofences(reminders, tasks, places, { titles, encrypted: enc.enabled })
  return scheduleGeofences(mode === 'ask' ? { ...payload, ask: true } : payload, mode === 'check')
}

/**
 * Turns "Location reminders on this phone" on or off. Turning it on hands over the
 * regions, which makes the shell ask for background location; anything but
 * `granted` turns the switch back off and arms nothing (D4). Null without the capability.
 */
export async function setShellGeofences(on: boolean): Promise<ShellLocationPermission | null> {
  if (!has('geofences')) return null
  await setMeta(META_SHELL_GEOFENCES, on)
  if (!on) {
    await scheduleGeofences(NO_GEOFENCES)
    return null
  }
  const answer = await publishGeofences('ask')
  if (answer !== 'granted') {
    await setMeta(META_SHELL_GEOFENCES, false)
    await scheduleGeofences(NO_GEOFENCES)
  }
  return answer
}

/** The background location state without asking (Settings shows it while the switch is off too). */
export async function geofencePermission(): Promise<ShellLocationPermission | null> {
  return publishGeofences('check')
}
