import type { Due } from './types'

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return todayISO(dt)
}

// ---- zoned due values (OpenSpec change absolute-datetimes, design D2, D3, D5) ----
//
// A due with `tz` denotes the instant `date time` in that IANA zone; everything the
// UI shows, sorts or groups uses its wall time in the viewer's zone (`localDueOf`).
// Conversion uses the platform's Intl zone data only. The rules match
// internal/zoned (Go) and are checked against the shared zoned.vectors.json: a wall
// time inside a spring-forward gap resolves to the transition (the first valid
// instant after it), one inside an autumn overlap to its first occurrence.

const DAY_MS = 86_400_000

function resolveZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

let currentZone = resolveZone()
const zoneListeners = new Set<() => void>()

/** The viewer's IANA zone, as last resolved. */
export function viewerZone(): string {
  return currentZone
}

/**
 * Re-read the device zone (a travelling device). Returns true and notifies
 * subscribers when it changed.
 */
export function refreshViewerZone(): boolean {
  const z = resolveZone()
  if (z === currentZone) return false
  currentZone = z
  localCache.clear()
  for (const fn of zoneListeners) fn()
  return true
}

/** Subscribe to viewer-zone changes; returns the unsubscribe function. */
export function onViewerZoneChange(fn: () => void): () => void {
  zoneListeners.add(fn)
  return () => zoneListeners.delete(fn)
}

/** Re-resolve the zone whenever the page becomes visible again (design D5). */
export function watchViewerZone(doc: Document = document): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') refreshViewerZone()
  }
  doc.addEventListener('visibilitychange', onVisibility)
  return () => doc.removeEventListener('visibilitychange', onVisibility)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(zone, f)
  }
  return f
}

/** Wall-clock components [y, m, d, hh, mm, ss] of an instant in `zone`. */
function wallOf(ms: number, zone: string): number[] {
  const out = [0, 0, 0, 0, 0, 0]
  const idx: Record<string, number> = { year: 0, month: 1, day: 2, hour: 3, minute: 4, second: 5 }
  for (const p of formatter(zone).formatToParts(new Date(ms))) {
    if (p.type in idx) out[idx[p.type]] = Number(p.value)
  }
  if (out[3] === 24) out[3] = 0
  return out
}

/** Offset of `zone` from UTC at an instant, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const [y, m, d, hh, mm, ss] = wallOf(ms, zone)
  return Date.UTC(y, m - 1, d, hh, mm, ss) - Math.floor(ms / 1000) * 1000
}

/** True when `zone` is a zone name this browser knows. */
export function isKnownZone(zone: string): boolean {
  try {
    formatter(zone)
    return true
  } catch {
    return false
  }
}

/** The instant (Unix ms) of wall time `date` `time` in `zone`, with the gap and overlap rules. */
export function zonedInstant(date: string, time: string, zone: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, hh, mm)
  const before = offsetAt(wall - DAY_MS, zone)
  const after = offsetAt(wall + DAY_MS, zone)
  let best: number | null = null
  for (const o of [before, after]) {
    const c = wall - o
    if (offsetAt(c, zone) === o && (best === null || c < best)) best = c
  }
  if (best !== null) return best
  // Gap: the transition lies in (wall - after, wall - before]; find it to the second.
  let lo = wall - after
  let hi = wall - before
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000
    if (offsetAt(mid, zone) === before) lo = mid
    else hi = mid
  }
  return hi
}

/** The wall date and time of an instant in `zone` (the viewer's by default), as a floating due. */
export function instantToLocalDue(ms: number, zone = viewerZone()): Due & { time: string } {
  const [y, m, d, hh, mm] = wallOf(ms, zone)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return { date: `${p(y, 4)}-${p(m)}-${p(d)}`, time: `${p(hh)}:${p(mm)}` }
}

/** Whether a due is zoned (has a time and a zone). */
export function isZoned(due: Due | null | undefined): due is Due & { time: string; tz: string } {
  return !!due && !!due.tz && !!due.time
}

/**
 * The instant a due denotes: a zoned due in its own zone; a floating one read in
 * `zone` (the viewer's by default), at `fallbackTime` when it has no time.
 */
export function dueToInstant(due: Due, zone = viewerZone(), fallbackTime = '00:00'): number {
  if (isZoned(due)) {
    try {
      return zonedInstant(due.date, due.time, due.tz)
    } catch {
      // A zone this browser does not know: degrade to the floating reading.
    }
  }
  return zonedInstant(due.date, due.time ?? fallbackTime, zone)
}

const localCache = new Map<string, Due>()

