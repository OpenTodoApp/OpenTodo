// The focus timer model (OpenSpec change focus-mode, design D1): one record and
// pure functions over it, each taking `now`. Nothing counts ticks: elapsed time is
// always computed from the clock, so a hidden or throttled tab, a laptop that
// slept or a reload reads the right value, and every scenario is a table over a
// fake clock. The record lives in the device's local store (state.ts).
import { t } from '../i18n'
import type { FocusMode, FocusPrefs } from './prefs'

export type FocusPhase = 'idle' | 'work' | 'break' | 'done'

/** What the done state reports: the run that ended, how long was worked, and what comes next. */
export interface FocusEnded {
  /** `work`: a work session ended (its time ran out, or Flowtime's Done); `break`: a break ended; `complete`: the task was completed. */
  kind: 'work' | 'break' | 'complete'
  /** Work time of the session that ended, pauses excluded; 0 for a break. */
  workedMs: number
  /** When it ended (a timed run: its planned end, however late the tab noticed). */
  at: number
  /** The `startedAt` of the run that ended: the notification tag, so two tabs show one. */
  runStartedAt: number
  /** The break a finished Pomodoro work session leads to. */
  nextBreak?: 'short' | 'long'
  /** The task that was completed (the screen may already show the next one). */
  taskId?: string
  /** The task was completed or trashed on another device. */
  elsewhere?: boolean
}

export interface FocusState {
  /** The one row's key in the local table. */
  id: 'current'
  taskId: string
  mode: FocusMode
  phase: FocusPhase
  /** The start of the current phase: the identity of a run (two tabs compare it before writing). */
  startedAt: number
  /** Since when the current stretch runs; null while paused (and outside a run). */
  resumedAt: number | null
  /** Run time before the current stretch (pauses excluded). */
  accumulatedMs: number
  /** The planned length of a timed run; null for Flowtime work (counts up). */
  plannedMs: number | null
  /** The work session's number in the Pomodoro cycle, from 1 to the long-break count. */
  cycle: number
  /** The break that runs (phase `break`). */
  breakKind: 'short' | 'long' | null
  /** The last Countdown length on this device, in minutes. */
  lengthMinutes: number
  /** The running time entry of this stretch (time-tracking), null without one. */
  entryId: string | null
  /** Why the run is paused when the user did not pause it ("Entry stopped elsewhere"). */
  pausedReason: 'elsewhere' | null
  /** Continuous work at which the break reminder was put off ("Not now"); 0 when it never was. */
  remindedAtMs: number
  ended: FocusEnded | null
}

const MIN = 60_000

/** A fresh record for a task: nothing runs. */
export function idleState(taskId: string, mode: FocusMode, now: number, keep?: Pick<FocusState, 'cycle' | 'lengthMinutes'>): FocusState {
  return {
    id: 'current', taskId, mode, phase: 'idle', startedAt: now, resumedAt: null, accumulatedMs: 0, plannedMs: null,
    cycle: keep?.cycle ?? 1, breakKind: null, lengthMinutes: keep?.lengthMinutes ?? 25, entryId: null, pausedReason: null, remindedAtMs: 0, ended: null,
  }
}

/** Whether a work session or a break is under way (running or paused). */
export const inRun = (s: FocusState | null | undefined): boolean => !!s && (s.phase === 'work' || s.phase === 'break')
/** Whether the clock runs. */
export const isRunning = (s: FocusState | null | undefined): boolean => inRun(s) && s!.resumedAt !== null

/** Run time so far, pauses excluded. */
export function elapsed(s: FocusState, now: number): number {
  if (!inRun(s)) return 0
  return s.accumulatedMs + (s.resumedAt !== null ? Math.max(0, now - s.resumedAt) : 0)
}

/** Time left of a timed run; null for Flowtime work and outside a run. */
export function remaining(s: FocusState, now: number): number | null {
  if (!inRun(s) || s.plannedMs === null) return null
  return Math.max(0, s.plannedMs - elapsed(s, now))
}

