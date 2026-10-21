import { t } from './i18n/catalog'
import type { Due } from './types'
import type { DateTimePrefs } from './userPrefs'

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---- the logical day (OpenSpec change day-boundary, design D2) ----
//
// `todayISO` is the calendar date of an instant and keeps that meaning (reminders,
// file names and calendar formatting need it). "Which day is it" for a person is
// the logical day: the local calendar date, or the previous one while the local
// wall time is before their day start (`user_prefs.day_start`, 0 to 360 minutes
// after midnight). Every screen asks through `logicalToday()` (or `useToday()` in
// a component) and every "day of an instant" through `logicalDay()`; the guard in
// todayGuard.test.ts refuses a new bare `todayISO()` elsewhere. Same rule as
// internal/digest LogicalDay.

let dayStartMinutes = 0

/** Sets the day start the pure helpers read by default; DateTimePrefsProvider keeps it current. */
export function setDayStart(minutes: number): void {
  dayStartMinutes = Number.isFinite(minutes) && minutes > 0 && minutes <= 360 ? Math.floor(minutes) : 0
}

/** The day start in minutes after midnight (0 is midnight, the default). */
export function currentDayStart(): number {
  return dayStartMinutes
}

/**
 * The logical day an instant (Unix ms) belongs to: its local calendar date, or the
 * previous date while its local time is before `dayStart` minutes after midnight.
 * Compares the wall clock, so on a daylight-saving night the boundary stays at the
 * stated local time; at 0 it is `todayISO(new Date(ms))`.
 */
export function logicalDay(ms: number, dayStart: number = dayStartMinutes): string {
  const d = new Date(ms)
  const iso = todayISO(d)
  return dayStart > 0 && d.getHours() * 60 + d.getMinutes() < dayStart ? addDaysISO(iso, -1) : iso
}

