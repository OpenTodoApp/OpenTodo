// The Focus session handed to a native shell (OpenSpec change focus-live-activity,
// design D1, D5): the whole state on every change of the stored row, the
// preferences, the titles option or the lock, so every transition (start, pause,
// resume, phase change, end, another task, leaving the screen) publishes once.
// The shell draws its Live Activity or ongoing notification from it. Nothing here
// writes an op or reaches the server; outside a shell with `focus` nothing runs.
import { liveQuery, type Subscription } from 'dexie'
import { db } from '../db'
import { encryptionSnapshot, onEncryptionChange } from '../e2ee'
import { has, NO_FOCUS, publishFocus, type ShellFocus } from '../shell'
import { shellTitlesEnabled } from '../shellPublish'
import { focusPrefs, type FocusPrefs } from './prefs'
import { readFocus } from './state'
import { inRun, plannedEnd, type FocusState } from './timer'

/** The payload for a stored state; `title` only when the caller may hand it over. */
export function focusPayload(s: FocusState | null, prefs: Pick<FocusPrefs, 'longBreakEvery'>, title?: string): ShellFocus {
  if (!s || (!inRun(s) && s.phase !== 'done')) return NO_FOCUS
  const done = s.phase === 'done'
  const phase = done ? (s.ended?.kind === 'break' ? 'break' : 'work') : (s.phase as 'work' | 'break')
  const end = plannedEnd(s)
  return {
    v: 1,
    state: done ? 'done' : s.resumedAt !== null ? 'running' : 'paused',
    taskId: done ? (s.ended?.taskId ?? s.taskId) : s.taskId,
    ...(title ? { title } : {}),
    mode: s.mode,
    phase,
    ...(phase === 'break' && s.breakKind ? { breakKind: s.breakKind } : {}),
    ...(s.mode === 'pomodoro' ? { cycle: s.cycle, cycleLength: prefs.longBreakEvery } : {}),
    phaseStartedAt: s.startedAt,
    ...(!done && s.resumedAt !== null ? { runningSince: s.resumedAt } : {}),
    elapsedMs: s.accumulatedMs,
    ...(end !== null ? { plannedEndAt: end } : {}),
    ...(s.plannedMs !== null && !done ? { plannedMs: s.plannedMs } : {}),
  }
}

/** Reads the stored session and what may be shown of it: none while an encrypted account is locked. */
async function current(): Promise<ShellFocus> {
  const enc = encryptionSnapshot()
  if (enc.enabled && !enc.unlocked) return NO_FOCUS
  const [s, row, titles] = await Promise.all([readFocus(), db.userPrefs.get('me'), shellTitlesEnabled()])
  const taskId = s ? (s.phase === 'done' ? (s.ended?.taskId ?? s.taskId) : s.taskId) : null
  const task = taskId && titles && !enc.enabled ? await db.tasks.get(taskId) : undefined
  return focusPayload(s, focusPrefs(row), task?.title || undefined)
}

/**
 * Starts publishing in a shell that lists `focus`. The live query re-reads exactly
 * what `current` reads (the row, the preferences, the titles option, the task), so
 * an unrelated write publishes nothing; the first publication is always handed
 * over, so a shell that outlived the page reconciles (D7).
 */
export function startFocusPublisher(): () => void {
  if (!has('focus')) return () => {}
  let fresh = true
  const send = (p: ShellFocus) => { publishFocus(p, fresh); fresh = false }
  const sub: Subscription = liveQuery(current).subscribe({ next: send, error: () => undefined })
  const offEnc = onEncryptionChange(() => void current().then(send).catch(() => undefined))
  return () => { sub.unsubscribe(); offEnc() }
}
