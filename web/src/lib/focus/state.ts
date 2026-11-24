// The focus timer's state (OpenSpec change focus-mode, design D2, D3): one row
// "current" in the device-local `focus` table, the working copy every screen reads.
// The person's devices share one session (sync-focus-sessions D1, D2): a user
// action writes the row and publishes its shared part as one JSON record,
// `user_prefs.focus_run`, through the op log; a record another device wrote is
// adopted. Each write gets a new `rev`, and the revisions this device already held
// are in `seen`, so a record is adopted once and the device's own never rolls the
// row back. clearLocalData() drops the row at sign-out; the record stays.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { uuid } from '../ids'
import { mutate } from '../ops'
import { USER_PREFS_ID } from '../userPrefs'
import { idleState, type FocusState } from './timer'

export const FOCUS_ROW = 'current'

/** A write the device derives on its own (a run's end, a pause because the entry stopped elsewhere): never published (D3). */
export interface FocusWrite { local?: boolean }

/** The stored state, or null when this device never ran a session. */
export async function readFocus(): Promise<FocusState | null> {
  return (await db.focus.get(FOCUS_ROW)) ?? null
}

const SEEN = 8
const seenAfter = (row: FocusState | undefined): string[] => [...(row?.seen ?? []), ...(row?.rev ? [row.rev] : [])].slice(-SEEN)

/** The row as written: a published write gets a new revision and makes this device the owner (D4); a local one keeps both. */
function stamp(next: FocusState, row: FocusState | undefined, opts: FocusWrite): FocusState {
  if (opts.local) return { ...next, id: FOCUS_ROW, rev: row?.rev, seen: row?.seen, remote: row?.remote }
  return { ...next, id: FOCUS_ROW, rev: uuid(), seen: seenAfter(row), remote: false }
}

/** The shared record of a state (D1): what another device needs to show the same session. */
export function runRecord(s: FocusState): string {
  const { rev, taskId, mode, phase, startedAt, resumedAt, accumulatedMs, plannedMs, cycle, breakKind, entryId, ended } = s
  return JSON.stringify({ v: 1, rev, taskId, mode, phase, startedAt, resumedAt, accumulatedMs, plannedMs, cycle, breakKind, entryId, ended })
}

async function publish(s: FocusState): Promise<void> {
  try {
    await mutate('user_prefs', USER_PREFS_ID, { focus_run: runRecord(s) })
  } catch (err) {
    // The session still runs here; the next change publishes it again.
    console.warn('focus: publishing the session failed', err)
  }
}

/** Replaces the stored state (and publishes it, unless `local`). */
export async function writeFocus(state: FocusState, opts: FocusWrite = {}): Promise<void> {
  const next = await db.transaction('rw', db.focus, async () => {
    const row = stamp(state, await db.focus.get(FOCUS_ROW), opts)
    await db.focus.put(row)
    return row
  })
  if (!opts.local) await publish(next)
}

/**
 * One transition of the run that started at `expectedStartedAt` (design D3): runs
 * in a transaction that re-reads the row and gives up when the row moved on (a
 * second tab already wrote the end, the user started another run, another device's
 * session was adopted) or when `fn` returns null. Returns the written state, or
 * null when nothing was written, so the effects of a transition (the entry's stop,
 * the notification) run once. Published unless `local`.
 */
export async function transitionFocus(expectedStartedAt: number, fn: (s: FocusState) => FocusState | null, opts: FocusWrite = {}): Promise<FocusState | null> {
  const next = await db.transaction('rw', db.focus, async () => {
    const row = await db.focus.get(FOCUS_ROW)
    if (!row || row.startedAt !== expectedStartedAt) return null
    const next = fn(row)
    if (!next || next === row) return null
    const out = stamp(next, row, opts)
    await db.focus.put(out)
    return out
  })
  if (next && !opts.local) await publish(next)
  return next
}

type Shared = Pick<FocusState, 'taskId' | 'mode' | 'phase' | 'startedAt' | 'resumedAt' | 'accumulatedMs' | 'plannedMs' | 'cycle' | 'breakKind' | 'entryId' | 'ended'> & { rev: string }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOrNull = (v: unknown) => v === null || num(v)
const strOrNull = (v: unknown) => v === null || typeof v === 'string'

/** A stored record, or null for one this client cannot read (a newer `v`, a missing or mistyped field), which is ignored and kept. */
export function parseRun(raw: unknown): Shared | null {
  if (typeof raw !== 'string' || !raw) return null
  let r: Record<string, unknown>
  try {
    r = JSON.parse(raw)
  } catch {
    return null
  }
  if (!r || typeof r !== 'object' || r.v !== 1 || typeof r.rev !== 'string' || !r.rev || typeof r.taskId !== 'string') return null
  if (!['pomodoro', 'flowtime', 'countdown'].includes(r.mode as string) || !['idle', 'work', 'break', 'done'].includes(r.phase as string)) return null
  if (!num(r.startedAt) || !numOrNull(r.resumedAt) || !num(r.accumulatedMs) || !numOrNull(r.plannedMs) || !num(r.cycle)) return null
  if (!(r.breakKind === null || r.breakKind === 'short' || r.breakKind === 'long') || !strOrNull(r.entryId)) return null
  const e = r.ended as Record<string, unknown> | null
  if (e !== null && (typeof e !== 'object' || !['work', 'break', 'complete'].includes(e.kind as string) || !num(e.workedMs) || !num(e.at) || !num(e.runStartedAt))) return null
  const { v: _v, ...shared } = r
  return shared as unknown as Shared
}

/**
 * Adopts the session another device wrote (D2): a readable record whose revision
 * this device never held replaces the shared part of the row, keeps the device's
 * own Countdown length (and "Not now" for the same run), and marks the row as
 * owned elsewhere (D4). Returns the adopted state, or null when nothing changed.
 */
export async function adoptRun(raw: unknown): Promise<FocusState | null> {
  const r = parseRun(raw)
  if (!r) return null
  return db.transaction('rw', db.focus, async () => {
    const row = await db.focus.get(FOCUS_ROW)
    if (row && (row.rev === r.rev || row.seen?.includes(r.rev))) return null
    const base = row ?? idleState(r.taskId, r.mode, r.startedAt)
    const next: FocusState = {
      ...base, ...r, id: FOCUS_ROW, pausedReason: null, remindedAtMs: base.startedAt === r.startedAt ? base.remindedAtMs : 0,
      seen: seenAfter(row), remote: true,
    }
    await db.focus.put(next)
    return next
  })
}

/** The stored state, live: undefined while it loads, null without one. */
export function useFocusState(): FocusState | null | undefined {
  return useLiveQuery(readFocus, [], undefined)
}
