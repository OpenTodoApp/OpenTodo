// @vitest-environment happy-dom
// Today's sessions (OpenSpec change focus-redesign, task 2.2): the sheet lists
// today's entries the Focus screen wrote, newest first, with the count and the total;
// entries tracked elsewhere are not sessions; local rows only, so it works offline.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, mutateMany, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { logTime, planEntry } from '../../lib/timeEntries'
import type { TimeEntry } from '../../lib/types'
import { render, waitFor } from '../../ui/test-utils'
import FocusSessions, { sessionsSummary, todaysSessions } from './FocusSessions'

const T0 = new Date(2026, 9, 14, 17, 0).getTime()
const MIN = 60_000
const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m).getTime()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await db.delete()
  await db.open()
  resetDeviceId()
  await setCurrentUserId('u1')
  // Offline: every request fails, and the sheet reads local rows only.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function session(taskId: string, mode: string, start: number, minutes: number) {
  await mutateMany([planEntry(`e-${start}`, taskId, 'u1', 'd1', start, start + minutes * MIN, '', T0, { mode, session: 1, plannedEndAt: null })])
}

async function seed() {
  const report = await createTask({ title: 'Write the report' })
  const inbox = await createTask({ title: 'Inbox zero' })
  await session(report, 'pomodoro', at(9), 25)
  await session(report, 'pomodoro', at(9, 30), 25)
  await session(inbox, 'flowtime', at(14), 40)
  // Yesterday's session is not today's.
  await session(inbox, 'flowtime', at(9) - 24 * 60 * MIN, 30)
  // Tracked from the task's Time tab: no focus_mode.
  await logTime(report, at(15), at(15, 20))
  return { report, inbox }
}

describe("Today's sessions", () => {
  it('Three sessions: "3 sessions · 1h 30m", newest first', async () => {
    await seed()
    const list = todaysSessions(await db.timeEntries.toArray() as TimeEntry[], await db.tasks.toArray(), 'u1', '2026-10-14', T0)
    expect(sessionsSummary(list)).toBe('3 sessions · 1h 30m')
    expect(list.map((s) => [s.title, s.mode, s.minutes])).toEqual([
      ['Inbox zero', 'flowtime', 40], ['Write the report', 'pomodoro', 25], ['Write the report', 'pomodoro', 25],
    ])
  })

  it('Other time entries are not sessions: the Time tab entry is left out', async () => {
    await seed()
    const list = todaysSessions(await db.timeEntries.toArray() as TimeEntry[], await db.tasks.toArray(), 'u1', '2026-10-14', T0)
    expect(list.some((s) => s.startedAt === at(15))).toBe(false)
    expect(todaysSessions(await db.timeEntries.toArray() as TimeEntry[], [], 'someone else', '2026-10-14', T0)).toEqual([])
  })

  it('Offline: the sheet lists the sessions from local rows; with none it says so in one sentence', async () => {
    const empty = await render(<FocusSessions onClose={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-focus-sessions-empty]'), 'empty sentence')
    expect(document.querySelector('[data-testid="focus-sessions"] button:not([data-overlay-close]):not([aria-label="Close"])')).toBeNull()
    await empty.unmount()
    await seed()
    const r = await render(<FocusSessions onClose={() => {}} />)
    await waitFor(() => document.querySelector('[data-focus-sessions-summary]')?.textContent === '3 sessions · 1h 30m', 'summary')
    const rows = [...document.querySelectorAll('[data-focus-session]')].map((x) => x.textContent)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Inbox zero')
    expect(rows[0]).toContain('Flowtime')
    expect(rows[0]).toContain('40m')
    await r.unmount()
  })
})