/** The logical today: the day the person is living in now (see `logicalDay`). */
export function logicalToday(dayStart: number = dayStartMinutes, now: number = Date.now()): string {
  return logicalDay(now, dayStart)
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

/**
 * Fix a timed due to any IANA `zone`, keeping its stored wall date and time
 * (OpenSpec task-detail-redesign, D4): "15:00" becomes 15:00 in that zone. From a
 * floating due this is "fix to that zone"; from a zoned one it re-interprets the
 * clock time in the new zone. Returns null when the due has no time or the zone is
 * unknown, so the caller writes nothing.
 */
export function setDueZone(due: Due, zone: string): Due | null {
  if (!due.time || !isKnownZone(zone)) return null
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
export function viewedTask<T extends { due: Due | null }>(item: T, zone?: string): T {
  if (!isZoned(item.due)) return item
  return { ...item, due: localDueOf(item.due, zone) }
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

export function describeDue(due: Due | null, today = logicalToday(), zone?: string, p: ResolvedDateTime = current): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later'; time: string | null } | null {
  if (!due) return null
  const local = localDueOf(due, zone)
  // The time on its own (calm-rows D4): a row under a heading that already names the day shows only this.
  const at = local.time ? formatTime(local.time, p) : null
  const time = at ? ` ${at}` : ''
  if (local.date < today) return { label: `${formatDate(local.date, 'compact', p, today)}${time}`, tone: 'overdue', time: at }
  if (local.date === today) return { label: `${t('Today')}${time}`, tone: 'today', time: at }
  if (local.date === addDaysISO(today, 1)) return { label: `${t('Tomorrow')}${time}`, tone: 'soon', time: at }
  if (local.date < addDaysISO(today, 7)) return { label: `${weekday(local.date)}${time}`, tone: 'soon', time: at }
  return { label: `${formatDate(local.date, 'compact', p, today)}${time}`, tone: 'later', time: at }
}

/**
 * A due as one phrase in the long style ("Wed 21 Oct 3:00 PM"), in the
 * viewer's zone and the user's date and time formats (ux-feedback-2 D3): the one
 * way a scheduling surface shows a due with its time, never `due.time` raw.
 */
export function formatDueLong(due: Due, zone?: string, p: ResolvedDateTime = current): string {
  const local = localDueOf(due, zone)
  return local.time ? `${formatDate(local.date, 'long', p)} ${formatTime(local.time, p)}` : formatDate(local.date, 'long', p)
}

/** Whole days from calendar date `from` to `to` (both `YYYY-MM-DD`; negative when `to` is earlier). */
export function daysBetweenISO(from: string, to: string): number {
  const utc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/**
 * The countdown of a deadline (OpenSpec change `deadlines`, design D2): `3d`
 * ahead, `Today` on the day, `2d over` after it. Tone `later` beyond seven days,
 * `soon` within seven, `overdue` on the day and after, and also when the task is
 * planned (`dueDate`, a local date) after its deadline. Null without a deadline.
 */
export function describeDeadline(deadline: string | null | undefined, today = logicalToday(), dueDate?: string | null): { label: string; tone: 'overdue' | 'soon' | 'later' } | null {
  if (!deadline) return null
  const days = daysBetweenISO(today, deadline)
  const label = days > 0 ? t('{days}d', { days }) : days === 0 ? t('Today') : t('{days}d over', { days: -days })
  const late = days <= 0 || (!!dueDate && dueDate > deadline)
  return { label, tone: late ? 'overdue' : days <= 7 ? 'soon' : 'later' }
}

export function weekday(iso: string): string {
  return fmt({ weekday: 'long' }).format(dateOf(iso))
}

export function formatShort(iso: string, p: ResolvedDateTime = current): string {
  return formatDate(iso, 'compact', p)
}

/** Heading of a date group; `iso` is already a local date (see `localDueOf`). */
export function formatDateHeading(iso: string, today = logicalToday(), p: ResolvedDateTime = current): string {
  if (iso === today) return t('Today')
  if (iso === addDaysISO(today, 1)) return t('Tomorrow')
  return formatDate(iso, 'heading', p, today)
}

// ---- date and time preferences (OpenSpec change date-time-preferences, design D2) ----
//
// Every user-facing date and time goes through these functions. They take the
// user's preferences resolved once (`system` values filled in from Intl) and read
// a module snapshot by default, which DateTimePrefsProvider keeps current; tests
// pass a resolved value. Month and weekday names come from the interface
// language's locale (app-localization D4: setDateLocale; the browser locale until
// it is set); only the order, the clock and the week start change. With every
// preference on `system` the output is what the app showed before the change:
// dates as the locale writes them and due times as their stored `HH:MM`.

export type DateStyle = 'compact' | 'numeric' | 'long' | 'heading' | 'full'
export type InstantStyle = 'time' | 'date' | 'datetime' | 'long'

export interface ResolvedDateTime {
  /** How dates are written: the locale's way, or a forced order. */
  date: 'system' | 'DM' | 'MD' | 'iso'
  /** Order used to read numeric dates such as 3/11 (the forced order, else the locale's). */
  order: 'DM' | 'MD' | 'YMD'
  /** How times are written: due times stay `HH:MM` on `system`; instants follow the locale. */
  time: 'system' | '12h' | '24h'
  /** Whether a time is shown on a 12-hour clock (the locale's choice on `system`). */
  hour12: boolean
  /** First day of the week, 0 = Sunday … 6 = Saturday. */
  weekStart: number
  /** Bumped whenever the snapshot changes; part of every cache key. */
  version: number
}

/** What `system` means on this device. */
export interface SystemDateTime {
  order: 'DM' | 'MD' | 'YMD'
  hour12: boolean
  weekStart: number
}

let systemCache: SystemDateTime | null = null
/** The locale for month and weekday names and for `system` (app-localization D4); undefined is the browser's. */
let dateLocale: string | undefined

/** Sets the locale dates are written in (the interface language's, see lib/i18n). Clears the caches keyed by it. */
export function setDateLocale(locale: string | undefined): void {
  if (locale === dateLocale) return
  dateLocale = locale
  systemCache = null
  dateFormatters.clear()
}

/** The locale dates are written in; undefined means the browser's. */
export function dateLocaleOf(): string | undefined { return dateLocale }

/** The date locale's order, clock and first day of the week (Monday when the browser cannot tell). */
export function systemDateTime(): SystemDateTime {
  if (systemCache) return systemCache
  let order: SystemDateTime['order'] = 'MD'
  let hour12 = false
  let weekStart = 1
  try {
    const parts = new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(2026, 10, 3))
    const at = (type: string) => parts.findIndex((x) => x.type === type)
    order = at('year') < at('month') ? 'YMD' : at('day') < at('month') ? 'DM' : 'MD'
    const cycle = new Intl.DateTimeFormat(dateLocale, { hour: 'numeric' }).resolvedOptions().hourCycle
    hour12 = cycle === 'h12' || cycle === 'h11'
    const locale = new Intl.DateTimeFormat(dateLocale).resolvedOptions().locale
    const loc = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
    const first = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay
    if (typeof first === 'number' && first >= 1 && first <= 7) weekStart = first % 7
  } catch {
    // keep the fallbacks
  }
  systemCache = { order, hour12, weekStart }
  return systemCache
}

const WEEK_START: Record<string, number> = { sun: 0, mon: 1, sat: 6 }
let version = 0

/** Fills in `system` values. Unknown values are read as `system` (lib/userPrefs). */
export function resolveDateTime(prefs: DateTimePrefs, sys: SystemDateTime = systemDateTime()): ResolvedDateTime {
  const date = prefs.date_format === 'day-month' ? 'DM' : prefs.date_format === 'month-day' ? 'MD' : prefs.date_format === 'iso' ? 'iso' : 'system'
  return {
    date,
    order: date === 'DM' || date === 'MD' ? date : date === 'iso' ? 'YMD' : sys.order,
    time: prefs.time_format === '12h' || prefs.time_format === '24h' ? prefs.time_format : 'system',
    hour12: prefs.time_format === '12h' ? true : prefs.time_format === '24h' ? false : sys.hour12,
    weekStart: WEEK_START[prefs.week_start] ?? sys.weekStart,
    version: 0,
  }
}

let current: ResolvedDateTime = resolveDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })

/** The snapshot every formatter reads by default. */
export function currentDateTime(): ResolvedDateTime {
  return current
}

/** Replaces the snapshot (DateTimePrefsProvider; tests). Returns the new value. */
export function setDateTime(prefs: DateTimePrefs, sys?: SystemDateTime): ResolvedDateTime {
  current = { ...resolveDateTime(prefs, sys), version: ++version }
  return current
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts)
  let f = dateFormatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(dateLocale, opts)
    dateFormatters.set(key, f)
  }
  return f
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A calendar date (`YYYY-MM-DD`) as text.
 * - compact: `14 Oct` / `Oct 14` (a year is added outside the current year)
 * - numeric: `14/10/2026` / `10/14/2026`
 * - long: `Wed 14 Oct` / `Wed, Oct 14` (the reminder list)
 * - heading: `Wednesday 14 Oct` / `Wednesday, Oct 14` (date group headings)
 * - full: `Wednesday 14 October` / `Wednesday, October 14` (the display's date, display-mode)
 * With `iso` every style shows `2026-10-14`, after the weekday for long and heading.
 */
export function formatDate(iso: string, style: DateStyle, p: ResolvedDateTime = current, today = logicalToday()): string {
  const dt = dateOf(iso)
  if (Number.isNaN(dt.getTime())) return iso
  const otherYear = iso.slice(0, 4) !== today.slice(0, 4)
  const wd = style === 'long' ? fmt({ weekday: 'short' }).format(dt) : style === 'heading' || style === 'full' ? fmt({ weekday: 'long' }).format(dt) : ''
  if (p.date === 'iso') return wd ? `${wd} ${iso}` : iso
  if (p.date === 'system') {
    switch (style) {
      case 'numeric': return fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt)
      case 'compact': return fmt(otherYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }).format(dt)
      case 'long': return fmt(otherYear ? { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }).format(dt)
      case 'heading': return fmt({ weekday: 'long', month: 'short', day: 'numeric' }).format(dt)
      case 'full': return fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(dt)
    }
  }
  const day = dt.getDate()
  const year = dt.getFullYear()
  if (style === 'numeric') {
    return p.date === 'DM' ? `${pad(day)}/${pad(dt.getMonth() + 1)}/${year}` : `${pad(dt.getMonth() + 1)}/${pad(day)}/${year}`
  }
  // The forced order is the locale's own: let Intl write it, with the language's
  // punctuation ("3. Nov." in German, "3 nov." in French).
  if (p.date === systemDateTime().order) {
    const withYear = otherYear && style !== 'heading' && style !== 'full'
    const month: Intl.DateTimeFormatOptions['month'] = style === 'full' ? 'long' : 'short'
    const weekdayOpt: Intl.DateTimeFormatOptions['weekday'] = style === 'long' ? 'short' : style === 'heading' || style === 'full' ? 'long' : undefined
    return fmt({ ...(weekdayOpt ? { weekday: weekdayOpt } : {}), ...(withYear ? { year: 'numeric' } : {}), month, day: 'numeric' }).format(dt)
  }
  const month = fmt({ month: style === 'full' ? 'long' : 'short' }).format(dt)
  const withYear = otherYear && style !== 'heading' && style !== 'full'
  if (p.date === 'DM') return `${wd ? `${wd} ` : ''}${day} ${month}${withYear ? ` ${year}` : ''}`
  return `${wd ? `${wd}, ` : ''}${month} ${day}${withYear ? `, ${year}` : ''}`
}

/**
 * A wall-clock time (`HH:MM`, as stored in a due) as text: `3:00 PM` on a
 * 12-hour clock, `15:00` on a 24-hour one, and the stored value on `system`.
 */
