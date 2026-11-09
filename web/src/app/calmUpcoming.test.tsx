// @vitest-environment happy-dom
// Calm Upcoming (OpenSpec change sidebar-brand-and-row-grid, design D8; builtin-view-options
// "Calm Upcoming"): with Later days Summarised (the default) the first three days with tasks
// are listed in full and each later day is one closed bar with its count and first titles,
// opened in place on this device; In full lists every day, synced as `user_prefs.upcoming_later`.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase as openDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { listDisplayOf } from '../lib/listDisplay'
import { applyOps, createTask, resetDeviceId } from '../lib/ops'
import type { Op } from '../lib/types'
import { upcomingLaterInFull } from '../lib/userPrefs'
import { click, key, mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { resetCollapsedGroups } from './collapsedGroups'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  mockFetch(noPublicLinks)
  openDatabase(`calm-upcoming-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCollapsedGroups()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetCollapsedGroups()
})

const day = (offset: number) => { const d = new Date(2026, 9, 14 + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const sections = () => [...document.querySelectorAll<HTMLElement>('section[data-group]')].filter((s) => s.querySelector('[data-group-header]'))
const bars = () => sections().filter((s) => s.hasAttribute('data-day-summary-bar'))
const rowsIn = (s: Element) => s.querySelectorAll('[data-task-id]').length
const panel = () => document.querySelector('[data-display-panel]')

/** Tasks on twelve of the next fourteen days: two on the first day, six on the sixth. */
async function fortnight() {
  for (let i = 1; i <= 14; i++) {
    if (i === 4 || i === 9) continue
    const count = i === 6 ? 6 : i === 1 ? 2 : 1
    const names = ['Dentist', 'Pay rent', 'Call Ana', 'Water', 'Post', 'Gym']
    for (let k = 0; k < count; k++) await createTask({ title: count > 1 ? names[k] : `Task ${i}`, due: { date: day(i) } })
  }
}
async function show() {
  const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
  mounted.push(r)
  await waitFor(() => sections().length >= 12, 'the days')
  return r
}

describe('Calm Upcoming', () => {
  it('A full fortnight: the first three days with tasks in full, each later day one closed bar with its count and first titles', async () => {
    await fortnight()
    await show()
    const all = sections()
    expect(all.slice(0, 3).every((s) => rowsIn(s) > 0 && !s.hasAttribute('data-day-summary-bar'))).toBe(true)
    expect(bars()).toHaveLength(9)
    for (const b of bars()) expect(rowsIn(b)).toBe(0)
    const sixth = bars().find((b) => b.querySelector('[data-group-count] [aria-hidden]')?.textContent === '6')!
    expect(sixth.querySelector('[data-day-summary]')!.textContent).toBe('Dentist, Pay rent, Call Ana…')
    expect(sixth.querySelector('[data-day-summary]')!.className).toContain('text-faint')
  })

  it('Open a day: Enter on its bar lists its six tasks, ← closes them again, the other bars stay closed, and nothing is written', async () => {
    await fortnight()
    await show()
    const before = await db.outbox.count()
    const sixth = () => bars().find((b) => b.querySelector('[data-group-count] [aria-hidden]')?.textContent === '6') ?? sections().find((s) => s.querySelector('[data-group-count] [aria-hidden]')?.textContent === '6')!
    const toggle = () => sixth().querySelector<HTMLButtonElement>('[data-group-toggle]')!
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    await click(toggle())
    await waitFor(() => rowsIn(sixth()) === 6, 'the day opens')
    expect(bars()).toHaveLength(8)
    await key(toggle(), 'ArrowLeft')
    await waitFor(() => rowsIn(sixth()) === 0, 'the day closes')
    await key(toggle(), 'ArrowRight')
    await waitFor(() => rowsIn(sixth()) === 6, 'and opens with →')
    // Device state only: no op for opening or closing.
    expect(await db.outbox.count()).toBe(before)
  })

  it('Drop on a closed day: the closed bar still takes a dragged task for its day', async () => {
    await fortnight()
    await show()
    const bar = bars()[0]
    expect(bar.getAttribute('data-task-drop')).toMatch(/^day:\d{4}-\d{2}-\d{2}$/)
  })

  it('Everything in full: In full in the display panel lists every day, as a synced preference', async () => {
    await fortnight()
    await show()
    await click(document.querySelector('[data-display-trigger]')!)
    await waitFor(() => !!panel(), 'the panel')
    const select = panel()!.querySelector<HTMLSelectElement>('select[aria-label="Later days"]')!
    expect(select.value).toBe('summary')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Summarised', 'In full'])
    await act(async () => { select.value = 'full'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await waitFor(() => bars().length === 0, 'every day in full')
    expect(((await db.userPrefs.get('me')) as unknown as Record<string, unknown>).upcoming_later).toBe('full')
    expect((await db.outbox.toArray()).filter((o) => o.field === 'upcoming_later')).toHaveLength(1)
  })

  it('Upcoming has no grouping: the panel shows Rows, Later days (Summarised), Order by and Nest subtasks, no Group by', async () => {
    await createTask({ title: 'Soon', due: { date: day(1) } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-task-id]'))
    await click(document.querySelector('[data-display-trigger]')!)
    await waitFor(() => !!panel(), 'the panel')
    const labels = [...panel()!.querySelectorAll('select')].map((s) => s.getAttribute('aria-label'))
    expect(labels.slice(0, 2)).toEqual(['Later days', 'Order by'])
    expect(labels).not.toContain('Group by')
    expect(panel()!.querySelector('[data-display-row-layout]')).not.toBeNull()
    expect(panel()!.querySelector('[data-display-subtasks]')).not.toBeNull()
  })
})

describe('upcoming_later on two devices', () => {
  let k = 0
  const op = (device: string, ts: number, value: string): Op => ({ id: `${device}-${k++}`, entity: 'user_prefs', entityId: 'me', field: 'upcoming_later', value, ts, device })
  async function stateOn(name: string, batches: Op[][]) {
    openDatabase(`upcoming-later-${name}-${Date.now()}`)
    for (const b of batches) await applyOps(b)
    const row = await db.userPrefs.get('me')
    return { full: upcomingLaterInFull(row), display: listDisplayOf('upcoming', row).laterInFull }
  }

  it('the laptop\'s In full and the phone\'s later Summarised converge by last-writer-wins in either order', async () => {
    const laptop = [op('laptop', 10, 'full')]
    const phone = [op('phone', 20, 'summary')]
    const a = await stateOn('a', [laptop, phone])
    const b = await stateOn('b', [phone, laptop])
    expect(a).toEqual({ full: false, display: false })
    expect(b).toEqual(a)
    const c = await stateOn('c', [[op('phone', 5, 'summary')], [op('laptop', 30, 'full')]])
    expect(c).toEqual({ full: true, display: true })
  })

  it('an empty or unknown value reads as Summarised', () => {
    for (const v of ['', 'weekly', undefined]) {
      expect(upcomingLaterInFull({ upcoming_later: v } as never)).toBe(false)
      expect(listDisplayOf('upcoming', { upcoming_later: v }).laterInFull).toBe(false)
    }
    expect(listDisplayOf('today', { upcoming_later: 'full' }).laterInFull).toBeUndefined()
  })
})
