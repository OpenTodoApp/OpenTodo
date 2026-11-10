// The on-device time tools (OpenSpec change assistant-device-reads, D1, D2):
// list_time_entries, list_frames and list_slots of internal/agenttools
// (read_time.go, read_frames.go, read_slots.go) over this device's rows. Minutes
// and logical days are time.ts (pinned to internal/timetrack), frame occurrences
// frames.ts (pinned to internal/frames); this file only shapes results, pinned
// to the server's by read.vectors.json.
import { isCiphertext } from '../crypto'
import { addDaysISO } from '../dates'
import { frameOccurrences } from '../frames'
import { ENCRYPTED, entryDay, minutesOf } from '../time'
import { db } from '../db'
import { readDayStart } from '../userPrefs'
import type { Frame } from '../types'
import { ArgError, ToolError, bool, day, pageLimit, trimmed, zone, type Args } from './args'
import { isoTime, list, liveRows, num, str, visibleTask, type Row, type Snapshot } from './data'
import { todayIn } from './read'

/** The widest range list_frames and list_slots read (MaxFrameDays, MaxSlotDays). */
const MAX_DAYS = 31

const shownTitle = (v: string) => (isCiphertext(v) ? 'Encrypted item' : v)
const endOf = (r: Row): number | null => (typeof r.ended_at === 'number' ? r.ended_at : null)

/** One entry as the tools show it (entryOf). */
function entryOut(e: Row, tasks: Map<string, Row>, userId: string, now: number) {
  const mode = str(e, 'focus_mode')
  const planned = num(e, 'planned_end_at')
  const note = str(e, 'note')
  return {
    id: str(e, 'id'), untrusted_text: { note: isCiphertext(note) ? ENCRYPTED : note, task: shownTitle(str(tasks.get(str(e, 'task_id')), 'title')) },
    task_id: str(e, 'task_id'), user_id: str(e, 'user_id'), tracked_by_you: str(e, 'user_id') === userId,
    started_at: isoTime(num(e, 'started_at')), ended_at: endOf(e) === null ? null : isoTime(endOf(e)!), minutes: minutesOf({ started_at: num(e, 'started_at'), ended_at: endOf(e) }, now),
    focus: mode ? { mode, session: Math.trunc(num(e, 'focus_session')), planned_end_at: planned > 0 ? isoTime(planned) : null } : null,
  }
}

export async function listTimeEntries(snap: Snapshot, a: Args, now: number, maxItems: number) {
  const task = trimmed(a, 'task_id')
  const from = day(a, 'from')
  const to = day(a, 'to')
  if (from && to && to < from) throw new ArgError('to: must not be before from')
  const running = bool(a, 'running')
  const tz = zone(a)
  const max = pageLimit(a, maxItems, maxItems)
  const tasks = new Map(snap.tasks.filter((t) => visibleTask(snap, t)).map((t) => [str(t, 'id'), t]))
  if (task && !tasks.has(task)) throw new ToolError('', 'task not found')
  const dayStart = readDayStart(await db.userPrefs.get('me'))
  const sel = (await liveRows('timeEntries')).filter((e) => {
    if ((task && str(e, 'task_id') !== task) || (running && endOf(e) !== null) || !tasks.has(str(e, 'task_id'))) return false
    if (!from && !to) return true
    const d = entryDay(num(e, 'started_at'), tz, dayStart)
    return !((from && d < from) || (to && d > to))
  }).sort((x, y) => num(y, 'started_at') - num(x, 'started_at') || (str(x, 'id') < str(y, 'id') ? -1 : 1))
  const total = sel.reduce((n, e) => n + minutesOf({ started_at: num(e, 'started_at'), ended_at: endOf(e) }, now), 0)
  return {
    time_entries: sel.slice(0, max).map((e) => entryOut(e, tasks, snap.userId, now)), ...(sel.length > max ? { truncated: true } : {}),
    timezone: tz, total_minutes: total,
  }
}

/** The days from..to of a frames or slots call: today and six days after by default, at most 31 days. */
function range(a: Args, now: number): { from: string; to: string; tz: string } {
  const f = day(a, 'from')
  const t = day(a, 'to')
  const tz = zone(a)
  const from = f || todayIn(tz, now)
  const to = t || addDaysISO(from, 6)
  if (to < from) throw new ArgError('to: must not be before from')
  if (to > addDaysISO(from, MAX_DAYS - 1)) throw new ArgError('to: at most 31 days from from')
  return { from, to, tz }
}

export async function listFrames(_snap: Snapshot, a: Args, now: number) {
  const { from, to, tz } = range(a, now)
  const frames = (await liveRows('frames')).map((f) => ({ ...f, position: num(f, 'position') }) as unknown as Frame)
  const occurrences = frameOccurrences(frames, from, to).map((o) => {
    const f = o.frame as unknown as Row
    return {
      frame_id: str(f, 'id'), untrusted_text: { title: isCiphertext(f.title) ? 'Encrypted frame' : str(f, 'title') }, date: o.date,
      start: str(f, 'start'), end: str(f, 'end'), source: str(f, 'source'), color: str(f, 'color'),
    }
  })
  return { occurrences, from, to, timezone: tz }
}

export async function listSlots(snap: Snapshot, a: Args, now: number) {
  const { from, to, tz } = range(a, now)
  const slots = (await liveRows('slots')).filter((s) => {
    const d = str(s, 'date')
    return d && d >= from && d <= to
  }).map((s) => {
    const date = str(s, 'date')
    const open: unknown[] = []
    const done: unknown[] = []
    for (const id of list(s, 'task_ids')) {
      // A task deleted, unknown here or kept away from assistants is left out; one dated another day too.
      const t = snap.byId.get(id)
      if (!t) continue
      const due = (t.due as { date?: unknown } | null | undefined)?.date
      if (typeof due === 'string' && due !== '' && due !== date) continue
      const finished = t.completed_at !== null && t.completed_at !== undefined
      const item = { id, untrusted_text: { title: shownTitle(str(t, 'title')) }, done: finished, estimate_minutes: typeof t.estimate_minutes === 'number' ? t.estimate_minutes : null }
      ;(finished ? done : open).push(item)
    }
    const title = str(s, 'title')
    return {
      id: str(s, 'id'), untrusted_text: { title: isCiphertext(title) ? 'Encrypted slot' : title || 'Slot' }, date, start: str(s, 'start'),
      minutes: Math.trunc(num(s, 'minutes')), color: str(s, 'color'), tasks: [...open, ...done],
    }
  }).sort((x, y) => (x.date !== y.date ? (x.date < y.date ? -1 : 1) : x.start < y.start ? -1 : x.start > y.start ? 1 : 0))
  return { slots, from, to, timezone: tz }
}
