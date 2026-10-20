// Tracked time on this device (OpenSpec change `time-tracking`): the actions that
// write time entries and the live reads screens use. Pure rules are in time.ts.
//
// The API other features build on (focus-mode starts, pauses and stops entries
// through it):
//
//   startTracking(taskId, { now?, note? })    start an entry; the user's running one
//                                              ends at the new start in the same batch
//   stopTracking({ now? })                     end the running entry (null: none ran)
//   toggleTracking(taskId)                     the `y` key: stop when this task's entry
//                                              runs, else start
//   logTime(taskId, startedAt, endedAt, note)  a closed entry (manual entries)
//   updateTimeEntry(id, { started_at?, ended_at?, note? }) / deleteTimeEntry(id)
//   repairRunning()                            the one-running-entry repair (design D2)
//   useRunningEntry(), useTaskEntries(id), useTaskTracked(id), useTrackedTotals(), useMinuteNow(active)
//
// Every action is one mutateMany batch: applied locally at once, queued for the
// server, offline-safe. A pause is a stop; resuming starts a new entry (each
// stretch of work is one row). Only the author's entries can be changed: the
// server refuses other members' (time-tracking "Time entry authorship").
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { derived, liveSnapshot } from './liveSnapshot'
import { getDeviceId, mutateMany, mutationTables, type Change } from './ops'
import { currentUserId } from './sharing'
import { isRunning, ownMinutesOnDay, repairs, running, startBatch, totalsByTask, type Repair } from './time'
import { useLiveTasks } from './liveTasks'
import { uuid } from './ids'
import type { Task, TimeEntry } from './types'

/** An end before the start (the form and the actions refuse it). */
export class TimeRangeError extends Error {
  constructor() {
    super('The end is before the start')
    this.name = 'TimeRangeError'
  }
}

const endChanges = (list: readonly Repair[]): Change[] => list.map((r) => ({ entity: 'time_entry', entityId: r.id, patch: { ended_at: r.ended_at } }))

/** The signed-in account's entries (all of them, deleted ones too). */
async function ownEntries(me: string): Promise<TimeEntry[]> {
  return db.timeEntries.where('user_id').equals(me).toArray()
}

/** The ops of a new entry. */
export function planEntry(id: string, taskId: string, me: string, device: string, startedAt: number, endedAt: number | null, note: string, now: number): Change {
  return { entity: 'time_entry', entityId: id, patch: {
    task_id: taskId, user_id: me, started_at: startedAt, ended_at: endedAt, device_id: device, note, created_at: now, deleted_at: null,
  } }
}

async function signedIn(): Promise<string> {
  const me = await currentUserId()
  if (!me) throw new Error('not signed in')
  return me
}

/**
 * Start tracking `taskId` now: a new running entry, and the user's running entry
 * (and any other the repair would end) closed at the new start, in one batch.
 * Returns the new entry's id.
 */
export async function startTracking(taskId: string, opts: { now?: number; note?: string } = {}): Promise<string> {
  const now = opts.now ?? Date.now()
  const me = await signedIn()
  const device = await getDeviceId()
  const id = uuid()
  await db.transaction('rw', mutationTables(), async () => {
    const closing = startBatch(await ownEntries(me), me, now)
    await mutateMany([...endChanges(closing), planEntry(id, taskId, me, device, now, null, opts.note ?? '', now)])
  })
  return id
}

/** Stop the running entry now. Returns its id, or null when none ran. */
export async function stopTracking(opts: { now?: number } = {}): Promise<string | null> {
  const now = opts.now ?? Date.now()
  const me = await signedIn()
  await getDeviceId()
  let stopped: string | null = null
  await db.transaction('rw', mutationTables(), async () => {
    const entries = await ownEntries(me)
    stopped = running(entries, me)?.id ?? null
    const closing = startBatch(entries, me, now)
    if (closing.length) await mutateMany(endChanges(closing))
  })
  return stopped
}

/**
 * The `y` key (design D5): stop when this task's entry is the running one, else
 * start it. `canStart: false` (a completed task) only stops.
 */
export async function toggleTracking(taskId: string, opts: { now?: number; canStart?: boolean } = {}): Promise<'started' | 'stopped' | 'none'> {
  const me = await signedIn()
  const current = running(await ownEntries(me), me)
  if (current?.task_id === taskId) {
    await stopTracking(opts)
    return 'stopped'
  }
  if (opts.canStart === false) return 'none'
  await startTracking(taskId, opts)
  return 'started'
}

/** Log a closed entry (the Time tab's form, quick add's spent time). Refuses an end before the start. */
export async function logTime(taskId: string, startedAt: number, endedAt: number, note = ''): Promise<string> {
  if (!(endedAt >= startedAt) || startedAt <= 0) throw new TimeRangeError()
  const me = await signedIn()
  const device = await getDeviceId()
  const id = uuid()
  await mutateMany([planEntry(id, taskId, me, device, startedAt, endedAt, note, Date.now())])
  return id
}

/**
 * Change an own entry's start, end or note; each field is its own op, so a
 * concurrent edit of another field on another device is kept. Refuses a change
 * that puts the end before the start.
 */
export async function updateTimeEntry(id: string, patch: Partial<Pick<TimeEntry, 'started_at' | 'ended_at' | 'note'>>): Promise<void> {
  const row = await db.timeEntries.get(id)
  if (!row) throw new Error('time entry not found')
  const start = patch.started_at ?? row.started_at
  const end = patch.ended_at !== undefined ? patch.ended_at : row.ended_at
  if (end !== null && end < start) throw new TimeRangeError()
  await mutateMany([{ entity: 'time_entry', entityId: id, patch }])
}

