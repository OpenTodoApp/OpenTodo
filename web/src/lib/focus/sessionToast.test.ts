// A failed time entry is never silent: start and stop failures surface in the
// action toast, whose message says the minutes were not logged. The session keeps
// working either way.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../db'
import { createTask, resetDeviceId } from '../ops'
import { noopLogger, setFocusLogger, timeTrackingLogger } from './index'
import { FOCUS_DEFAULTS } from './prefs'
import { readFocus } from './state'
import { startSession, stopSession } from './session'
import { actionToast, hideActionToast } from '../../app/bulk/toastStore'

let n = 0
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
})

afterEach(() => {
  setFocusLogger(timeTrackingLogger)
  hideActionToast()
  vi.restoreAllMocks()
})

describe('a failed time entry surfaces in the action toast', () => {
  it('start failure: the session still runs and the toast says nothing is tracked', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(failingLogger('start'))
    const s = await startSession(id, FOCUS_DEFAULTS, T0)
    expect(s.phase).toBe('work')
    expect((await readFocus())?.entryId).toBeNull()
    const toast = actionToast()
    expect(toast?.tone).toBe('danger')
    expect(toast?.label).toContain('could not be started')
    expect(toast?.label).toContain('not being tracked')
  })

  it('stop failure: the toast warns the minutes may not be logged', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(failingLogger('stop'))
    await startSession(id, FOCUS_DEFAULTS, T0)
    await stopSession(T0 + 5 * 60_000)
    const toast = actionToast()
    expect(toast?.tone).toBe('danger')
    expect(toast?.label).toContain('could not be stopped')
  })

  it('a working logger raises no toast', async () => {
    const id = await createTask({ title: 'Deep work' })
    setFocusLogger(noopLogger)
    await startSession(id, FOCUS_DEFAULTS, T0)
    expect(actionToast()).toBeNull()
  })
})
