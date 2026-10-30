// Calendar frames (OpenSpec change calendar-frames): recurring background
// windows on the Day and Week grid, such as "Deep work" on weekdays from 09:00 to
// 11:00. A frame is a personal synced entity (design D1); its occurrences are
// derived here for the shown range and never stored (D2), the same way as
// internal/frames, pinned by frames.vectors.json. Frames never place, move or
// block anything: capacity and re-planning ignore them (D3).
import { useLiveQuery } from 'dexie-react-hooks'
import { addDaysISO, formatDateParts } from './dates'
import { db } from './db'
import { t } from './i18n'
import { uuid } from './ids'
import { getDeviceId, mutate, mutateMany } from './ops'
import { createStore } from './store'
import type { Frame } from './types'
import { applyBatch } from './undo'
import type { AssistantUndo } from './db'

/** Live frames one user may keep (design D5). */
export const MAX_FRAMES = 50
/** The longest title, in characters (design D1). */
export const MAX_FRAME_TITLE = 200
/** Frame times step by this many minutes in the form (design D1). */
export const FRAME_STEP = 15

/** One frame on one date, in minutes after midnight (floating wall times). */
export interface FrameOccurrence {
  frame: Frame
  date: string
  start: number
  end: number
}

/** Minutes after midnight of a wall time "HH:MM" (00:00–23:59), or null. */
export function clockMinutes(s: string | null | undefined): number | null {
  if (typeof s !== 'string' || !/^\d\d:\d\d$/.test(s)) return null
  const h = Number(s.slice(0, 2)), m = Number(s.slice(3))
  return h > 23 || m > 59 ? null : h * 60 + m
}

/** "HH:MM" of minutes after midnight. */
export function clockOf(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The ISO weekdays (1 = Monday … 7 = Sunday) of a stored list, sorted; unreadable entries are ignored. */
export function parseWeekdays(s: string | null | undefined): number[] {
  const out = new Set<number>()
  for (const p of (s ?? '').split(',')) if (/^[1-7]$/.test(p)) out.add(Number(p))
  return [...out].sort((a, b) => a - b)
}

/** The stored form of a weekday list: sorted, distinct, comma-separated. */
export function formatWeekdays(days: Iterable<number>): string {
  return [...new Set([...days].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b).join(',')
}

/** True when the frame's times are two wall times with the end after the start. */
export function frameTimesValid(f: Pick<Frame, 'start' | 'end'>): boolean {
  const s = clockMinutes(f.start), e = clockMinutes(f.end)
  return s !== null && e !== null && e > s
}

/** The ISO weekday of a date "YYYY-MM-DD". */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const js = new Date(y, m - 1, d).getDay()
  return js === 0 ? 7 : js
}

/** Whether a live frame occurs on `date` (design D2). */
export function occursOn(f: Frame, date: string): boolean {
  if (f.deleted_at || !frameTimesValid(f)) return false
  if (f.from_date && date < f.from_date) return false
  if (f.until_date && date > f.until_date) return false
  return parseWeekdays(f.weekdays).includes(isoWeekday(date))
}

/** Occurrences on the dates from..to (inclusive), ordered by date, start, position, id. */
export function frameOccurrences(frames: readonly Frame[], from: string, to: string): FrameOccurrence[] {
  const live = frames.filter((f) => !f.deleted_at && frameTimesValid(f))
    .map((f) => ({ f, start: clockMinutes(f.start)!, end: clockMinutes(f.end)! }))
    .sort((a, b) => a.start - b.start || a.f.position - b.f.position || (a.f.id < b.f.id ? -1 : a.f.id > b.f.id ? 1 : 0))
  const out: FrameOccurrence[] = []
  if (!live.length || from > to) return out
  for (let d = from, n = 0; d <= to && n < 400; d = addDaysISO(d, 1), n++) {
    for (const l of live) if (occursOn(l.f, d)) out.push({ frame: l.f, date: d, start: l.start, end: l.end })
  }
  return out
}

/** An occurrence with its column among the day's overlapping frames (design D3). */
export interface PlacedFrame extends FrameOccurrence {
  lane: number
  lanes: number
}

/** A day's occurrences with overlap columns: overlapping frames share the width side by side. */
export function layoutFrames(day: readonly FrameOccurrence[]): PlacedFrame[] {
  const sorted = [...day].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: PlacedFrame[] = []
  let cluster: PlacedFrame[] = []
  let clusterEnd = -1
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const c of cluster) c.lanes = lanes
    out.push(...cluster)
    cluster = []
  }
  for (const o of sorted) {
    if (cluster.length && o.start >= clusterEnd) close()
    const used = new Set(cluster.filter((c) => c.end > o.start).map((c) => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ ...o, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, o.end)
  }
  if (cluster.length) close()
  return out
}

