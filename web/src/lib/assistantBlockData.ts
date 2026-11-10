// What the assistant's blocks read from the device (OpenSpec change
// assistant-generative-ui D4): live, so a block shows edits made since the answer,
// and imported only by the lazily loaded block renderers.
import { useLiveQuery } from 'dexie-react-hooks'
import { resettable } from './moduleState'
import { useEffect, useState } from 'react'
import { useOnline } from './online'
import type { AssistantBlock } from './assistantBlocks'
import type { Review } from './assistant'
import { DEFAULT_GRID_PREFS, GRID_PREFS_META_KEY, normalizeGridPrefs } from './calendar'
import { ensureEventsFor } from './calendarFeeds'
import { db, getMeta } from './db'
import { addDaysISO, currentDayStart, daysBetweenISO, formatDate, instantToLocalDue, localDueOf, logicalDay, viewerZone } from './dates'
import { freeTime, type FreeDay } from './freeTime'
import { t } from './i18n'
import { geoOf, locationLabel, placeEncrypted, searchAddress, shownLocation } from './locations'
import { membershipMap, currentUserId } from './sharing'
import { projectActivity, taskActivity } from './activity'
import { todayLimitOf } from './closedList'
import { isInboxTask } from './inbox'
import { lineageRows } from './lineageRows'
import { countedTasks, overdueOf } from './statsCounted'
import { spanOf, type Span } from './timeline'
import { inToday } from './views'
import { entryDay, minutesOf } from './time'
import type { ActivityEvent, Comment, Geo, Note, Place, Project, Section, Task } from './types'
import { readDayStart } from './userPrefs'

/** The block's tasks in order: a row, or null for one that is gone (deleted, or not on this device). */
export function useBlockTasks(ids: readonly string[]): (Task | null)[] | undefined {
  const key = ids.join()
  return useLiveQuery(async () => (await db.tasks.bulkGet([...ids])).map((r) => (r && !r.deleted_at ? r : null)), [key])
}

/** The working day's length on this device (the calendar's grid settings). */
export function useDayLength(): number {
  return useLiveQuery(async () => normalizeGridPrefs(await getMeta<unknown>(GRID_PREFS_META_KEY, null)).dayLength, [], DEFAULT_GRID_PREFS.dayLength)
}

/** The live dated tasks whose local due falls on one of the days. */
export function useDatedTasks(days: readonly string[]): Task[] | undefined {
  const key = days.join()
  return useLiveQuery(async () => {
    const want = new Set(days)
    return db.tasks.filter((tk) => !tk.deleted_at && !!tk.due && want.has(localDueOf(tk.due)!.date)).toArray()
  }, [key])
}

/** One place on a map block: a task's place or a saved place; `approximate` when its point was found by address. */
export interface MapItem {
  kind: 'task' | 'place'
  id: string
  title: string
  where: string
  lat?: number
  lon?: number
  /** The stored location's own words, what a lookup searches (never the task's title). */
  name?: string
  address?: string
  approximate?: boolean
}

/** A map block's items in order, tasks first; gone and unreadable ones are left out. */
export function useMapItems(block: Extract<AssistantBlock, { kind: 'map' }>): MapItem[] | undefined {
  const key = `${block.task_ids?.join()}|${block.place_ids?.join()}`
  return useLiveQuery(async () => {
    const [tasks, places, all] = await Promise.all([db.tasks.bulkGet(block.task_ids ?? []), db.places.bulkGet(block.place_ids ?? []), db.places.toArray()])
    const byId = new Map<string, Place>(all.map((p) => [p.id, p]))
    const out: MapItem[] = []
    for (const tk of tasks) {
      if (!tk || tk.deleted_at) continue
      const shown = shownLocation(tk, byId)
      if (!shown || shown.encrypted) continue
      out.push({ kind: 'task', id: tk.id, title: tk.title, where: locationLabel(shown), lat: shown.lat, lon: shown.lon, name: shown.name, address: shown.address })
    }
    for (const p of places) {
      if (!p || p.deleted_at || placeEncrypted(p)) continue
      const g = geoOf(p)
      const geo = g && g !== 'encrypted' ? g : undefined
      out.push({ kind: 'place', id: p.id, title: p.name, where: p.address, lat: geo?.lat, lon: geo?.lon, name: p.name, address: p.address })
    }
    return out
  }, [key])
}