/**
 * The due as seen in `zone` (the viewer's by default): the same object for a
 * floating due, the converted wall date and time (no `tz`) for a zoned one. Used
 * for every list, heading, sort order and grouping.
 */
export function localDueOf(due: Due, zone?: string): Due
export function localDueOf(due: Due | null | undefined, zone?: string): Due | null
export function localDueOf(due: Due | null | undefined, zone = viewerZone()): Due | null {
  if (!due) return null
  if (!isZoned(due)) return due
  const key = `${due.date} ${due.time} ${due.tz} ${zone}`
  let out = localCache.get(key)
  if (!out) {
    try {
      out = instantToLocalDue(zonedInstant(due.date, due.time, due.tz), zone)
    } catch {
      out = { date: due.date, time: due.time }
    }
    if (localCache.size > 5000) localCache.clear()
    localCache.set(key, out)
  }
  return out
}

/** The due's calendar date in `zone` (the viewer's by default), or null. */
export function localDate(due: Due | null | undefined, zone?: string): string | null {
  return localDueOf(due, zone)?.date ?? null
}

/** `Berlin`, `Los Angeles`, `UTC`: the readable part of a zone name. */
export function zoneCity(zone: string): string {
  return zone.slice(zone.lastIndexOf('/') + 1).replace(/_/g, ' ')
}

/**
 * The original wall time and zone of a zoned due when the viewer is in another
 * zone (`09:00 Berlin`, or `Oct 12 02:00 Tokyo` when the dates differ); null for a
 * floating due or when the zones are the same.
 */
export function zoneHint(due: Due | null | undefined, zone = viewerZone()): string | null {
  if (!isZoned(due) || due.tz === zone) return null
  const local = localDueOf(due, zone)
  const text = `${due.time} ${zoneCity(due.tz)}`
  return local.date === due.date ? text : `${formatShort(due.date)} ${text}`
}

/** Fix a timed floating due to `zone` (the viewer's), keeping what is displayed. */
export function fixDueToZone(due: Due, zone = viewerZone()): Due {
  if (!due.time || due.tz) return due
  return { date: due.date, time: due.time, tz: zone }
}

/** Release a zoned due to a floating one at the date and time displayed in `zone`. */
export function releaseDue(due: Due, zone = viewerZone()): Due {
  if (!due.tz) return due
  const l = localDueOf(due, zone)
  return l.time ? { date: l.date, time: l.time } : { date: l.date }
}

/**
 * The value to store when the user edits a due as displayed: `view` is in the
 * viewer's zone. A zoned original stays fixed to its zone (the edited wall time is
 * converted back into it); without a time the zone is dropped.
 */
export function dueFromView(original: Due | null | undefined, view: Due | null, zone = viewerZone()): Due | null {
  if (!view) return null
  if (!original?.tz) return view
  if (!view.time) return { date: view.date }
  try {
    const at = zonedInstant(view.date, view.time, zone)
    return { ...instantToLocalDue(at, original.tz), tz: original.tz }
  } catch {
    return { date: view.date, time: view.time }
  }
}

/** A task (or any row with a due) as displayed: its due converted to the viewer's zone. */
export function viewedTask<T extends { due: Due | null }>(t: T, zone?: string): T {
  if (!isZoned(t.due)) return t
  return { ...t, due: localDueOf(t.due, zone) }
}

export function compareDue(a: Due | null, b: Due | null, zone?: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const la = localDueOf(a, zone)
  const lb = localDueOf(b, zone)
  if (la.date !== lb.date) return la.date < lb.date ? -1 : 1
  const ta = la.time ?? '99:99'
  const tb = lb.time ?? '99:99'
  return ta < tb ? -1 : ta > tb ? 1 : 0
}

export function describeDue(due: Due | null, today = todayISO(), zone?: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null {
  if (!due) return null
  const local = localDueOf(due, zone)
  const time = local.time ? ` ${local.time}` : ''
  if (local.date < today) return { label: `${formatShort(local.date)}${time}`, tone: 'overdue' }
  if (local.date === today) return { label: `Today${time}`, tone: 'today' }
  if (local.date === addDaysISO(today, 1)) return { label: `Tomorrow${time}`, tone: 'soon' }
  if (local.date < addDaysISO(today, 7)) return { label: `${weekday(local.date)}${time}`, tone: 'soon' }
  return { label: `${formatShort(local.date)}${time}`, tone: 'later' }
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' })
}

export function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const sameYear = dt.getFullYear() === new Date().getFullYear()
  return dt.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Heading of a date group; `iso` is already a local date (see `localDueOf`). */
export function formatDateHeading(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today'
  if (iso === addDaysISO(today, 1)) return 'Tomorrow'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
