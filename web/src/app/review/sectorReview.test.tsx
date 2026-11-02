// @vitest-environment happy-dom
// Time sectors in Look ahead (OpenSpec change time-sectors, task 3.6): carried-over
// and Next week tasks below the seven days with their actions, n still parks, and
// nothing with the switch off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createTask, mutateMany, resetDeviceId } from '../../lib/ops'
import { setTimeSectors } from '../../lib/sectorPrefs'
import type { Task, User } from '../../lib/types'
import { click, key, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 8, 12, 0)) // Sunday of 2026-W45, Monday weeks
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const sectored = async (title: string, sector: string) => {
  const id = await createTask({ title })
  await mutateMany([{ entity: 'task', entityId: id, patch: { sector } }])
  return id
}
const section = (id: string) => document.querySelector(`[data-review-sectors="${id}"]`)
const task = async (id: string) => (await db.tasks.get(id)) as Task

describe('Look ahead with time sectors', () => {
  it('lists carried-over and next-week tasks; Next week moves one on; n parks one', async () => {
    await setTimeSectors(true)
    const a = await sectored('Sort the photos', '2026-W44')
    const b = await sectored('Clean the bikes', '2026-W44')
    await sectored('Book the venue', '2026-W46')
    navigate({ view: 'review', step: 'ahead' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!section('carried'), 'the carried-over section')
    expect(section('carried')!.textContent).toContain('Sort the photos')
    expect(section('next-week')!.textContent).toContain('Book the venue')
    const plan = [...section('carried')!.querySelectorAll('[role="group"]')].find((g) => g.getAttribute('aria-label')?.includes('Sort the photos'))!
    await click(plan.querySelector('[data-sector-action="next-week"]')!)
    await waitFor(async () => (await task(a)).sector === '2026-W46', 'moved to next week')

    // `n` parks the selected row, clearing its sector in the same batch.
    await waitFor(() => !section('carried')?.textContent?.includes('Sort the photos'), 'it left the section')
    await key(document.body, 'j')
    await key(document.body, 'n')
    await waitFor(async () => (await task(b)).start === 'someday', 'parked')
    expect((await task(b)).sector).toBe('')
    await r.unmount()
  })

  it('shows nothing with the switch off', async () => {
    await sectored('Sort the photos', '2026-W44')
    navigate({ view: 'review', step: 'ahead' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('#review-step-title'), 'the step')
    expect(document.querySelector('[data-review-sector-section]')).toBeNull()
    await r.unmount()
  })
})
