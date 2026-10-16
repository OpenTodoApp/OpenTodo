// Activity feed across shared projects (OpenSpec `activity-feed`). Everything is
// computed from local storage, so the feed and the unread counts work offline:
//
// - events come from the local `activity` table, derived per project with the
//   rule shared with the server (lib/activity), only for shared projects;
// - "seen until" is the synced `project_prefs.feed_seen_at` field (personal
//   scope, design D1), written by markSeen() through mutate() and never moved
//   backwards; a project without one uses the device's baseline (the time of the
//   first sync after the upgrade, or after joining the project);
// - unread = events by someone else newer than the seen time (design D2).
//
// Views read these through Dexie live queries, so every sync that writes ops
// (including one triggered by the server's wake-up channel) refreshes them.
import { api } from './api'
import { decryptActivityPage } from './e2ee'
import { LOCAL_RETENTION, newestFirst, projectActivity } from './activity'
import { db, getMeta, setMeta } from './db'
import { mutateMany, type Change } from './ops'
import type { ActivityEvent, ActivityKind, ActivityPage } from './types'
import { msg, translatedList } from './i18n'

// ---- kinds (same table as internal/activity/feed.go) ----

export type FeedKind = 'completed' | 'created' | 'commented' | 'assigned' | 'rescheduled' | 'other'

export const FEED_KINDS: { value: FeedKind; label: string }[] = translatedList<{ value: FeedKind; label: string }, 'label'>([
  { value: 'completed', label: msg('Completed') },
  { value: 'created', label: msg('Created') },
  { value: 'commented', label: msg('Commented') },
  { value: 'assigned', label: msg('Assigned') },
  { value: 'rescheduled', label: msg('Rescheduled') },
  { value: 'other', label: msg('Other') },
], 'label')

export function feedKindOf(kind: ActivityKind): FeedKind {
  switch (kind) {
    case 'completed': case 'reopened': return 'completed'
    case 'created': return 'created'
    case 'commented': case 'comment_edited': case 'comment_deleted': return 'commented'
    case 'assigned': case 'unassigned': return 'assigned'
    case 'rescheduled': return 'rescheduled'
    default: return 'other'
  }
}

// ---- shared projects and seen times ----

/** Shared projects the user is a member of (the cached memberships), minus locally deleted ones. */
export async function sharedProjectIds(): Promise<string[]> {
  const ids = (await db.memberships.toArray()).map((m) => m.projectId)
  const rows = await db.projects.bulkGet(ids)
  return ids.filter((_, i) => !rows[i]?.deleted_at)
}

/** Per-device fallback seen times by project, set on the first sync that knows the project. */
export const FEED_BASELINE_KEY = 'feedBaseline'

/**
 * Give every shared project without a baseline the time `now` (design: "initial
 * value = time of first sync after upgrade"). Called after each completed sync, so
 * the history a device pulls on upgrade, or when it joins a project, is not unread.
 */
export async function ensureFeedBaselines(now = Date.now()): Promise<void> {
  const ids = await sharedProjectIds()
  const base = await getMeta<Record<string, number>>(FEED_BASELINE_KEY, {})
  const missing = ids.filter((id) => !(id in base))
  if (missing.length === 0) return
  const next = { ...base }
  for (const id of missing) next[id] = now
  await setMeta(FEED_BASELINE_KEY, next)
}

/** The synced seen time of each project that has one. */
async function syncedSeen(ids: string[]): Promise<Map<string, number>> {
  const rows = await db.prefs.bulkGet(ids)
  const out = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r && r.feed_seen_at > 0) out.set(ids[i], r.feed_seen_at)
  })
  return out
}

/**
 * Effective "seen until" per shared project: the synced mark, else the device's
 * baseline, else +Infinity (before the first sync nothing counts as unread).
 */
export async function seenTimes(ids?: string[]): Promise<Map<string, number>> {
  const list = ids ?? (await sharedProjectIds())
  const [synced, base] = await Promise.all([syncedSeen(list), getMeta<Record<string, number>>(FEED_BASELINE_KEY, {})])
  return new Map(list.map((id) => [id, synced.get(id) ?? base[id] ?? Number.POSITIVE_INFINITY]))
}

// ---- events ----

/** Locally retained events of every shared project, newest first, each tagged with its project. */
export async function feedEvents(ids?: string[]): Promise<ActivityEvent[]> {
  const list = ids ?? (await sharedProjectIds())
  // Reads start together: Dexie live queries stop tracking reads made after a
  // long chain of sequential awaits, so a loop of awaits would miss later projects.
  const perProject = await Promise.all(list.map((id) => projectActivity(id)))
  return newestFirst(perProject.flatMap((evs, i) => evs.map((ev) => ({ ...ev, projectId: list[i] }))))
}

