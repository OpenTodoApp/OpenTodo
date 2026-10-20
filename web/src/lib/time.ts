// Tracked time, the pure part (OpenSpec change `time-tracking`, design D2, D3, D8):
// the one-running-entry rule and its repair, the minutes of an entry, the day an
// entry belongs to, totals and the CSV export. No database, no request, no write;
// the actions that write entries are in timeEntries.ts. internal/timetrack is the
// Go twin, pinned by the fixtures in internal/timetrack/testdata (time.test.ts).
import { isCiphertext } from './crypto'
import { addDaysISO, currentDayStart, logicalDay } from './dates'
import { formatMinutes } from './duration'
import { t } from './i18n'
import type { FieldDef, Label, Project, Task, TimeEntry } from './types'

/** The part of an entry the rules read. */
export type EntryLike = Pick<TimeEntry, 'id' | 'task_id' | 'user_id' | 'started_at' | 'ended_at' | 'deleted_at'> & Partial<Pick<TimeEntry, 'note'>>

/** One `ended_at` value to write. */
export interface Repair {
  id: string
  ended_at: number
}

/** Whether an entry is live and has no end. */
export const isRunning = (e: EntryLike): boolean => !e.deleted_at && e.ended_at === null

/** The order of running entries: the greatest started_at, then the greatest id. */
function wins(a: EntryLike, b: EntryLike): number {
  if (a.started_at !== b.started_at) return b.started_at - a.started_at
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

function runningOf<T extends EntryLike>(entries: readonly T[], userId: string): T[] {
  return entries.filter((e) => e.user_id === userId && isRunning(e)).sort(wins)
}

/** The user's one running entry: the greatest started_at, ties by the greatest id; null when none runs. */
export function running<T extends EntryLike>(entries: readonly T[], userId: string): T | null {
  return runningOf(entries, userId)[0] ?? null
}

/**
 * Every other running entry of the user, ended at the kept one's started_at
 * (design D2). Every device computes the same values, so the repair converges.
 */
export function repairs(entries: readonly EntryLike[], userId: string): Repair[] {
  const r = runningOf(entries, userId)
  if (r.length < 2) return []
  return r.slice(1).map((e) => ({ id: e.id, ended_at: r[0].started_at })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** What starting (or stopping) at `at` writes besides a new entry: the repairs, and the kept entry ended at `at`. */
export function startBatch(entries: readonly EntryLike[], userId: string, at: number): Repair[] {
  const keep = running(entries, userId)
  if (!keep) return []
  return [...repairs(entries, userId), { id: keep.id, ended_at: Math.max(at, keep.started_at) }]
}

/** Whole minutes of an entry: max(0, (ended_at or now) − started_at), rounded down. */
export function minutesOf(e: Pick<EntryLike, 'started_at' | 'ended_at'>, now: number): number {
  const end = e.ended_at ?? now
  return end <= e.started_at ? 0 : Math.floor((end - e.started_at) / 60000)
}

/**
 * The logical day (YYYY-MM-DD) an entry belongs to: the day its start falls on,
 * in `zone` when given, else the device's zone, with the day start (day-boundary).
 * An entry across midnight belongs whole to the day it started.
 */
export function entryDay(startedAt: number, zone?: string, dayStart = currentDayStart()): string {
  if (!zone) return logicalDay(startedAt, dayStart)
  // The rule of stats.ts dayInZone, kept here so the two modules do not import each other.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(startedAt)).map((p) => [p.type, p.value]))
  const iso = `${parts.year}-${parts.month}-${parts.day}`
  return dayStart > 0 && Number(parts.hour) * 60 + Number(parts.minute) < dayStart ? addDaysISO(iso, -1) : iso
}

/** Every member's live minutes per task, a running entry to `now` (rows, the filter, the panel). */
export function totalsByTask(entries: readonly EntryLike[], now: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) if (!e.deleted_at) out.set(e.task_id, (out.get(e.task_id) ?? 0) + minutesOf(e, now))
  return out
}

/** The user's own live minutes that started on `day` (Today's header), on the tasks `liveTask` accepts. */
export function ownMinutesOnDay(entries: readonly EntryLike[], me: string | null, day: string, now: number, liveTask: (id: string) => boolean = () => true, dayOf: (ms: number) => string = (ms) => entryDay(ms)): number {
  let n = 0
  for (const e of entries) if (!e.deleted_at && e.user_id === me && liveTask(e.task_id) && dayOf(e.started_at) === day) n += minutesOf(e, now)
  return n
}

const HOURS = /^(\d+(?:\.\d+)?)h(?:(\d{1,2})(?:m|min)?)?$/
const MINUTES = /^(\d+)(?:m|min|mins|minutes)?$/
/** The longest typed duration: 100 days. */
export const MAX_DURATION = 144000

/**
 * A typed duration in minutes (design D9): 30m, 45min, 1h, 1h30, 1h30m, 1.5h or a
 * bare number of minutes; null otherwise. No `+`, no clock reading, units are not
 * translated. The twin of timetrack.ParseDuration; the filter grammar uses it.
 */
export function durationMinutes(input: string): number | null {
  const t = input.trim().toLowerCase()
  let m = HOURS.exec(t)
  if (m) {
    const mins = m[2] ? Number(m[2]) : 0
    if (mins > 59) return null
    const total = Math.round(Number(m[1]) * 60 + mins)
    return total <= MAX_DURATION ? total : null
  }
  m = MINUTES.exec(t)
  if (m) {
    const n = Number(m[1])
    return n <= MAX_DURATION ? n : null
  }
  return null
}

// ---- words (rows, the indicator, the Time tab) ----

/** Minutes for a screen reader: "1 hour 5 minutes", "35 minutes", "2 hours". */
export function spokenMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return [
    h > 0 ? t('{n, plural, one {# hour} other {# hours}}', { n: h }) : null,
    m > 0 || h === 0 ? t('{n, plural, one {# minute} other {# minutes}}', { n: m }) : null,
  ].filter(Boolean).join(' ')
}

/** The row figure (task-list-presentation "Metadata language"): `35m / 1h`, or `35m tracked` without an estimate. */
export function trackedText(tracked: number, estimate: number | null): string {
  return estimate ? `${formatMinutes(tracked)} / ${formatMinutes(estimate)}` : t('{tracked} tracked', { tracked: formatMinutes(tracked) })
}

/** Its accessible name: "35 minutes tracked of 1 hour estimated". */
export function trackedLabel(tracked: number, estimate: number | null): string {
  return estimate
    ? t('{tracked} tracked of {estimate} estimated', { tracked: spokenMinutes(tracked), estimate: spokenMinutes(estimate) })
    : t('{tracked} tracked', { tracked: spokenMinutes(tracked) })
}

/** The indicator's clock: `25m` under an hour, `1:05` from one hour (time-tracking "Running indicator"). */
export function elapsedText(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** Today's header figures (time-tracking D4): "3h planned · 1h 20m tracked"; null when both are zero. */
export function dayTotalsText(planned: number, tracked: number): string | null {
  if (!planned && !tracked) return null
  return t('{planned} planned · {tracked} tracked', { planned: formatMinutes(planned), tracked: formatMinutes(tracked) })
}

// ---- the CSV export (design D8) ----

/** The fixed columns; custom field columns follow. */
export const CSV_HEADER = ['date', 'start', 'end', 'minutes', 'task', 'project', 'labels', 'note'] as const
/** Starts the file so spreadsheets read it as UTF-8. */
export const BOM = '\uFEFF'
/** What the CSV shows for a text this device holds only as ciphertext. */
export const ENCRYPTED = '[encrypted]'

type CsvTask = Pick<Task, 'id' | 'title' | 'project_id' | 'labels' | 'deleted_at'> & { fields?: Record<string, unknown> }
type CsvProject = Pick<Project, 'id' | 'name' | 'deleted_at'>
type CsvField = Pick<FieldDef, 'id' | 'project_id' | 'name' | 'position' | 'deleted_at'>

export interface CsvInput {
  entries: readonly EntryLike[]
  tasks: readonly CsvTask[]
  projects: readonly CsvProject[]
  labels: readonly Pick<Label, 'id' | 'name'>[]
  fields: readonly CsvField[]
  /** IANA zone of the times; the device's zone when absent. */
  zone?: string
  dayStart?: number
  now: number
  /** Inclusive logical days; '' or absent for open. */
  from?: string
  to?: string
}

const display = (s: string | null | undefined): string => (isCiphertext(s ?? '') ? ENCRYPTED : s ?? '')
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The entries of an export: live entries of live tasks (not in a trashed project) started on a day in [from, to], oldest first. */
export function csvRows(input: CsvInput): EntryLike[] {
  const tasks = new Map(input.tasks.map((t) => [t.id, t]))
  const trashed = new Set(input.projects.filter((p) => p.deleted_at).map((p) => p.id))
  const day = (ms: number) => entryDay(ms, input.zone, input.dayStart ?? currentDayStart())
  return input.entries
    .filter((e) => {
      const t = tasks.get(e.task_id)
      if (e.deleted_at || !t || t.deleted_at || (t.project_id && trashed.has(t.project_id))) return false
      const d = day(e.started_at)
      return (!input.from || d >= input.from) && (!input.to || d <= input.to)
    })
    .sort((a, b) => a.started_at - b.started_at || byId(a, b))
}

function clockOf(ms: number, zone?: string): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return f.format(new Date(ms))
}

function fieldText(v: unknown): string {
  if (typeof v === 'string') return display(v)
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return String(v)
  return ''
}

/** One cell (RFC 4180), with a text that starts with = + - @ or a tab defused by an apostrophe. */
export function csvCell(s: string): string {
  if (s && '=+-@\t\r'.includes(s[0]) && !/^[+-][0-9]+(\.[0-9]+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/**
 * The CSV of design D8: a BOM, the header, one row per entry of `csvRows`. Custom
 * field columns are the union of the live fields of every project present, by
 * name, in the order their projects first appear and each project's field order.
 * Lines end with CRLF. Byte for byte the server's CSV for the same rows.
 */
export function toCSV(input: CsvInput): string {
  const rows = csvRows(input)
  const tasks = new Map(input.tasks.map((t) => [t.id, t]))
  const projects = new Map(input.projects.map((p) => [p.id, p.name]))
  const labels = new Map(input.labels.map((l) => [l.id, l.name]))
  const byProject = new Map<string, CsvField[]>()
  for (const f of input.fields) {
    if (f.deleted_at) continue
    const list = byProject.get(f.project_id) ?? []
    list.push(f)
    byProject.set(f.project_id, list)
  }
  for (const list of byProject.values()) list.sort((a, b) => a.position - b.position || byId(a, b))
  const columns: string[] = []
  const seenProject = new Set<string>()
  for (const e of rows) {
    const pid = tasks.get(e.task_id)?.project_id ?? ''
    if (seenProject.has(pid)) continue
    seenProject.add(pid)
    for (const f of byProject.get(pid) ?? []) if (!columns.includes(display(f.name))) columns.push(display(f.name))
  }
  const dayStart = input.dayStart ?? currentDayStart()
  const lines = [[...CSV_HEADER, ...columns]]
  for (const e of rows) {
    const t = tasks.get(e.task_id)!
    const names = (t.labels ?? []).filter((id) => labels.has(id)).map((id) => display(labels.get(id)))
    const values = new Map<string, string>()
    for (const f of byProject.get(t.project_id ?? '') ?? []) {
      const v = t.fields?.[f.id]
      if (v !== undefined && v !== null) values.set(display(f.name), fieldText(v))
    }
    lines.push([
      entryDay(e.started_at, input.zone, dayStart), clockOf(e.started_at, input.zone), e.ended_at === null ? '' : clockOf(e.ended_at, input.zone),
      String(minutesOf(e, input.now)), display(t.title), display(t.project_id ? projects.get(t.project_id) : ''), names.join(';'), display(e.note),
      ...columns.map((c) => values.get(c) ?? ''),
    ])
  }
  return BOM + lines.map((cells) => cells.map(csvCell).join(',') + '\r\n').join('')
}
