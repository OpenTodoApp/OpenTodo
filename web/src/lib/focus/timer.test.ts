import { describe, expect, it } from 'vitest'
import { FOCUS_DEFAULTS, type FocusPrefs } from './prefs'
import { announcementAt, clockText, complete, elapsed, finish, idleState, isDue, pause, remaining, resume, start, stopWork, takeBreak, type FocusState } from './timer'

// The timer model against a fake clock (OpenSpec focus-mode, task 2.1).

const T0 = new Date(2026, 9, 20, 9, 0).getTime()
const MIN = 60_000
const at = (m: number) => T0 + m * MIN
const pomodoro: FocusPrefs = { ...FOCUS_DEFAULTS }
const fresh = (prefs: FocusPrefs = pomodoro) => idleState('task-a', prefs.mode, T0)

/** Runs a session to its end and finishes it. */
function runOut(s: FocusState, prefs: FocusPrefs): FocusState {
  const end = (s.resumedAt ?? 0) + (s.plannedMs ?? 0) - s.accumulatedMs
  expect(isDue(s, end)).toBe(true)
  return finish(s, prefs)
}

describe('Pomodoro cycle', () => {
  it('offers the long break after the fourth session and starts the count again after it', () => {
    let s = start(fresh(), at(0), pomodoro)
    const breaks: string[] = []
    for (let i = 1; i <= 4; i++) {
      expect(s.cycle).toBe(i)
      s = runOut(s, pomodoro)
      expect(s.phase).toBe('done')
      expect(s.ended).toMatchObject({ kind: 'work', workedMs: 25 * MIN })
      breaks.push(s.ended!.nextBreak!)
      s = takeBreak(s, s.ended!.at, pomodoro)
      expect(s.phase).toBe('break')
      expect(s.plannedMs).toBe((i === 4 ? 15 : 5) * MIN)
      s = runOut(s, pomodoro)
      expect(s.ended?.kind).toBe('break')
      s = start(s, s.ended!.at, pomodoro)
    }
    expect(breaks).toEqual(['short', 'short', 'short', 'long'])
    expect(s.cycle).toBe(1)
  })

  it('Auto-start: a finished session goes into its break and the break into the next session, each keeping the done report', () => {
    const prefs = { ...pomodoro, autoStartBreaks: true, autoStartWork: true }
    let s = runOut(start(fresh(prefs), at(0), prefs), prefs)
    expect(s).toMatchObject({ phase: 'break', startedAt: at(25), breakKind: 'short' })
    expect(s.ended).toMatchObject({ kind: 'work', workedMs: 25 * MIN })
    s = runOut(s, prefs)
    expect(s).toMatchObject({ phase: 'work', startedAt: at(30), cycle: 2, taskId: 'task-a' })
    expect(s.ended?.kind).toBe('break')
  })
})

describe('modes', () => {
  it('Flowtime counts up without an end until Done', () => {
    const prefs = { ...pomodoro, mode: 'flowtime' as const }
    const s = start(fresh(prefs), at(0), prefs)
    expect(remaining(s, at(300))).toBeNull()
    expect(isDue(s, at(300))).toBe(false)
    expect(elapsed(s, at(47))).toBe(47 * MIN)
    const done = stopWork(s, at(47))
    expect(done.ended).toMatchObject({ kind: 'work', workedMs: 47 * MIN })
  })

  it('Countdown length: counts down from the chosen length, no break after it', () => {
    const prefs = { ...pomodoro, mode: 'countdown' as const }
    const s = start(fresh(prefs), at(0), prefs, 40)
    expect(s.lengthMinutes).toBe(40)
    expect(remaining(s, at(10))).toBe(30 * MIN)
    const done = runOut(s, prefs)
    expect(done.phase).toBe('done')
    expect(done.ended?.nextBreak).toBeUndefined()
  })

  it('pauses exclude time and resuming continues', () => {
    let s = start(fresh(), at(0), pomodoro)
    s = pause(s, at(10))
    expect(remaining(s, at(20))).toBe(15 * MIN)
    s = resume(s, at(20))
    expect(remaining(s, at(25))).toBe(10 * MIN)
    expect(isDue(s, at(35))).toBe(true)
    expect(finish(s, pomodoro).ended).toMatchObject({ workedMs: 25 * MIN, at: at(35) })
  })

  it('completing ends the session with the time worked and shows the next task', () => {
    const s = complete(start(fresh(), at(0), pomodoro), at(12), 'task-b')
    expect(s).toMatchObject({ phase: 'done', taskId: 'task-b' })
    expect(s.ended).toMatchObject({ kind: 'complete', workedMs: 12 * MIN, taskId: 'task-a' })
  })
})

describe('Timer accuracy', () => {
  it('Tab hidden through the end: thirty minutes later the run is due and finishes with 25:00 worked', () => {
    const s = start(fresh(), at(0), pomodoro)
    expect(remaining(s, at(30))).toBe(0)
    const done = finish(s, pomodoro)
    expect(done.phase).toBe('done')
    expect(clockText(done.ended!.workedMs)).toBe('25:00')
    expect(done.ended!.at).toBe(at(25))
  })

  it('Reload: the stored record read back ten minutes in shows ten minutes, running', () => {
    const stored = JSON.parse(JSON.stringify(start(fresh(), at(0), pomodoro))) as FocusState
    expect(elapsed(stored, at(10))).toBe(10 * MIN)
    expect(clockText(remaining(stored, at(10))!)).toBe('15:00')
    expect(stored.resumedAt).not.toBeNull()
  })
})

describe('Announcements', () => {
  it('says the time left at the start, every five minutes, at one minute and at the end, and nothing between', () => {
    let s = start(fresh(), at(0), pomodoro)
    const said: string[] = []
    let last = ''
    for (let sec = 0; sec <= 25 * 60; sec++) {
      const now = T0 + sec * 1000
      if (isDue(s, now)) s = finish(s, pomodoro)
      const a = announcementAt(s, now)
      if (a && a.key !== last) { said.push(a.text); last = a.key }
    }
    expect(said).toEqual(['25 minutes left', '20 minutes left', '15 minutes left', '10 minutes left', '5 minutes left', '1 minute left', 'Session done'])
  })

  it('a resume is said once, with the time left then', () => {
    let s = pause(start(fresh(), at(0), pomodoro), at(7.5))
    expect(announcementAt(s, at(9))).toBeNull()
    s = resume(s, at(9))
    expect(announcementAt(s, at(9))?.text).toBe('18 minutes left')
  })
})
