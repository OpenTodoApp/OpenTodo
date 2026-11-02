// A failed time entry is never silent: the session reports start and stop failures
// to whoever subscribed (the app's toast host words them, see ToastActionHost.test).
// The session keeps working either way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { noopLogger, setFocusLogger, timeTrackingLogger } from './index'
import { FOCUS_DEFAULTS } from './prefs'
import { readFocus } from './state'
import { startSession, stopSession } from './session'
import { onEntryFailure, type EntryFailure } from './failures'

let n = 0
let seen: EntryFailure[] = []
let off = () => {}
const T0 = new Date(2026, 9, 20, 9, 0).getTime()

/** The logger whose start (or stop) always fails. */
function failingLogger(mode: 'start' | 'stop') {
  return {
    start: mode === 'start' ? async () => { throw new Error('time entry not found') } : async () => 'entry-1',
    stop: mode === 'stop' ? async () => { throw new Error('time entry not found') } : async () => undefined,
    running: async () => true,
  }
}

beforeEach(() => {
  useDatabase(`focus-session-toast-${Date.now()}-${n++}`)
  resetDeviceId()
  seen = []
  off = onEntryFailure((f) => seen.push(f))
})

afterEach(() => {
  setFocusLogger(timeTrackingLogger)
  off()
  vi.restoreAllMocks()
})

describe('a failed time entry is reported to the subscribers', () => {
  it('start failure: the session still runs and the failure names the start', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(failingLogger('start'))
    const s = await startSession(id, FOCUS_DEFAULTS, T0)
    expect(s.phase).toBe('work')
    expect((await readFocus())?.entryId).toBeNull()
    expect(seen).toHaveLength(1)
    expect(seen[0].phase).toBe('start')
    expect((seen[0].error as Error).message).toBe('time entry not found')
  })

  it('stop failure: the failure names the stop', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(failingLogger('stop'))
    await startSession(id, FOCUS_DEFAULTS, T0)
    await stopSession(T0 + 5 * 60_000)
    expect(seen.map((f) => f.phase)).toEqual(['stop'])
  })

  it('a working logger reports nothing', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(noopLogger)
    await startSession(id, FOCUS_DEFAULTS, T0)
    expect(seen).toEqual([])
  })
})

describe('the subscription', () => {
  it('stops delivering after the unsubscribe', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(failingLogger('start'))
    off()
    await startSession(id, FOCUS_DEFAULTS, T0)
    expect(seen).toEqual([])
  })
})