export interface FeedFilter {
  project?: string
  actor?: string
  kind?: FeedKind | ''
}

export function filterFeed(events: ActivityEvent[], f: FeedFilter): ActivityEvent[] {
  return events.filter((e) => (!f.project || e.projectId === f.project) && (!f.actor || e.actor === f.actor) && (!f.kind || feedKindOf(e.kind) === f.kind))
}

/** Local calendar day (YYYY-MM-DD) of an event time. */
export function dayOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Group newest-first events by local day, keeping the order. */
export function groupByDay(events: ActivityEvent[]): { day: string; events: ActivityEvent[] }[] {
  const out: { day: string; events: ActivityEvent[] }[] = []
  for (const e of events) {
    const day = dayOf(e.ts)
    const last = out[out.length - 1]
    if (last && last.day === day) last.events.push(e)
    else out.push({ day, events: [e] })
  }
  return out
}

/** One page of the cross-project feed from the server. */
export async function fetchFeed(opts: FeedFilter & { cursor?: string } = {}): Promise<ActivityPage> {
  // Ciphertext values (OpenSpec e2ee) are decrypted for display.
  return decryptActivityPage(await api.feed(opts))
}

// ---- unread ----

export interface UnreadCounts {
  byProject: Map<string, number>
  total: number
}

/**
 * Events by someone other than `me` newer than each project's seen time. A
 * project's count is bounded by the local retention (LOCAL_RETENTION events), so
 * formatUnread shows "500+" at the bound. Filters never apply here.
 */
export function countUnread(events: ActivityEvent[], seen: Map<string, number>, me: string | null): UnreadCounts {
  const byProject = new Map<string, number>()
  let total = 0
  for (const e of events) {
    if (!e.projectId || (me && e.actor === me)) continue
    const s = seen.get(e.projectId) ?? Number.POSITIVE_INFINITY
    if (e.ts <= s) continue
    byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + 1)
    total++
  }
  return { byProject, total }
}

/** Live-query helper: the unread counts from local storage. */
export async function unreadCounts(): Promise<UnreadCounts> {
  const [ids, meRow] = await Promise.all([sharedProjectIds(), db.meta.get('userId')])
  // In parallel, for the same reason as in feedEvents (live-query tracking).
  const [events, seen] = await Promise.all([feedEvents(ids), seenTimes(ids)])
  return countUnread(events, seen, (meRow?.value as string | undefined) ?? null)
}

export function formatUnread(n: number): string {
  return n >= LOCAL_RETENTION ? `${LOCAL_RETENTION}+` : String(n)
}

// ---- marking seen ----

/** Marks requested within this window are written as one batch (one op per project). */
export const MARK_DEBOUNCE_MS = 400

const pendingMarks = new Map<string, number>()
let markTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> = Promise.resolve()

/**
 * Remember that `projectId` was seen up to `time` (an event's ts). Debounced: the
 * marks of one open become one op per project. The stored value never moves backwards.
 */
export function markSeen(projectId: string, time: number): void {
  if (!Number.isFinite(time) || time <= 0) return
  pendingMarks.set(projectId, Math.max(pendingMarks.get(projectId) ?? 0, time))
  // The first mark arms the timer and later ones join it: a view that re-renders
  // often must not keep pushing the write out.
  if (!markTimer) markTimer = setTimeout(() => void flushSeen(), MARK_DEBOUNCE_MS)
}

/** Write pending marks now (also used by tests). Only values above the stored one become ops. */
export function flushSeen(): Promise<void> {
  if (markTimer) clearTimeout(markTimer)
  markTimer = null
  const marks = [...pendingMarks]
  pendingMarks.clear()
  flushing = flushing.then(async () => {
    if (marks.length === 0) return
    const current = await db.prefs.bulkGet(marks.map(([id]) => id))
    const changes: Change[] = []
    marks.forEach(([id, time], i) => {
      if (time > (current[i]?.feed_seen_at ?? 0)) changes.push({ entity: 'project_prefs', entityId: id, patch: { feed_seen_at: time } })
    })
    if (changes.length) await mutateMany(changes)
  }).catch(() => {})
  return flushing
}

/** Mark every project in `events` seen up to its newest listed event (opening the feed). */
export function markEventsSeen(events: ActivityEvent[]): void {
  const newest = new Map<string, number>()
  for (const e of events) if (e.projectId) newest.set(e.projectId, Math.max(newest.get(e.projectId) ?? 0, e.ts))
  for (const [id, ts] of newest) markSeen(id, ts)
}
