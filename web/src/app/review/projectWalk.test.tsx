// @vitest-environment happy-dom
// The project walk with review intervals and Maintenance (OpenSpec change
// project-review-cadence, task 2.3): only due projects start in the walk, `e`
// chooses the interval, `m` puts the project in maintenance, and "Review them too"
// appends the projects that are not due.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createProject, mutate, resetDeviceId } from '../../lib/ops'
import type { User } from '../../lib/types'
import { key, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 12, 0)
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
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const card = () => document.querySelector<HTMLElement>('[data-walk-card]')

describe('Project walk with review intervals', () => {
  it('walks only due projects; e sets the interval, m puts it in maintenance, and Review them too adds the rest', async () => {
    const car = await createProject({ name: 'Car' })
    const garden = await createProject({ name: 'Garden' })
    await mutate('project_prefs', car, { reviewed_at: NOW.getTime() - 30 * DAY, review_every: 'quarter' })
    navigate({ view: 'review', step: 'projects' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!card())
    expect(card()!.getAttribute('data-walk-card')).toBe(garden)
    expect(document.querySelector('[data-walk-progress]')!.textContent).toBe('1 of 1')
    expect(document.querySelector('[data-walk-every]')!.textContent).toBe('Every week')

    // e opens the interval choices; picking one writes the personal pref and the card shows it.
    await key(document.body, 'e')
    await waitFor(() => !!document.querySelector('[data-action="review-every-month"]'))
    await act(async () => document.querySelector<HTMLElement>('[data-action="review-every-month"]')!.click())
    await waitFor(() => document.querySelector('[data-walk-every]')?.textContent === 'Every month')
    expect((await db.prefs.get(garden))?.review_every).toBe('month')
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project_prefs' && o.entityId === garden && o.field === 'review_every' && o.value === 'month')).toBe(true)

    // m puts it in maintenance (the owner may), shown on the card; the walk does not advance.
    await key(document.body, 'm')
    await waitFor(() => !!document.querySelector('[data-walk-maintenance]'))
    expect((await db.projects.get(garden))?.status).toBe('maintenance')
    expect(card()!.getAttribute('data-walk-card')).toBe(garden)

    // r stamps it; the end counts the project that is not due, and Review them too appends it.
    await key(document.body, 'r')
    await waitFor(() => !!document.querySelector('[data-walk-summary]'))
    expect(document.querySelector('[data-walk-rest]')!.textContent).toBe('1 not due yet')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-walk-rest-add]')!.click())
    await waitFor(() => card()?.getAttribute('data-walk-card') === car)
    expect(document.querySelector('[data-walk-progress]')!.textContent).toBe('2 of 2')
    expect(document.querySelector('[data-walk-every]')!.textContent).toBe('Every quarter')
    // Nothing was written by appending it.
    expect((await db.prefs.get(car))?.reviewed_at).toBe(NOW.getTime() - 30 * DAY)
    await r.unmount()
  })

  it('a paused project is counted apart', async () => {
    const old = await createProject({ name: 'Old ideas' })
    await createProject({ name: 'Garden' })
    await mutate('project_prefs', old, { review_every: 'paused' })
    navigate({ view: 'review', step: 'projects' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!card())
    await key(document.body, 'j')
    await waitFor(() => !!document.querySelector('[data-walk-rest]'))
    expect(document.querySelector('[data-walk-rest]')!.textContent).toBe('1 not due yet, 1 of them paused')
    await r.unmount()
  })
})
