import { describe, expect, it } from 'vitest'
import { focusTarget, nextFocusTask } from './select'
import { complete, idleState, start } from './timer'
import { FOCUS_DEFAULTS } from './prefs'

// Task selection (OpenSpec focus-mode, task 2.3).

const open = (id: string) => ({ id, completed_at: null, deleted_at: null })
const done = (id: string) => ({ id, completed_at: 1, deleted_at: null })
const trashed = (id: string) => ({ id, completed_at: null, deleted_at: 1 })

describe('nextFocusTask', () => {
  it('From the focus list: A first, then B after A', () => {
    const tasks = [open('A'), open('B'), open('C')]
    expect(nextFocusTask(['A', 'B', 'C'], tasks, null)).toBe('A')
    expect(nextFocusTask(['A', 'B', 'C'], [done('A'), open('B'), open('C')], 'A')).toBe('B')
  })

  it('Focus done: nothing after C once A and B are completed', () => {
    expect(nextFocusTask(['A', 'B', 'C'], [done('A'), done('B'), done('C')], 'C')).toBeNull()
  })

  it('Task from the address: a task outside the list is followed by the first list task', () => {
    expect(nextFocusTask(['A', 'B'], [open('A'), open('B'), open('X')], 'X')).toBe('A')
  })

  it('skips completed, trashed and missing tasks, and comes round to the ones before', () => {
    expect(nextFocusTask(['A', 'B', 'C', 'D'], [open('A'), done('B'), trashed('C')], 'A')).toBeNull()
    expect(nextFocusTask(['A', 'B', 'C'], [open('A'), open('B'), done('C')], 'B')).toBe('A')
  })
})

describe('focusTarget', () => {
  const tasks = [open('A'), open('B'), open('X'), done('Z')]
  it('takes the address, else the running session, else the first focus task', () => {
    expect(focusTarget({ routeId: 'X', state: null, focusIds: ['A', 'B'], tasks })).toEqual({ taskId: 'X', unavailable: false })
    const running = start(idleState('B', 'pomodoro', 0), 0, FOCUS_DEFAULTS)
    expect(focusTarget({ state: running, focusIds: ['A', 'B'], tasks })).toEqual({ taskId: 'B', unavailable: false })
    expect(focusTarget({ state: idleState('B', 'pomodoro', 0), focusIds: ['A', 'B'], tasks })).toEqual({ taskId: 'A', unavailable: false })
  })

  it('Unknown or closed task: falls back to the focus list and says so', () => {
    expect(focusTarget({ routeId: 'nope', state: null, focusIds: ['A'], tasks })).toEqual({ taskId: 'A', unavailable: true })
    expect(focusTarget({ routeId: 'Z', state: null, focusIds: [], tasks })).toEqual({ taskId: null, unavailable: true })
  })

  it('keeps the done state of a task completed here, showing the next task', () => {
    const s = complete(start(idleState('Z', 'pomodoro', 0), 0, FOCUS_DEFAULTS), 1000, 'A')
    expect(focusTarget({ routeId: 'Z', state: s, focusIds: ['Z', 'A'], tasks })).toEqual({ taskId: 'A', unavailable: false })
  })
})
