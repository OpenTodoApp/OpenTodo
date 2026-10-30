// Focus session actions (OpenSpec change focus-mode, design D3, D4, D10): each one
// transition of the device-local row, then its time-entry side through the logger.
// A transition that finds the row moved on (another tab, a quicker key press)
// writes nothing and logs nothing, so no effect is doubled. Work is logged, breaks
// never are: starting or resuming work starts an entry, pausing, finishing,
// taking a break, completing or leaving stops it.
import { focusLogger } from './index'
import type { FocusPrefs } from './prefs'
import { readFocus, transitionFocus, writeFocus } from './state'
import { complete, continuousWork, finish, idleState, inRun, isDue, isRunning, pause, resume, start, stopWork, takeBreak, type FocusState } from './timer'

async function stopEntry(entryId: string | null, at: number): Promise<void> {
  if (!entryId) return
  try {
    await focusLogger().stop(entryId, at)
  } catch (err) {
    console.warn('focus: stopping the time entry failed', err)
  }
}

/** Starts the entry of a running work stretch and records its id on the row; an entry the row no longer wants is stopped again. */
async function attachEntry(s: FocusState, at: number): Promise<void> {
  if (s.phase !== 'work' || s.resumedAt === null) return
  let id: string | null = null
  try {
    id = await focusLogger().start(s.taskId, at)
  } catch (err) {
    console.warn('focus: starting the time entry failed', err)
  }
  if (!id) return
  const entry = id
  const kept = await transitionFocus(s.startedAt, (r) => (r.phase === 'work' && r.resumedAt === s.resumedAt && !r.entryId ? { ...r, entryId: entry } : null))
  if (!kept) await stopEntry(entry, Date.now())
}

/**
 * A transition of the current run plus the stop of the entry it ran with: `fn`
 * gets the row and returns the next state or null. Returns the written state.
 */
async function step(fn: (s: FocusState) => FocusState | null, stopAt: (prev: FocusState, next: FocusState) => number | null): Promise<FocusState | null> {
  const row = await readFocus()
  if (!row) return null
  const seen: { prev?: FocusState } = {}
  const next = await transitionFocus(row.startedAt, (r) => {
    seen.prev = r
    return fn(r)
  })
  const before = seen.prev
  if (!next || !before) return null
  const at = stopAt(before, next)
  if (at !== null && before.entryId && before.entryId !== next.entryId) await stopEntry(before.entryId, at)
  return next
}

/** Starts a work session on `taskId` (ending whatever ran before, on this task or another). */
export async function startSession(taskId: string, prefs: FocusPrefs, now = Date.now(), lengthMinutes?: number): Promise<FocusState> {
  const prev = await readFocus()
  if (prev && inRun(prev)) await stopEntry(prev.entryId, now)
  const base = prev ? { ...prev, taskId } : idleState(taskId, prefs.mode, now)
  const next = start(base, now, prefs, lengthMinutes ?? base.lengthMinutes)
  await writeFocus(next)
  await attachEntry(next, now)
  return next
}

export function pauseSession(now = Date.now()): Promise<FocusState | null> {
  return step((r) => (isRunning(r) ? pause(r, now) : null), () => now)
}

export async function resumeSession(now = Date.now()): Promise<FocusState | null> {
  const next = await step((r) => (inRun(r) && r.resumedAt === null ? resume(r, now) : null), () => null)
  if (next) await attachEntry(next, now)
  return next
}

/** A running timed run that reached its end: the done state (or the auto-started next phase), the entry stopped at the planned end. */
export async function finishIfDue(prefs: FocusPrefs, now = Date.now()): Promise<FocusState | null> {
  const row = await readFocus()
  if (!isDue(row, now)) return null
  const next = await step((r) => (isDue(r, now) ? finish(r, prefs) : null), (_, n) => n.ended?.at ?? now)
  if (next?.phase === 'work') await attachEntry(next, next.startedAt)
  return next
}

/** Flowtime's Done (and a work session ended by hand): the done state with the time worked. */
export function stopSession(now = Date.now()): Promise<FocusState | null> {
  return step((r) => (r.phase === 'work' ? stopWork(r, now) : null), () => now)
}

/** `b`: take a break now (from work or the done state), or end the running break. */
export function breakSession(prefs: FocusPrefs, now = Date.now()): Promise<FocusState | null> {
  return step((r) => (r.phase === 'work' || r.phase === 'break' || (r.phase === 'done' && r.ended?.kind === 'work') ? takeBreak(r, now, prefs) : null), () => now)
}

/** The task was completed (here or on another device): the session ends and `nextTaskId` is shown next. */
export async function completeSession(taskId: string, nextTaskId: string | null, prefs: FocusPrefs, now = Date.now(), elsewhere = false): Promise<FocusState | null> {
  const row = await readFocus()
  if (!row || row.taskId !== taskId) {
    const base = idleState(taskId, prefs.mode, now, row ?? undefined)
    if (row && inRun(row)) await stopEntry(row.entryId, now)
    const next = complete(base, now, nextTaskId, elsewhere)
    await writeFocus(next)
    return next
  }
  if (row.phase === 'done' && row.ended?.kind === 'complete') return null
  return step((r) => (r.taskId === taskId && !(r.phase === 'done' && r.ended?.kind === 'complete') ? complete(r, now, nextTaskId, elsewhere) : null), () => now)
}