/** A note, null when gone; undefined while reading. */
export function useBlockNote(id: string): Note | null | undefined {
  const read = useLiveQuery(async () => ({ id, row: (await db.notes.get(id)) ?? null }), [id])
  return read?.id === id ? (read.row && !read.row.deleted_at ? read.row : null) : undefined
}

export interface OutlineSection { id: string | null; name: string; open: number }

/** A project with its live sections in order and their open top-level tasks; tasks without a section first. */
export function useProjectOutline(id: string): { project: Project | null; sections: OutlineSection[] } | undefined {
  return useLiveQuery(async () => {
    const project = await db.projects.get(id)
    if (!project || project.deleted_at) return { project: null, sections: [] }
    const [sections, tasks] = await Promise.all([
      db.sections.where('project_id').equals(id).filter((s) => !s.deleted_at).sortBy('position'),
      db.tasks.where('project_id').equals(id).filter((tk) => !tk.deleted_at && !tk.completed_at && !tk.parent_id).toArray(),
    ])
    const count = (sid: string | null) => tasks.filter((tk) => (tk.section_id ?? null) === sid).length
    const out: OutlineSection[] = sections.map((s) => ({ id: s.id, name: s.name, open: count(s.id) }))
    const loose = count(null)
    if (loose) out.unshift({ id: null, name: t('No section'), open: loose })
    return { project, sections: out }
  }, [id])
}

// Points found by address this session (assistant-map-lookup D1). A found point or a
// miss is kept for the session; a failed search (the proxy's rate limit, the network)
// only for a minute, so it is asked again later. Nothing found is ever written.
type Found = { geo: Geo | null; failed?: boolean; until?: number }
const found = new Map<string, Found>()
const inFlight = new Map<string, Promise<void>>()
const FAILED_MS = 60_000
// At most this many searches at once, well inside the proxy's per-user limit.
const MAX_PARALLEL = 3
let running = 0
const waiting: (() => void)[] = []

/** Tests: forget the points found this session. */
export function resetMapLookup(): void { found.clear(); inFlight.clear(); running = 0; waiting.length = 0 }
resettable('assistantBlockData', resetMapLookup)

/** What a place is searched by: its address, else its name; never a task's title. */
const queryOf = (it: MapItem) => (it.address || it.name || '').trim()
const known = (q: string, now: number) => { const f = found.get(q); return !!f && (f.until === undefined || f.until > now) }

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
  running++
  try { return await run() } finally { running--; waiting.shift()?.() }
}

/** One search, shared by every block that asks for the same address at the same time. */
function lookUp(q: string): Promise<void> {
  const open = inFlight.get(q)
  if (open) return open
  const p = slot(async () => {
    try {
      const [first] = await searchAddress(q)
      found.set(q, { geo: first ? { lat: first.lat, lon: first.lon } : null })
    } catch {
      found.set(q, { geo: null, failed: true, until: Date.now() + FAILED_MS })
    }
  }).finally(() => inFlight.delete(q))
  inFlight.set(q, p)
  return p
}

export interface MapLookup {
  items: MapItem[] | undefined
  /** Searches are open. */
  pending: boolean
  /** Places need a search but the device is offline (asked again once online). */
  offline: boolean
  /** A search failed (rate limit, network); asked again a minute later. */
  failed: boolean
}

/**
 * The map block's items with a point for each that has none, looked up by its
 * address or name through the server's map proxy while maps are on and the device
 * is online, and marked `approximate`.
 */
export function useMapLookup(items: MapItem[] | undefined, mapsOn: boolean): MapLookup {
  const [, setVersion] = useState(0)
  const online = useOnline()
  const now = Date.now()
  const missing = [...new Set((items ?? []).filter((it) => it.lat === undefined && queryOf(it)).map(queryOf))]
  const ask = mapsOn && online ? missing.filter((q) => !known(q, now)) : []
  const key = ask.join('\u0000')
  useEffect(() => {
    if (!key) return
    let live = true
    void Promise.all(key.split('\u0000').map(lookUp)).then(() => { if (live) setVersion((v) => v + 1) })
    return () => { live = false }
  }, [key])
  if (!items) return { items, pending: false, offline: false, failed: false }
  let failed = false
  const out = items.map((it) => {
    if (it.lat !== undefined || !mapsOn) return it
    const f = found.get(queryOf(it))
    if (f?.failed) failed = true
    return f?.geo ? { ...it, lat: f.geo.lat, lon: f.geo.lon, approximate: true } : it
  })
  return { items: out, pending: ask.length > 0, offline: mapsOn && !online && missing.some((q) => !known(q, now)), failed }
}

