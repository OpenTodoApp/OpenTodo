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
