// find_free_time on the device (OpenSpec change assistant-time-blocks, design D1,
// D3): internal/agenttools read_freetime.go over this device's rows. The free
// stretches are freeTime.ts (pinned to internal/freetime by freeTime.vectors.json);
// this file reads the arguments and shapes the result like the server's. Only
// times are read, so it works the same on an encrypted account.
import { GRID_PREFS_META_KEY, normalizeGridPrefs } from '../calendar'
import { ensureEventsFor } from '../calendarFeeds'
import { daysBetweenISO, instantToLocalDue } from '../dates'
import { db, getMeta } from '../db'
import { freeClock, freeTime, MAX_FREE_DAYS, type FreeWhen } from '../freeTime'
import type { Frame } from '../types'
import { ArgError, calendarDate, int, only, str, zone, type Args } from './args'
import { isDeleted, isOpen, num, str as field, type Row, type Snapshot } from './data'

const MAX_FREE = 12 * 60

/** An optional whole number in [lo, hi] (args.hour). */
function bounded(a: Args, name: string, def: number, lo: number, hi: number): number {
  const n = int(a, name)
  if (n === null) return def
  if (n < lo || n > hi) throw new ArgError(`${name}: must be from ${lo} to ${hi}`)
  return n
}

/** A YYYY-MM-DD argument, trimmed like the server's args.date. */
function day(a: Args, name: string): string {
  const v = str(a, name).trim()
  if (v && !calendarDate(v)) throw new ArgError(`${name}: must be a date in YYYY-MM-DD form`)
  return v
}

/** The date and minute now in a zone. */
function nowIn(tz: string, now: number): { date: string; minute: number } {
  const at = instantToLocalDue(now, tz)
  return { date: at.date, minute: Number(at.time.slice(0, 2)) * 60 + Number(at.time.slice(3, 5)) }
}

export async function findFreeTime(snap: Snapshot, a: Args, now: number) {
  only(a, '', 'from', 'to', 'min_minutes', 'day_start_hour', 'day_end_hour', 'timezone')
  let from = day(a, 'from')
  let to = day(a, 'to')
  const tz = zone(a)
  const least = bounded(a, 'min_minutes', 30, 1, MAX_FREE)
  // The device's own working day when the model names none (the server gets it with the turn).
  const grid = normalizeGridPrefs(await getMeta<unknown>(GRID_PREFS_META_KEY, null).catch(() => null))
  const startH = bounded(a, 'day_start_hour', grid.startHour, 0, 23)
  const endH = bounded(a, 'day_end_hour', grid.endHour, 1, 24)
  if (endH <= startH) throw new ArgError('day_end_hour: must be after day_start_hour')
  const at = nowIn(tz, now)
  if (!from) from = at.date
  if (!to) to = from
  if (to < from) throw new ArgError('to: must not be before from')
  if (daysBetweenISO(from, to) + 1 > MAX_FREE_DAYS) throw new ArgError(`to: at most ${MAX_FREE_DAYS} days from from (the ${MAX_FREE_DAYS}-day limit)`)
  // The calendar's events for the days, fetched like a calendar view does; the cached ones when that fails.
  await ensureEventsFor({ from, to }).catch(() => undefined)
  const [events, frames, slots] = await Promise.all([db.calendarEvents.toArray(), db.frames.toArray(), db.slots.toArray()])
  // Open timed tasks the assistant may read: not in a project gone or kept away (snapshot.visible).
  const tasks = snap.tasks.filter((t) => isOpen(t) && (!field(t, 'project_id') || snap.projects.has(field(t, 'project_id'))))
    .map((t) => ({ due: (t.due as FreeWhen | null | undefined) ?? null, estimate_minutes: num(t, 'estimate_minutes') || null, done: false }))
    .filter((t) => !!t.due?.time)
  const days = freeTime({
    from, to, zone: tz, day_start: startH * 60, day_end: endH * 60, min_minutes: least, today: at.date, now: at.minute,
    events, frames: (frames as unknown as Row[]).filter((f) => !isDeleted(f)).map((f) => ({ ...f, position: num(f, 'position') }) as unknown as Frame),
    slots: (slots as unknown as Row[]).filter((s) => !isDeleted(s)).map((s) => ({ date: field(s, 'date'), start: field(s, 'start'), minutes: Math.trunc(num(s, 'minutes')) })),
    tasks,
  })
  return {
    days: days.map((d) => ({ ...d, free_minutes: d.free.reduce((n, f) => n + f.minutes, 0) })), from, to, min_minutes: least,
    working_day: { start: freeClock(startH * 60), end: freeClock(endH * 60) }, timezone: tz,
  }
}