/** Occurrences grouped by date for the shown dates. */
export function framesByDate(frames: readonly Frame[], dates: readonly string[]): Map<string, PlacedFrame[]> {
  const out = new Map<string, PlacedFrame[]>()
  if (!dates.length || !frames.length) return out
  const all = frameOccurrences(frames, dates[0], dates[dates.length - 1])
  for (const d of dates) {
    const day = all.filter((o) => o.date === d)
    if (day.length) out.set(d, layoutFrames(day))
  }
  return out
}

/**
 * The first free 15-minute start inside an occurrence where `length` minutes fit
 * between the busy intervals (other blocks, busy events), or null (design D4).
 */
export function fitInFrame(occ: { start: number; end: number }, busy: readonly { start: number; end: number }[], length: number, step = FRAME_STEP): number | null {
  const first = Math.ceil(occ.start / step) * step
  for (let s = first; s + length <= occ.end; s += step) {
    if (!busy.some((b) => b.start < s + length && b.end > s)) return s
  }
  return null
}

/** The planning source of a frame: `project:`, `label:` or `view:` and an id, or null. */
export function frameSource(source: string | null | undefined): { kind: 'project' | 'label' | 'view'; id: string } | null {
  const m = /^(project|label|view):(.+)$/.exec(source ?? '')
  return m ? { kind: m[1] as 'project' | 'label' | 'view', id: m[2] } : null
}

// ---- labels ----

const REF_MONDAY = '2026-11-02'
/** A weekday's short name in the interface language ("Mon"). */
export function weekdayName(iso: number, style: 'short' | 'narrow' | 'long' = 'short'): string {
  return formatDateParts(addDaysISO(REF_MONDAY, iso - 1), { weekday: style })
}

/** ISO weekdays in the order of a week starting on `weekStart` (0 = Sunday … 6 = Saturday). */
export function weekOrder(weekStart = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart + i) % 7) || 7)
}

/** "Mon–Fri", "Tue, Thu", "Every day" for a stored weekday list, in the week's order. */
export function weekdaysLabel(weekdays: string, weekStart = 1): string {
  const set = new Set(parseWeekdays(weekdays))
  if (set.size === 7) return t('Every day')
  if (set.size === 0) return t('No days')
  const order = weekOrder(weekStart)
  const runs: number[][] = []
  for (const d of order) {
    if (!set.has(d)) continue
    const last = runs[runs.length - 1]
    if (last && order.indexOf(last[last.length - 1]) === order.indexOf(d) - 1) last.push(d)
    else runs.push([d])
  }
  return runs.map((r) => (r.length >= 3 ? `${weekdayName(r[0])}–${weekdayName(r[r.length - 1])}` : r.map((d) => weekdayName(d)).join(', '))).join(', ')
}

// ---- validation and writes ----

export interface FrameInput {
  title: string
  weekdays: string
  start: string
  end: string
  color: string
  source: string
  from_date: string | null
  until_date: string | null
}