// ---- the time blocks (OpenSpec change assistant-time-blocks, design D2) ----

/** One bar of a time block: a project ('' for the Inbox) or a day, with its tracked minutes. */
export interface TimeGroup { key: string; label: string; minutes: number }

/**
 * The user's own tracked time on the days from..to (each entry counted whole on the
 * logical day it started, as Statistics counts it), per project, largest first, or per
 * day in order. Entries on deleted tasks, or tasks in a deleted project, are left out.
 */
export function useTrackedTime(block: Extract<AssistantBlock, { kind: 'time' }>): { groups: TimeGroup[]; total: number } | undefined {
  return useLiveQuery(async () => {
    const [me, entries, tasks, projects, prefs] = await Promise.all([currentUserId(), db.timeEntries.toArray(), db.tasks.toArray(), db.projects.toArray(), db.userPrefs.get('me')])
    const dayStart = readDayStart(prefs)
    const gone = new Set(projects.filter((p) => p.deleted_at).map((p) => p.id))
    const names = new Map(projects.map((p) => [p.id, p.name]))
    const live = new Map(tasks.filter((tk) => !tk.deleted_at && !(tk.project_id && gone.has(tk.project_id))).map((tk) => [tk.id, tk]))
    const now = Date.now()
    const by = new Map<string, number>()
    let total = 0
    for (const e of entries) {
      const task = live.get(e.task_id)
      if (e.deleted_at || !task || e.user_id !== me) continue
      const day = entryDay(e.started_at, undefined, dayStart)
      if (day < block.from || day > block.to) continue
      const m = minutesOf(e, now)
      const key = block.group_by === 'day' ? day : task.project_id ?? ''
      by.set(key, (by.get(key) ?? 0) + m)
      total += m
    }
    if (block.group_by === 'day') {
      // A short range shows every day; a longer one the days with time.
      const all = daysBetweenISO(block.from, block.to) < 7
      const keys = all ? Array.from({ length: daysBetweenISO(block.from, block.to) + 1 }, (_, i) => addDaysISO(block.from, i)) : [...by.keys()].sort()
      return { groups: keys.map((d) => ({ key: d, label: formatDate(d, 'compact'), minutes: by.get(d) ?? 0 })), total }
    }
    const groups = [...by].map(([key, minutes]) => ({ key, label: key ? names.get(key) ?? t('Removed') : t('Inbox'), minutes }))
      .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label))
    return { groups, total }
  }, [block.from, block.to, block.group_by])
}

/** The date and minute now in a zone. */
function zoneNow(zone: string, now: number): { date: string; minute: number } {
  const at = instantToLocalDue(now, zone)
  return { date: at.date, minute: Number(at.time.slice(0, 2)) * 60 + Number(at.time.slice(3, 5)) }
}

/** A free time block's days and working day: each day's free stretches (freeTime.ts, pinned to internal/freetime). */
export interface FreeTimeView { days: FreeDay[]; dayStart: number; dayEnd: number }

/**
 * The free stretches of the block's days on this device: within the calendar's
 * working hours, between the cached calendar events, frames, slots and open timed
 * tasks. The events for the days are refreshed from the server when online.
 */
export function useFreeTime(block: Extract<AssistantBlock, { kind: 'free_time' }>): FreeTimeView | undefined {
  const last = addDaysISO(block.date, block.span === 'day' ? 0 : 6)
  const online = useOnline()
  useEffect(() => {
    if (online) void ensureEventsFor({ from: block.date, to: last }).catch(() => undefined)
  }, [block.date, last, online])
  return useLiveQuery(async () => {
    const [events, frames, slots, tasks, grid] = await Promise.all([
      db.calendarEvents.toArray(), db.frames.toArray(), db.slots.toArray(),
      db.tasks.filter((tk) => !tk.deleted_at && !tk.completed_at && !!tk.due?.time).toArray(), getMeta<unknown>(GRID_PREFS_META_KEY, null),
    ])
    const prefs = normalizeGridPrefs(grid)
    const zone = viewerZone()
    const now = zoneNow(zone, Date.now())
    const days = freeTime({
      from: block.date, to: last, zone, day_start: prefs.startHour * 60, day_end: prefs.endHour * 60, min_minutes: block.min_minutes, today: now.date, now: now.minute,
      events, frames: frames.filter((f) => !f.deleted_at), slots: slots.filter((s) => !s.deleted_at),
      tasks: tasks.map((tk) => ({ due: tk.due, estimate_minutes: tk.estimate_minutes, done: false })),
    })
    return { days, dayStart: prefs.startHour * 60, dayEnd: prefs.endHour * 60 }
  }, [block.date, last, block.min_minutes])
}

