// @vitest-environment happy-dom
// The Loop pulse (OpenSpec change loop-home-refresh; open-loops "Loop pulse").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../../lib/ops'
import { compute, periodFor } from '../../lib/stats'
import type { User } from '../../lib/types'
import { flush, render } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
// A Monday, so "this week" is today alone and "last week" is the seven days before.
const NOW = new Date(2026, 9, 19, 12, 0)
const DAY = 86_400_000

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  resetPanel()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const figure = (k: string) => document.querySelector<HTMLElement>(`[data-pulse="${k}"]`)!

/** A task created `createdAgo` days ago and, when given, completed `doneAgo` days ago (the clock moves, then comes back). */
async function seed(title: string, createdAgo: number, doneAgo: number | null, project: string | null = null) {
  vi.setSystemTime(new Date(NOW.getTime() - createdAgo * DAY))
  const id = await createTask({ title, project_id: project })
  if (doneAgo !== null) { vi.setSystemTime(new Date(NOW.getTime() - doneAgo * DAY)); await setTaskCompleted(id, true) }
  vi.setSystemTime(NOW)
  return id
}

describe('Loop pulse', () => {
  it('agrees with Statistics, counts what was decided, ages the Inbox and lists fourteen days', async () => {
    const garage = await createProject({ name: 'Garage' })
    // Done this week (today) and last week.
    for (let i = 0; i < 9; i++) await seed(`Done ${i}`, 20, 0, garage)
    for (let i = 0; i < 2; i++) await seed(`Last ${i}`, 20, 3, garage)
    // Caught in the last 14 days: 11 decided (project or done), 7 still in the Inbox, one deleted.
    for (let i = 0; i < 6; i++) await seed(`Placed ${i}`, i, null, garage)
    for (let i = 0; i < 5; i++) await seed(`Finished ${i}`, 2, 2)
    for (let i = 0; i < 6; i++) await seed(`Open ${i}`, i, null)
    await seed('Old open', 9, null)
    const gone = await seed('Gone', 2, null)
    await db.tasks.update(gone, { deleted_at: NOW.getTime() })
    navigate({ view: 'loop' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!figure('week'))
    const tasks = await db.tasks.toArray()
    const input = { tasks, projects: [], shared: new Set<string>(), me: 'u1', today: '2026-10-19' }
    // The same number whichever day the week starts on, as Statistics would show it.
    for (const weekStart of [0, 1]) expect(compute(input, periodFor('this-week', '2026-10-19', weekStart), weekStart).completed).toBe(9)
    expect(figure('week').textContent).toContain('9')
    expect(figure('week').textContent).toContain('+2 vs last week')
    expect(figure('decided').textContent).toContain('11')
    expect(figure('decided').textContent).toContain('of 18')
    expect(figure('age').textContent).toContain('9')
    expect(figure('age').textContent).toContain('older than a week')
    const values = [...document.querySelectorAll('[data-loop-strip-values] li')].map((li) => li.textContent)
    expect(values).toHaveLength(14)
    expect(values[13]).toContain('9 tasks')
    expect(values[10]).toContain('2 tasks')
    expect(values[11]).toContain('5 tasks')
    await r.unmount()
  })

  it('shows the Inbox as empty and no caution when nothing waits', async () => {
    const garage = await createProject({ name: 'Garage' })
    await seed('Placed', 1, null, garage)
    navigate({ view: 'loop' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!figure('age'))
    expect(figure('age').textContent).toContain('empty')
    expect(figure('age').textContent).toContain('nothing waiting')
    expect(figure('decided').textContent).toContain('1')
    expect(figure('decided').textContent).toContain('of 1')
    await r.unmount()
  })
})