/** Next task or another task chosen: the run ends without a done state; nothing runs on `taskId` yet. */
export async function leaveSession(taskId: string | null, prefs: FocusPrefs, now = Date.now()): Promise<void> {
  const row = await readFocus()
  if (row && inRun(row)) await stopEntry(row.entryId, now)
  if (!taskId) return
  await writeFocus(idleState(taskId, prefs.mode, now, row ?? undefined))
}

/** The session's entry was stopped on another device: the session pauses with the reason; Space starts a new entry. */
export async function noteEntryStopped(entryId: string, now = Date.now()): Promise<FocusState | null> {
  if (await focusLogger().running(entryId)) return null
  const row = await readFocus()
  if (!row) return null
  return transitionFocus(row.startedAt, (r) => (r.entryId === entryId && isRunning(r) ? pause(r, now, 'elsewhere') : null))
}

/** "Not now" on the break reminder: it comes back after the same length of further continuous work. */
export async function putOffBreak(now = Date.now()): Promise<void> {
  const row = await readFocus()
  if (!row) return
  await transitionFocus(row.startedAt, (r) => (r.phase === 'work' ? { ...r, remindedAtMs: continuousWork(r, now) } : null))
}

/** A session that "Start focus" left for another task: its state at that moment (paused), and whether its clock ran. */
export interface LeftSession {
  taskId: string
  state: FocusState
  running: boolean
}

/** What `startFocus` did: the session already runs on the task, Countdown asks for its length first, or a session started (leaving `left`). */
export type StartFocusResult =
  | { kind: 'here' }
  | { kind: 'ask' }
  | { kind: 'started'; state: FocusState; left: LeftSession | null }

/**
 * "Start focus" on a task (focus-everywhere D2), shared by the panel's Focus
 * button, the task Actions menu and "Focus on this task": nothing to do when the
 * device's session is already on that task, a length first in Countdown (unless
 * given), else a work session starts, leaving another task's session the way
 * "Change task" does (its entry stops). `force` starts even on the same task (the
 * Focus screen's own Start). The left session is returned so Undo can
 * bring it back (`resumeLeft`).
 */
export async function startFocus(taskId: string, prefs: FocusPrefs, opts: { now?: number; lengthMinutes?: number; force?: boolean } = {}): Promise<StartFocusResult> {
  const now = opts.now ?? Date.now()
  const row = await readFocus()
  if (!opts.force && row && row.taskId === taskId && (inRun(row) || row.phase === 'done')) return { kind: 'here' }
  if (prefs.mode === 'countdown' && opts.lengthMinutes === undefined) return { kind: 'ask' }
  const left: LeftSession | null = row && inRun(row) && row.taskId !== taskId ? { taskId: row.taskId, state: pause(row, now), running: isRunning(row) } : null
  const state = await startSession(taskId, prefs, now, opts.lengthMinutes)
  return { kind: 'started', state, left }
}

/** Undo of a left session: whatever runs now stops, and the left session comes back as it was (its clock running again, with a new entry, when it ran). */
export async function resumeLeft(left: LeftSession, now = Date.now()): Promise<FocusState> {
  const row = await readFocus()
  if (row && inRun(row)) await stopEntry(row.entryId, now)
  const next: FocusState = { ...left.state, resumedAt: left.running ? now : null, entryId: null, pausedReason: null }
  await writeFocus(next)
  await attachEntry(next, now)
  return next
}

/** The extensions a finished work session offers (focus-everywhere D4), in minutes, for 10 minutes after its end. */
export const EXTEND_MINUTES = [5, 15] as const
export const EXTEND_WINDOW_MS = 10 * 60_000

/**
 * Whether the run shown may still be extended at `now`: a timed work session
 * (Pomodoro or Countdown) that ended under 10 minutes ago, shown as the done
 * state or as the break "Start breaks automatically" started at its end.
 */
export function canExtend(s: FocusState | null | undefined, now: number): boolean {
  if (!s || !s.ended || s.ended.kind !== 'work' || (s.mode !== 'pomodoro' && s.mode !== 'countdown')) return false
  if (now - s.ended.at >= EXTEND_WINDOW_MS) return false
  return s.phase === 'done' || (s.phase === 'break' && !!s.ended.auto && s.startedAt === s.ended.at)
}

/**
 * "+5 min" and "+15 min": the same session goes on for that long (focus-everywhere
 * D4). It stays the same cycle, starts a new entry as resuming does (the time the
 * done state was shown is not logged), and replaces a break that started on its
 * own at the end.
 */
export async function extendSession(minutes: number, now = Date.now()): Promise<FocusState | null> {
  const row = await readFocus()
  if (!row) return null
  const next = await transitionFocus(row.startedAt, (r) => (canExtend(r, now) ? {
    ...r, phase: 'work', startedAt: now, resumedAt: now, accumulatedMs: 0, plannedMs: minutes * 60_000, breakKind: null,
    entryId: null, pausedReason: null, remindedAtMs: 0, ended: null,
  } : null))
  if (next) await attachEntry(next, now)
  return next
}
