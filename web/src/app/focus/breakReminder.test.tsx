// @vitest-environment happy-dom
// The break reminder (OpenSpec change focus-mode, task 5.1): off by default, a
// notice on any screen after the length of continuous work, "Take a break" stops
// the entry and runs the short break, "Not now" brings it back after the same
// length again.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask, mutate, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { FOCUS_DEFAULTS } from '../../lib/focus/prefs'
import { startSession } from '../../lib/focus/session'
import { readFocus } from '../../lib/focus/state'
import type { User } from '../../lib/types'
import { click, flush, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const T0 = new Date(2026, 9, 14, 9, 0).getTime()
const MIN = 60_000
const flowtime = { ...FOCUS_DEFAULTS, mode: 'flowtime' as const }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  await setCurrentUserId('u1')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'inbox' }, { replace: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

const notice = () => document.querySelector<HTMLElement>('[data-break-reminder]')
async function at(minutes: number) {
  vi.setSystemTime(T0 + minutes * MIN)
  window.dispatchEvent(new Event('focus'))
  await flush(40)
}
async function working(reminder?: number) {
  if (reminder !== undefined) await mutate('user_prefs', 'me', { focus_mode: 'flowtime', focus_break_after_minutes: reminder })
  else await mutate('user_prefs', 'me', { focus_mode: 'flowtime' })
  const task = await createTask({ title: 'Write the report' })
  await startSession(task, flowtime, T0)
  return render(<Shell user={user} onLogout={() => {}} />)
}

describe('break reminder', () => {
  it('Off by default: three hours of Flowtime and no notice', async () => {
    const r = await working()
    await at(180)
    expect(notice()).toBeNull()
    await r.unmount()
  })

  it('Reminder after 90 minutes: shown in the Inbox, both buttons reachable from the keyboard', async () => {
    const r = await working(90)
    await at(89)
    expect(notice()).toBeNull()
    await at(90)
    await waitFor(() => !!notice(), 'notice')
    expect(location.pathname).toBe('/')
    const buttons = [...notice()!.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Take a break', 'Not now'])
    expect(buttons.every((b) => b.tabIndex >= 0 && !b.disabled)).toBe(true)
    await r.unmount()
  })

  it('Take a break: the entry stops once and the short break runs', async () => {
    const r = await working(90)
    await at(90)
    await waitFor(() => !!notice(), 'notice')
    await click(notice()!.querySelector('[data-break-take]')!)
    await waitFor(async () => (await readFocus())?.phase === 'break', 'break')
    expect((await readFocus())?.plannedMs).toBe(5 * MIN)
    await waitFor(async () => (await db.timeEntries.toArray())[0]?.ended_at === T0 + 90 * MIN, 'entry stopped at 90 minutes')
    expect(await db.timeEntries.count()).toBe(1)
    await waitFor(() => !notice(), 'notice closed')
    await r.unmount()
  })

  it('Not now: the notice closes and comes back at 180 minutes', async () => {
    const r = await working(90)
    await at(90)
    await waitFor(() => !!notice(), 'notice')
    await click(notice()!.querySelector('[data-break-later]')!)
    await waitFor(() => !notice(), 'closed')
    await at(179)
    expect(notice()).toBeNull()
    await at(180)
    await waitFor(() => !!notice(), 'back at 180')
    await r.unmount()
  })
})