/** Move an entry to its tombstone. */
export async function deleteTimeEntry(id: string, now = Date.now()): Promise<void> {
  await mutateMany([{ entity: 'time_entry', entityId: id, patch: { deleted_at: now } }])
}

/**
 * The one-running-entry repair (design D2): when two devices started entries
 * while offline, every device ends the older ones at the newest start, writing
 * the same values, so the repair converges. Returns how many entries it ended.
 */
export async function repairRunning(): Promise<number> {
  const me = await currentUserId()
  if (!me) return 0
  await getDeviceId()
  let n = 0
  await db.transaction('rw', mutationTables(), async () => {
    const fix = repairs(await ownEntries(me), me)
    n = fix.length
    if (n) await mutateMany(endChanges(fix))
  })
  return n
}

// ---- live reads ----

const entryRows = liveSnapshot('time entries', () => db.timeEntries.toArray())
const liveOf = derived((all: TimeEntry[]) => all.filter((e) => !e.deleted_at))
const NO_ENTRIES: TimeEntry[] = []

/** Every live entry this device holds (every member's on shared tasks). */
export function useLiveEntries(): TimeEntry[] {
  const all = entryRows.use()
  return all ? liveOf(all) : NO_ENTRIES
}

/** The signed-in account id, live (null while loading or signed out). */
export function useMe(): string | null {
  return useLiveQuery(() => currentUserId(), [], null)
}

/** The user's running entry, or null (the indicator, the menus, the `y` key). */
export function useRunningEntry(): TimeEntry | null {
  const entries = useLiveEntries()
  const me = useMe()
  return me ? running(entries, me) : null
}

/** A task's live entries, newest first (the Time tab). */
export function useTaskEntries(taskId: string): TimeEntry[] {
  const entries = useLiveEntries()
  return useMemo(() => entries.filter((e) => e.task_id === taskId).sort((a, b) => b.started_at - a.started_at || (a.id < b.id ? 1 : -1)), [entries, taskId])
}

/**
 * Now, refreshed on every minute boundary while `active` (one timer per caller,
 * none while nothing runs): running entries count to the current minute.
 */
export function useMinuteNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      timer = setTimeout(() => { setNow(Date.now()); tick() }, 60000 - (Date.now() % 60000) + 5)
    }
    tick()
    return () => clearTimeout(timer)
  }, [active])
  return now
}

const NO_TOTALS: ReadonlyMap<string, number> = new Map()

/**
 * Every member's tracked minutes per task, shared by every row (design D4): one
 * map recomputed when the entries change and, while an entry runs, on each
 * minute boundary by one timer for the whole app. A row reads its own number,
 * so a tick re-renders only the rows whose total changed.
 */
const totals = (() => {
  let value: ReadonlyMap<string, number> = NO_TOTALS
  let timer: ReturnType<typeof setTimeout> | null = null
  let stop: (() => void) | null = null
  const listeners = new Set<() => void>()
  const recompute = () => {
    const all = entryRows.read()
    const live = all ? liveOf(all) : NO_ENTRIES
    const next = live.length ? totalsByTask(live, Date.now()) : NO_TOTALS
    const same = next.size === value.size && [...next].every(([k, v]) => value.get(k) === v)
    if (!same) {
      value = next
      for (const l of listeners) l()
    }
    if (timer) clearTimeout(timer)
    timer = live.some(isRunning) ? setTimeout(recompute, 60000 - (Date.now() % 60000) + 5) : null
  }
  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      if (!stop) {
        stop = entryRows.subscribe(recompute)
        recompute()
      }
      return () => {
        listeners.delete(fn)
        if (listeners.size === 0 && stop) {
          stop()
          stop = null
          if (timer) clearTimeout(timer)
          timer = null
          value = NO_TOTALS
        }
      }
    },
    read: () => value,
  }
})()

/** Every member's tracked minutes per task (the filter, the panel, Today), live and ticking. */
export function useTrackedTotals(): ReadonlyMap<string, number> {
  return useSyncExternalStore(totals.subscribe, totals.read, totals.read)
}

/** One task's tracked minutes, undefined without entries (rows). */
export function useTaskTracked(taskId: string): number | undefined {
  const read = useCallback(() => totals.read().get(taskId), [taskId])
  return useSyncExternalStore(totals.subscribe, read, read)
}

/**
 * Today's header (time-tracking D4): the estimates of the listed open tasks and the
 * user's own minutes that started on `day` (live tasks only), running ones to the
 * current minute. Both computed on the device, nothing stored or sent.
 */
export function useDayTotals(listed: readonly Pick<Task, 'estimate_minutes' | 'completed_at'>[], day: string, enabled = true): { planned: number; tracked: number } {
  const entries = useLiveEntries()
  const me = useMe()
  const tasks = useLiveTasks()
  const mine = useMemo(() => (enabled && me ? entries.filter((e) => e.user_id === me) : NO_ENTRIES), [entries, me, enabled])
  const now = useMinuteNow(mine.some(isRunning))
  return useMemo(() => {
    if (!enabled) return { planned: 0, tracked: 0 }
    const live = new Set((tasks ?? []).map((x) => x.id))
    const planned = listed.reduce((n, x) => n + (x.completed_at ? 0 : x.estimate_minutes ?? 0), 0)
    return { planned, tracked: ownMinutesOnDay(mine, me, day, now, (id) => live.has(id)) }
  }, [enabled, listed, mine, me, day, now, tasks])
}

/**
 * Runs the repair whenever the user holds two running entries (after a sync
 * brought another device's start). Mounted once by the shell.
 */
export function useRunningRepair(): void {
  const entries = useLiveEntries()
  const me = useMe()
  const count = me ? entries.filter((e) => e.user_id === me && isRunning(e)).length : 0
  useEffect(() => {
    if (count > 1) void repairRunning().catch((err) => console.warn('time entry repair:', err))
  }, [count])
}