export function formatTime(hhmm: string, p: ResolvedDateTime = current): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m || p.time === 'system') return hhmm
  const h = Number(m[1])
  if (p.time === '24h') return `${pad(h)}:${m[2]}`
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${dayPeriod(h)}`
}

/** "AM"/"PM" as the date locale writes them ("a. m."/"p. m." in Spanish). */
function dayPeriod(hour: number): string {
  const part = fmt({ hour: 'numeric', hourCycle: 'h12' }).formatToParts(new Date(2026, 0, 1, hour)).find((x) => x.type === 'dayPeriod')
  return part?.value ?? (hour < 12 ? 'AM' : 'PM')
}

/**
 * A wall clock (display-mode): hours and minutes, plus seconds when asked, on the
 * user's clock (`15:04:05`, `3:04:05 PM`; the locale's clock on `system`).
 */
export function formatClock(ms: number, seconds: boolean, p: ResolvedDateTime = current): string {
  const d = new Date(ms)
  if (p.time === 'system') return fmt(seconds ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { hour: 'numeric', minute: '2-digit' }).format(d)
  const h = d.getHours()
  const rest = `${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`
  if (p.time === '24h') return `${pad(h)}:${rest}`
  return `${h % 12 === 0 ? 12 : h % 12}:${rest} ${dayPeriod(h)}`
}

/** An hour of the day (0–23) for grid labels: `9 AM` on a 12-hour clock, else `09:00`. */
export function formatHour(hour: number, p: ResolvedDateTime = current): string {
  if (p.time === '12h') return `${hour % 12 === 0 ? 12 : hour % 12} ${dayPeriod(hour)}`
  return `${pad(hour)}:00`
}

/**
 * An instant (Unix ms) in the viewer's zone. `time` and `datetime` follow the
 * locale's clock on `system` (as the app's timestamps always did); `long` is the
 * reminder list form, `Tue 3 Nov, 09:00`.
 */
export function formatInstant(ms: number, style: InstantStyle, p: ResolvedDateTime = current, today = todayISO()): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const iso = todayISO(d)
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const time = p.time === 'system' ? fmt({ hour: 'numeric', minute: '2-digit' }).format(d) : formatTime(hhmm, p)
  switch (style) {
    case 'time': return time
    case 'date': return formatDate(iso, 'compact', p, today)
    case 'long': return `${formatDate(iso, 'long', p, today)}, ${time}`
    default: return `${formatDate(iso, 'compact', p, today)}, ${time}`
  }
}

/** The first day (`YYYY-MM-DD`) of the week that contains `iso`. */
export function weekStartOf(iso: string, p: ResolvedDateTime = current): string {
  const back = (dateOf(iso).getDay() - p.weekStart + 7) % 7
  return addDaysISO(iso, -back)
}

/** The seven days of the week that contains `iso`, starting on the preferred first day. */
export function weekDays(iso: string, p: ResolvedDateTime = current): string[] {
  const start = weekStartOf(iso, p)
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
}

/** A quick choice of the When popover's date segments (task-panel-polish D2). */
export interface QuickChoice {
  id: string
  label: string
  /** The date it means, `null` for "No date", `'someday'` for Someday. */
  date: string | null | 'someday'
}

/**
 * The quick choices of a date segment, from one table so the words match the row and
 * the quick-add parser: Do on (Today, Tomorrow, This weekend, Next week, No date),
 * Start (Today, Tomorrow, Next week, Someday) and Deadline (End of week, End of
 * month, In 2 weeks). Weeks follow the user's first day of the week.
 */
export function quickChoices(kind: 'due' | 'start' | 'deadline', today = logicalToday(), p: ResolvedDateTime = current): QuickChoice[] {
  const weekStart = weekStartOf(today, p)
  const nextWeek = addDaysISO(weekStart, 7)
  // This weekend: the coming Saturday, or today on a weekend day.
  const dow = dateOf(today).getDay()
  const weekend = dow === 6 || dow === 0 ? today : addDaysISO(today, 6 - dow)
  const [y, m] = today.split('-').map(Number)
  const endOfMonth = `${today.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  switch (kind) {
    case 'due': return [
      { id: 'today', label: t('Today'), date: today },
      { id: 'tomorrow', label: t('Tomorrow'), date: addDaysISO(today, 1) },
      { id: 'weekend', label: t('This weekend'), date: weekend },
      { id: 'next-week', label: t('Next week'), date: nextWeek },
      { id: 'none', label: t('No date'), date: null },
    ]
    case 'start': return [
      { id: 'today', label: t('Today'), date: today },
      { id: 'tomorrow', label: t('Tomorrow'), date: addDaysISO(today, 1) },
      { id: 'next-week', label: t('Next week'), date: nextWeek },
      { id: 'someday', label: t('Someday'), date: 'someday' },
    ]
    case 'deadline': return [
      { id: 'end-of-week', label: t('End of week'), date: addDaysISO(weekStart, 6) },
      { id: 'end-of-month', label: t('End of month'), date: endOfMonth },
      { id: 'two-weeks', label: t('In 2 weeks'), date: addDaysISO(today, 14) },
    ]
  }
}