/** When a running timed run reaches its end (null for Flowtime or while paused). */
export function plannedEnd(s: FocusState): number | null {
  if (!inRun(s) || s.plannedMs === null || s.resumedAt === null) return null
  return s.resumedAt + (s.plannedMs - s.accumulatedMs)
}

/** Whether a running timed run is over at `now`. */
export function isDue(s: FocusState | null | undefined, now: number): boolean {
  const end = s ? plannedEnd(s) : null
  return end !== null && now >= end
}

function workPlan(mode: FocusMode, prefs: FocusPrefs, lengthMinutes: number): number | null {
  return mode === 'pomodoro' ? prefs.workMinutes * MIN : mode === 'countdown' ? lengthMinutes * MIN : null
}

const breakMs = (kind: 'short' | 'long', prefs: FocusPrefs) => (kind === 'long' ? prefs.longBreakMinutes : prefs.shortBreakMinutes) * MIN

/** Starts a work session on the record's task (Countdown with `lengthMinutes`, remembered for next time). */
export function start(s: FocusState, now: number, prefs: FocusPrefs, lengthMinutes = s.lengthMinutes): FocusState {
  return {
    ...s, mode: prefs.mode, phase: 'work', startedAt: now, resumedAt: now, accumulatedMs: 0,
    plannedMs: workPlan(prefs.mode, prefs, lengthMinutes), breakKind: null, lengthMinutes, entryId: null, pausedReason: null, remindedAtMs: 0, ended: null,
  }
}

/** Pauses the running stretch; `reason` when the pause did not come from the user. */
export function pause(s: FocusState, now: number, reason: FocusState['pausedReason'] = null): FocusState {
  if (!isRunning(s)) return s
  return { ...s, accumulatedMs: elapsed(s, now), resumedAt: null, entryId: null, pausedReason: reason }
}

export function resume(s: FocusState, now: number): FocusState {
  if (!inRun(s) || s.resumedAt !== null) return s
  return { ...s, resumedAt: now, pausedReason: null }
}

function breakState(s: FocusState, at: number, kind: 'short' | 'long', prefs: FocusPrefs, ended: FocusEnded | null): FocusState {
  return { ...s, phase: 'break', startedAt: at, resumedAt: at, accumulatedMs: 0, plannedMs: breakMs(kind, prefs), breakKind: kind, entryId: null, pausedReason: null, ended }
}

/**
 * A timed run reached its end at its planned instant: a work session becomes the
 * done state (or, with "Start breaks automatically" in Pomodoro, its break), a
 * break becomes the done state (or the next work session with "Start the next
 * session automatically"). Pomodoro offers the long break after every
 * `longBreakEvery` sessions and starts the count again after it.
 */
export function finish(s: FocusState, prefs: FocusPrefs): FocusState {
  const at = plannedEnd(s)
  if (at === null) return s
  if (s.phase === 'work') {
    const nextBreak = s.mode === 'pomodoro' ? (s.cycle >= prefs.longBreakEvery ? 'long' : 'short') : undefined
    const ended: FocusEnded = { kind: 'work', workedMs: s.plannedMs ?? 0, at, runStartedAt: s.startedAt, ...(nextBreak ? { nextBreak } : {}) }
    if (nextBreak && prefs.autoStartBreaks) return breakState(s, at, nextBreak, prefs, ended)
    return { ...s, phase: 'done', resumedAt: null, accumulatedMs: s.plannedMs ?? 0, entryId: null, ended }
  }
  const cycle = s.breakKind === 'long' ? 1 : s.cycle + 1
  const ended: FocusEnded = { kind: 'break', workedMs: 0, at, runStartedAt: s.startedAt }
  if (prefs.autoStartWork && s.mode === 'pomodoro') return { ...start({ ...s, cycle }, at, { ...prefs, mode: s.mode }), ended }
  return { ...s, phase: 'done', cycle, resumedAt: null, accumulatedMs: 0, breakKind: null, entryId: null, ended }
}