/** The open tasks with a deadline on the days from..to, by deadline then title. */
export function useDeadlines(block: Extract<AssistantBlock, { kind: 'deadlines' }>): Task[] | undefined {
  return useLiveQuery(async () => {
    const gone = new Set((await db.projects.toArray()).filter((p) => p.deleted_at).map((p) => p.id))
    const rows = await db.tasks.filter((tk) => !tk.deleted_at && !tk.completed_at && !!tk.deadline && tk.deadline >= block.from && tk.deadline <= block.to && !(tk.project_id && gone.has(tk.project_id))).toArray()
    return rows.sort((a, b) => (a.deadline! < b.deadline! ? -1 : a.deadline! > b.deadline! ? 1 : a.title.localeCompare(b.title)))
  }, [block.from, block.to])
}

// ---- the project view blocks (OpenSpec change assistant-project-blocks, design D1) ----

/** A board column: a section ('' for "No section") and its open top-level cards by position. */
export interface BlockColumn { key: string; section: Section | null; cards: Task[] }

/** A project's board as the board view builds it: "No section" first when it holds cards, then the live sections in order. */
export function useBlockBoard(id: string): { project: Project | null; columns: BlockColumn[] } | undefined {
  return useLiveQuery(async () => {
    const project = await db.projects.get(id)
    if (!project || project.deleted_at) return { project: null, columns: [] }
    const [sections, tasks] = await Promise.all([
      db.sections.where('project_id').equals(id).filter((s) => !s.deleted_at).sortBy('position'),
      db.tasks.where('project_id').equals(id).filter((tk) => !tk.deleted_at && !tk.completed_at && !tk.parent_id).sortBy('position'),
    ])
    const cards = (key: string) => tasks.filter((tk) => (tk.section_id ?? '') === key)
    const columns: BlockColumn[] = sections.map((s) => ({ key: s.id, section: s, cards: cards(s.id) }))
    const loose = cards('')
    if (loose.length || !columns.length) columns.unshift({ key: '', section: null, cards: loose })
    return { project, columns }
  }, [id])
}

/** A timeline row: an open top-level task of the project with its bar (lib/timeline's span). */
export interface TimelineLine { task: Task; span: Span }

/** A project's open top-level tasks with dates, by start; how many have none. */
export function useBlockTimeline(id: string, today: string): { project: Project | null; lines: TimelineLine[]; undated: number } | undefined {
  return useLiveQuery(async () => {
    const project = await db.projects.get(id)
    if (!project || project.deleted_at) return { project: null, lines: [], undated: 0 }
    const tasks = await db.tasks.where('project_id').equals(id).filter((tk) => !tk.deleted_at && !tk.completed_at && !tk.parent_id).sortBy('position')
    const zone = viewerZone()
    const lines: TimelineLine[] = []
    let undated = 0
    for (const task of tasks) {
      const span = spanOf(task, today, zone)
      if (span) lines.push({ task, span })
      else undated++
    }
    lines.sort((a, b) => (a.span.from < b.span.from ? -1 : a.span.from > b.span.from ? 1 : a.span.to < b.span.to ? -1 : a.span.to > b.span.to ? 1 : 0))
    return { project, lines, undated }
  }, [id, today])
}

/** An activity block's events, newest first, from this device's activity record. */
export function useBlockActivity(block: Extract<AssistantBlock, { kind: 'activity' }>): ActivityEvent[] | undefined {
  return useLiveQuery(() => (block.of === 'project' ? projectActivity(block.id) : taskActivity(block.id)), [block.of, block.id])
}

/** The numbers of a stats block, as Statistics, Today and the Inbox count them on this device. */
export interface BlockStats { completed: number; overdue: number; inbox: number; today: number; limit: number }

