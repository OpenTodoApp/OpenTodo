// @vitest-environment happy-dom
// useToday() and the Today view follow the day start (OpenSpec change
// day-boundary, task 2.2; date-time-preferences "Logical today", web-app
// "Preference synced in while open" and "Day start with the app open").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDayStart } from '../lib/dates'
import { applyOps, mutate, mutateMany, resetDeviceId, type Change } from '../lib/ops'
import { flush, render } from '../ui/test-utils'
import { resetCollapsedGroups } from './collapsedGroups'
import { DateTimePrefsProvider } from './DateTimePrefsProvider'
import { TaskListView } from './TaskListView'
import { useToday } from './useViews'

function Probe() {
  return <p data-testid="today">{useToday()}</p>
}

async function waitFor(ok: () => boolean, ms = 10_000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function seed() {
  const changes: Change[] = [['wed', '2026-10-14'], ['thu', '2026-10-15']].map(([id, date], i) => ({
    entity: 'task', entityId: id,
    patch: { title: `Due ${id}`, priority: 4, labels: [], position: i, created_at: 1, completed_at: null, deleted_at: null, due: { date } },
  }))
  await mutateMany(changes)
}

describe('useToday with a day start', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 15, 1, 30))
    await db.delete()
    await db.open()
    resetDeviceId()
    localStorage.clear()
    resetCollapsedGroups()
  })
  afterEach(() => {
    vi.useRealTimers()
    setDayStart(0)
    resetCollapsedGroups()
    document.body.innerHTML = ''
  })

  const overdue = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-group-header] h2')].some((h) => h.textContent!.startsWith('Earlier'))
  const listed = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-task-id]')].map((r) => r.dataset.taskId)

  it('moves Today to the previous date when the day start is written, without a reload, and rolls over at the day start', async () => {
    await seed()
    const r = await render(<DateTimePrefsProvider><Probe /><TaskListView route={{ view: 'today' }} /></DateTimePrefsProvider>)
    const today = () => r.container.querySelector('[data-testid="today"]')!.textContent
    await waitFor(() => listed(r.container).length === 2)
    // Midnight default: Thursday is today and Wednesday's task is overdue.
    expect(today()).toBe('2026-10-15')
    expect(overdue(r.container)).toBe(true)

    await act(async () => { await mutate('user_prefs', 'me', { day_start: '04:00' }) })
    await waitFor(() => today() === '2026-10-14')
    await waitFor(() => listed(r.container).join() === 'wed')
    expect(overdue(r.container)).toBe(false)

    // 04:00 passes with the app open: within a minute Thursday is today again.
    await act(async () => { vi.setSystemTime(new Date(2026, 9, 15, 4, 0, 30)); vi.advanceTimersByTime(60_000) })
    await waitFor(() => today() === '2026-10-15')
    await waitFor(() => listed(r.container).length === 2)
    expect(overdue(r.container)).toBe(true)
    await r.unmount()
  })

  it('follows a day start synced in from another device', async () => {
    const r = await render(<DateTimePrefsProvider><Probe /></DateTimePrefsProvider>)
    const today = () => r.container.querySelector('[data-testid="today"]')!.textContent
    await waitFor(() => today() === '2026-10-15')
    await act(async () => {
      await applyOps([{ id: 'remote', entity: 'user_prefs', entityId: 'me', field: 'day_start', value: '04:00', ts: Date.now() + 10_000, device: 'phone' }])
    })
    await waitFor(() => today() === '2026-10-14')
    // An invalid value from a newer client reads as midnight.
    await act(async () => {
      await applyOps([{ id: 'remote-2', entity: 'user_prefs', entityId: 'me', field: 'day_start', value: '09:00', ts: Date.now() + 20_000, device: 'phone' }])
    })
    await waitFor(() => today() === '2026-10-15')
    // Nothing was written by this device because of it.
    expect((await db.outbox.toArray()).filter((o) => o.entity !== 'user_prefs')).toEqual([])
    await r.unmount()
  })
})
