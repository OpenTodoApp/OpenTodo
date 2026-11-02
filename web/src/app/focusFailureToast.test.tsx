// A failure inside the focus session reaches the toast through the subscription
// (lib/focus/failures), with the message worded on the app side.
// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { noopLogger, setFocusLogger, timeTrackingLogger } from '../lib/focus'
import { FOCUS_DEFAULTS } from '../lib/focus/prefs'
import { readFocus } from '../lib/focus/state'
import { startSession, stopSession } from '../lib/focus/session'
import { createTask, resetDeviceId } from '../lib/ops'
import { render, waitFor } from '../ui/test-utils'
import { ToastActionHost } from './ToastActionHost'
import { hideActionToast } from './bulk/toastStore'

let n = 0
const T0 = new Date(2026, 9, 20, 9, 0).getTime()
const failing = (mode: 'start' | 'stop') => ({
  start: mode === 'start' ? async () => { throw new Error('time entry not found') } : async () => 'entry-1',
  stop: mode === 'stop' ? async () => { throw new Error('time entry not found') } : async () => undefined,
  running: async () => true,
})
const message = () => document.querySelector('[data-action-toast] [role="status"]')?.textContent ?? null

beforeEach(() => {
  useDatabase(`focus-failure-toast-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => {
  setFocusLogger(timeTrackingLogger)
  act(() => hideActionToast())
})

describe('a failed focus time entry reaches the toast', () => {
  it('start failure: the session runs and the toast says nothing is tracked', async () => {
    const id = await createTask({ title: 'Deep work' })
    const r = await render(<ToastActionHost />)
    setFocusLogger(failing('start'))
    const s = await act(() => startSession(id, FOCUS_DEFAULTS, T0))
    expect(s.phase).toBe('work')
    expect((await readFocus())?.entryId).toBeNull()
    await waitFor(() => message() !== null, 'the failure toast')
    expect(message()).toBe('The time entry could not be started; this session is not being tracked. (time entry not found)')
    await r.unmount()
  })

  it('stop failure: the toast warns the minutes may not be logged', async () => {
    const id = await createTask({ title: 'Deep work' })
    const r = await render(<ToastActionHost />)
    setFocusLogger(failing('stop'))
    await act(() => startSession(id, FOCUS_DEFAULTS, T0))
    await act(() => stopSession(T0 + 5 * 60_000))
    await waitFor(() => message() !== null, 'the failure toast')
    expect(message()).toContain('could not be stopped; the minutes may not be logged correctly')
    await r.unmount()
  })

  it('a working logger raises no toast', async () => {
    const id = await createTask({ title: 'Deep work' })
    const r = await render(<ToastActionHost />)
    setFocusLogger(noopLogger)
    await act(() => startSession(id, FOCUS_DEFAULTS, T0))
    expect(message()).toBeNull()
    await r.unmount()
  })
})