export function useBlockStats(block: Extract<AssistantBlock, { kind: 'stats' }>, today: string): BlockStats | undefined {
  return useLiveQuery(async () => {
    const [tasks, projects, memberships, me, prefs] = await Promise.all([db.tasks.toArray(), db.projects.toArray(), membershipMap(), currentUserId(), db.userPrefs.get('me')])
    // Counted as Statistics counts them: the user's live rows, each completion on its logical day.
    const counted = countedTasks({ tasks, projects, shared: new Set(memberships.keys()), me })
    const dayStart = currentDayStart()
    const completed = counted.filter((tk) => tk.completed_at !== null && logicalDay(tk.completed_at, dayStart) >= block.from && logicalDay(tk.completed_at, dayStart) <= block.to).length
    const gone = new Set(projects.filter((p) => p.deleted_at).map((p) => p.id))
    const open = tasks.filter((tk) => !tk.deleted_at && !tk.completed_at && !(tk.project_id && gone.has(tk.project_id)))
    const byId = new Map(tasks.map((tk) => [tk.id, tk]))
    return {
      completed, overdue: overdueOf(counted, projects, today).length,
      inbox: open.filter((tk) => isInboxTask(tk, (pid) => byId.get(pid))).length,
      today: open.filter((tk) => inToday(tk, today)).length,
      limit: todayLimitOf(prefs),
    }
  }, [block.from, block.to, today])
}

/** A task block's task, its subtasks and its live comments (oldest first); task null when it is gone. */
export function useBlockTask(id: string): { task: Task | null; subtasks: Task[]; comments: Comment[] } | undefined {
  const read = useLiveQuery(async () => {
    const task = (await db.tasks.get(id)) ?? null
    if (!task || task.deleted_at) return { id, task: null, subtasks: [] as Task[], comments: [] as Comment[] }
    const [subtasks, comments] = await Promise.all([
      db.tasks.where('parent_id').equals(id).filter((tk) => !tk.deleted_at).sortBy('position'),
      db.comments.where('task_id').equals(id).filter((c) => !c.deleted_at).sortBy('created_at'),
    ])
    return { id, task, subtasks, comments }
  }, [id])
  return read?.id === id ? read : undefined
}

/** A habit block's series and its occurrence records; series null when it is gone. */
export function useBlockHabit(id: string): { series: Task | null; records: Task[] } | undefined {
  const read = useLiveQuery(async () => {
    const series = (await db.tasks.get(id)) ?? null
    if (!series || series.deleted_at) return { id, series: null, records: [] as Task[] }
    return { id, series, records: await lineageRows(id) }
  }, [id])
  return read?.id === id ? read : undefined
}

/** Names a proposal's before-and-after view shows for ids (assistant-proposal-editing). */
export interface ProposalNames { projects: Map<string, string>; sections: Map<string, string>; labels: Map<string, string> }

const PROPOSAL_TABLES: Record<string, 'tasks' | 'projects' | 'sections' | 'labels' | 'notes' | 'reminders' | 'comments'> = {
  task: 'tasks', project: 'projects', section: 'sections', label: 'labels', note: 'notes', reminder: 'reminders', comment: 'comments',
}

/** Each proposed item's row on this device now (null for a new one), and the names its fields refer to. */
export function useProposalBefore(review: Review): { names: ProposalNames; rows: (Record<string, unknown> | null)[] } | undefined {
  const key = review.items.map((i) => i.change.entity + i.change.entityId).join()
  return useLiveQuery(async () => {
    const [projects, sections, labels] = await Promise.all([db.projects.toArray(), db.sections.toArray(), db.labels.toArray()])
    const names: ProposalNames = { projects: new Map(projects.map((p) => [p.id, p.name])), sections: new Map(sections.map((s) => [s.id, s.name])), labels: new Map(labels.map((l) => [l.id, l.name])) }
    // Entities the proposal creates are named from it.
    for (const { change: c } of review.items) {
      const name = typeof c.patch.name === 'string' ? c.patch.name : ''
      if (name && c.entity === 'project') names.projects.set(c.entityId, name)
      if (name && c.entity === 'section') names.sections.set(c.entityId, name)
      if (name && c.entity === 'label') names.labels.set(c.entityId, name)
    }
    const rows = await Promise.all(review.items.map(async ({ change: c }) => {
      const table = PROPOSAL_TABLES[c.entity]
      if (c.create || !table) return null
      return ((await db[table].get(c.entityId)) as Record<string, unknown> | undefined) ?? null
    }))
    return { names, rows }
  }, [key, review])
}