/** Ends a work session by hand (Flowtime's Done, a Countdown stopped early): the done state with the time worked. */
export function stopWork(s: FocusState, now: number): FocusState {
  if (s.phase !== 'work') return s
  const worked = elapsed(s, now)
  return { ...s, phase: 'done', resumedAt: null, accumulatedMs: worked, entryId: null, ended: { kind: 'work', workedMs: worked, at: now, runStartedAt: s.startedAt } }
}

/**
 * `b`: from a work session, end its work and start a break now (the short one, or
 * the long one when the cycle is due); during a break, end the break.
 */
export function takeBreak(s: FocusState, now: number, prefs: FocusPrefs): FocusState {
  if (s.phase === 'break') {
    const cycle = s.breakKind === 'long' ? 1 : s.cycle + 1
    return { ...s, phase: 'done', cycle, resumedAt: null, accumulatedMs: 0, breakKind: null, entryId: null, ended: { kind: 'break', workedMs: 0, at: now, runStartedAt: s.startedAt } }
  }
  const kind = s.phase === 'done' && s.ended?.nextBreak ? s.ended.nextBreak : s.mode === 'pomodoro' && s.cycle >= prefs.longBreakEvery ? 'long' : 'short'
  const ended: FocusEnded | null = s.phase === 'work' ? { kind: 'work', workedMs: elapsed(s, now), at: now, runStartedAt: s.startedAt } : null
  return breakState(s, now, kind, prefs, ended)
}

/** The task was completed (here or elsewhere): the session ends with the time worked; `nextTaskId` is shown next. */
export function complete(s: FocusState, now: number, nextTaskId: string | null, elsewhere = false): FocusState {
  const worked = s.phase === 'work' ? elapsed(s, now) : 0
  return {
    ...s, taskId: nextTaskId ?? s.taskId, phase: 'done', resumedAt: null, accumulatedMs: worked, plannedMs: null, breakKind: null, entryId: null, pausedReason: null,
    ended: { kind: 'complete', workedMs: worked, at: now, runStartedAt: s.startedAt, taskId: s.taskId, ...(elsewhere ? { elsewhere } : {}) },
  }
}

/** Continuous work of the running session, pauses excluded (the break reminder's count). */
export function continuousWork(s: FocusState, now: number): number {
  return s.phase === 'work' ? elapsed(s, now) : 0
}

/** The timer's digits: `24:59`, `1:05:00` from an hour. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** What the digits show: the time left of a timed run, else the time worked. */
export function displayMs(s: FocusState, now: number, idlePlanMs: number | null): number {
  if (s.phase === 'done') return s.ended?.workedMs ?? 0
  if (!inRun(s)) return idlePlanMs ?? 0
  return remaining(s, now) ?? elapsed(s, now)
}

/**
 * The announcement for assistive technology (design D13): a key that changes only
 * at the moments the spec lists (a start or resume, every five minutes, one minute
 * left, the end) and the text to say then. The screen announces when the key
 * changes, so the text is said once per moment, never every second.
 */
export function announcementAt(s: FocusState, now: number): { key: string; text: string } | null {
  if (s.phase === 'done' && s.ended) {
    return { key: `${s.ended.runStartedAt}:end`, text: s.ended.kind === 'break' ? t('Break over') : t('Session done') }
  }
  if (!inRun(s) || s.resumedAt === null) return null
  const run = `${s.startedAt}:${s.resumedAt}`
  const left = remaining(s, now)
  if (left === null) {
    const worked = elapsed(s, now)
    const bucket = Math.floor(worked / (5 * MIN))
    return { key: `${run}:${bucket}`, text: bucket === 0 ? t('Session started') : t('{n, plural, one {# minute worked} other {# minutes worked}}', { n: Math.floor(worked / MIN) }) }
  }
  if (left <= 0) return { key: `${s.startedAt}:end`, text: s.phase === 'break' ? t('Break over') : t('Session done') }
  if (left <= MIN) return { key: `${run}:1`, text: t('{n, plural, one {# minute left} other {# minutes left}}', { n: 1 }) }
  const bucket = Math.ceil(left / (5 * MIN)) * 5
  return { key: `${run}:${bucket}`, text: t('{n, plural, one {# minute left} other {# minutes left}}', { n: Math.ceil(left / MIN) }) }
}
