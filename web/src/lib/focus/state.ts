// The focus timer's state (OpenSpec change focus-mode, design D2, D3): one row
// "current" in the device-local `focus` table, the working copy every screen reads.
// The person's devices share one session (sync-focus-sessions D1, D2): a user
// action writes the row and, in the same transaction, its shared part as one JSON
// record, `user_prefs.focus_run`, through the op log. Each published write gets a
// new `rev`; a stored record whose rev differs from the row's was written by
// another device and is adopted. clearLocalData() drops the row at sign-out; the
// record stays.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { uuid } from '../ids'
import { getDeviceId, mutate, mutationTables } from '../ops'
import { USER_PREFS_ID } from '../userPrefs'
import { idleState, type FocusState } from './timer'

export const FOCUS_ROW = 'current'

/**
 * `local`: a write the device derives on its own (a run's end, a pause because
 * the entry stopped elsewhere), never published (D3). `ifCurrent`: write only
 * while the stored record is still the row's own (D3, an auto-started phase).
 * `pending`: a local write to publish after the next successful sync (D3).
 */
export interface FocusWrite { local?: boolean; ifCurrent?: boolean; pending?: boolean }

/** The stored state, or null when this device never ran a session. */
export async function readFocus(): Promise<FocusState | null> {
  return (await db.focus.get(FOCUS_ROW)) ?? null
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown) => typeof v === 'string'
const oneOf = (...xs: string[]) => (v: unknown) => xs.includes(v as string)
const orNull = (f: (v: unknown) => boolean) => (v: unknown) => v === null || f(v)
const endedOk = (e: unknown) => {
  const x = e as Record<string, unknown>
  return typeof x === 'object' && oneOf('work', 'break', 'complete')(x.kind) && num(x.workedMs) && num(x.at) && num(x.runStartedAt)
}

/** The shared fields of the record and what a readable value holds (D1); the rest of the row stays on the device. */
const SHARED = {
  rev: (v: unknown) => str(v) && !!v,
  taskId: str,
  mode: oneOf('pomodoro', 'flowtime', 'countdown'),
  phase: oneOf('idle', 'work', 'break', 'done'),
  startedAt: num,
  resumedAt: orNull(num),
  accumulatedMs: num,
  plannedMs: orNull(num),
  cycle: num,
  breakKind: orNull(oneOf('short', 'long')),
  entryId: orNull(str),
  ended: orNull(endedOk),
}
type SharedKey = keyof typeof SHARED
export type FocusRun = Required<Pick<FocusState, SharedKey>>
const KEYS = Object.keys(SHARED) as SharedKey[]
const pick = (r: Record<string, unknown>) => Object.fromEntries(KEYS.map((k) => [k, r[k]])) as FocusRun

/** The shared record of a state (D1): what another device needs to show the same session. */
export function runRecord(s: FocusState): string {
  return JSON.stringify({ v: 1, ...pick(s as unknown as Record<string, unknown>) })
}

/** A stored record, or null for one this client cannot read (a newer `v`, a missing or mistyped field), which is ignored and kept. */
export function parseRun(raw: unknown): FocusRun | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const r = JSON.parse(raw)
    return r && r.v === 1 && KEYS.every((k) => SHARED[k](r[k])) ? pick(r) : null
  } catch {
    return null
  }
}

/** The record stored on the preferences row (read inside a transaction that holds `db.userPrefs`). */
const storedRun = async () => parseRun((await db.userPrefs.get(USER_PREFS_ID))?.focus_run)

/**
 * One write of the row: `fn` gets the stored row and returns the next state, or
 * null to write nothing. A published write gets a new revision, makes this device
 * the owner (D4) and writes the record in the same transaction, so no adoption
 * can fall between the two. Returns the written state, or null.
 */
async function write(fn: (row: FocusState | undefined) => FocusState | null, opts: FocusWrite): Promise<FocusState | null> {
  await getDeviceId()
  return db.transaction('rw', [...mutationTables(), db.focus], async () => {
    const row = await db.focus.get(FOCUS_ROW)
    const next = fn(row)
    if (!next) return null
    if (opts.ifCurrent) {
      const stored = await storedRun()
      if (stored && stored.rev !== row?.rev) return null
    }
    const out: FocusState = opts.local
      ? { ...next, id: FOCUS_ROW, rev: row?.rev, remote: row?.remote, ...(opts.pending ? { pending: true } : {}) }
      : { ...next, id: FOCUS_ROW, rev: uuid(), remote: false, pending: false }
    await db.focus.put(out)
    if (!opts.local) await mutate('user_prefs', USER_PREFS_ID, { focus_run: runRecord(out) })
    return out
  })
}

/** Replaces the stored state (and publishes it, unless `local`). */
export async function writeFocus(state: FocusState, opts: FocusWrite = {}): Promise<void> {
  await write(() => state, opts)
}

/**
 * One transition of the run that started at `expectedStartedAt` (design D3): it
 * re-reads the row and gives up when the row moved on (a second tab already wrote
 * the end, the user started another run, another device's session was adopted)
 * or when `fn` returns null. Returns the written state, or null when nothing was
 * written, so the effects of a transition (the entry's stop, the notification)
 * run once.
 */
export function transitionFocus(expectedStartedAt: number, fn: (s: FocusState) => FocusState | null, opts: FocusWrite = {}): Promise<FocusState | null> {
  return write((row) => {
    if (!row || row.startedAt !== expectedStartedAt) return null
    const next = fn(row)
    return next === row ? null : next
  }, opts)
}

/** Whether the stored record is the row's own, or there is none (D3). */
export function isCurrent(): Promise<boolean> {
  return db.transaction('r', [db.focus, db.userPrefs], async () => {
    const stored = await storedRun()
    return !stored || stored.rev === (await db.focus.get(FOCUS_ROW))?.rev
  })
}

/**
 * Adopts the session another device wrote (D2): the record stored now, when it is
 * readable and not the row's own, replaces the shared part of the row, keeps the
 * device's own Countdown length (and "Not now" for the same run), and marks the
 * row as owned elsewhere (D4). Returns the row before and after, or null.
 */
export function adoptRun(): Promise<{ prev: FocusState | null; next: FocusState } | null> {
  return db.transaction('rw', [db.focus, db.userPrefs], async () => {
    const r = await storedRun()
    const row = await db.focus.get(FOCUS_ROW)
    if (!r || row?.rev === r.rev) return null
    const base = row ?? idleState(r.taskId, r.mode, r.startedAt)
    const next: FocusState = { ...base, ...r, id: FOCUS_ROW, pausedReason: null, remindedAtMs: base.startedAt === r.startedAt ? base.remindedAtMs : 0, remote: true, pending: false }
    await db.focus.put(next)
    return { prev: row ?? null, next }
  })
}

/** The stored state, live: undefined while it loads, null without one. */
export function useFocusState(): FocusState | null | undefined {
  return useLiveQuery(readFocus, [], undefined)
}