/** The first problem of a form's values, as a message for the person, or null (design D1, D5). */
export function frameInputError(input: FrameInput): string | null {
  if (!input.title.trim()) return t('A frame needs a title')
  if (!parseWeekdays(input.weekdays).length) return t('Choose at least one day')
  if (clockMinutes(input.start) === null || clockMinutes(input.end) === null) return t('Enter times as hours and minutes')
  if (!frameTimesValid(input)) return t('The end must be after the start')
  if (input.from_date && input.until_date && input.until_date < input.from_date) return t('The last day must not be before the first day')
  return null
}

function clean(input: FrameInput): Omit<Frame, 'id' | '_clock' | 'position' | 'created_at' | 'deleted_at'> {
  return {
    title: input.title.trim().slice(0, MAX_FRAME_TITLE),
    weekdays: formatWeekdays(parseWeekdays(input.weekdays)),
    start: input.start, end: input.end, color: input.color, source: input.source,
    from_date: input.from_date || null, until_date: input.until_date || null,
  }
}

/** Creates a frame; throws with a message when the input is invalid or the limit is reached. */
export async function createFrame(input: FrameInput, now = Date.now()): Promise<string> {
  const error = frameInputError(input)
  if (error) throw new Error(error)
  const live = (await db.frames.toArray()).filter((f) => !f.deleted_at)
  if (live.length >= MAX_FRAMES) throw new Error(t('You can keep up to {n} frames.', { n: MAX_FRAMES }))
  const id = uuid()
  const position = Math.max(0, ...live.map((f) => f.position)) + 1024
  await mutate('frame', id, { ...clean(input), position, created_at: now, deleted_at: null })
  return id
}

/** Writes the fields of a frame that changed (one op each); nothing when none did. */
export async function updateFrame(id: string, input: FrameInput): Promise<void> {
  const error = frameInputError(input)
  if (error) throw new Error(error)
  const row = await db.frames.get(id)
  if (!row) return
  const next = clean(input)
  const patch = Object.fromEntries(Object.entries(next).filter(([k, v]) => row[k as keyof Frame] !== v))
  if (Object.keys(patch).length) await mutate('frame', id, patch)
}

/** Puts frames in the given order, writing only positions that change. */
export async function reorderFrames(ids: readonly string[]): Promise<void> {
  const rows = await db.frames.bulkGet([...ids])
  const changes = ids.flatMap((id, i) => {
    const position = (i + 1) * 1024
    return rows[i] && rows[i]!.position !== position ? [{ entity: 'frame' as const, entityId: id, patch: { position } }] : []
  })
  if (changes.length) await mutateMany(changes)
}

/** Deletes a frame (a tombstone) as one undoable batch; returns the undo entry and the toast's text. */
export async function deleteFrameUndoable(id: string, now = Date.now()): Promise<{ entry: AssistantUndo | null; label: string }> {
  const row = await db.frames.get(id)
  if (!row || row.deleted_at) return { entry: null, label: '' }
  await getDeviceId()
  const label = t('Frame deleted')
  const entry = await applyBatch([{ entity: 'frame', entityId: id, patch: { deleted_at: now }, base: { deleted_at: null } }], { source: 'action', label })
  return { entry, label }
}

/** The live frames in their order (position, then creation). */
export function sortedFrames(frames: readonly Frame[]): Frame[] {
  return frames.filter((f) => !f.deleted_at).sort((a, b) => a.position - b.position || a.created_at - b.created_at)
}

// ---- reads for screens ----

const NO_FRAMES: Frame[] = []

/** The live frames in their order. */
export function useFrames(): Frame[] {
  return useLiveQuery(async () => sortedFrames(await db.frames.toArray()), [], NO_FRAMES) ?? NO_FRAMES
}

// ---- plan from a frame (design D4) ----

/** The occurrence the planning list places into while it is open, or null. */
export interface FrameTarget {
  frameId: string
  date: string
  start: number
  end: number
}

/** The placement target of Plan from this frame; cleared when the planning list closes. */
export const frameTarget = createStore<FrameTarget | null>('frameTarget', null)

/** A planning-list source asked for by Plan from this frame; the list takes it when it exists. */
export const frameSourceRequest = createStore<{ key: string; n: number } | null>('frameSourceRequest', null)
