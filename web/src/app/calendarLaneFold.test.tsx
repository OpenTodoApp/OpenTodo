// @vitest-environment happy-dom
// The unscheduled lane on a phone (GitHub issue 775, time-blocking "Unscheduled lane
// on a touch screen"): it folds behind a header with its count once it holds more
// than a few tasks, the choice kept on this device; the strips and lanes scroll in a
// capped region; the now line stays in the hour grid, below the sticky header.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { CalendarView } from './CalendarView'
import { LANE_FEW, LANE_FOLD_KEY, laneShape } from './calendar/laneFold'
import { resetPanel } from './panel'

const original = window.matchMedia
/** A phone: a coarse pointer and a 390 px window. */
function phone() {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('pointer: coarse') || q.includes('max-width'), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  window.matchMedia = original
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

describe('laneShape', () => {
  it('folds a long lane until the device chooses, and every lane after "closed"', () => {
    expect(laneShape(0, null)).toEqual({ toggle: false, open: true })
    expect(laneShape(LANE_FEW, null)).toEqual({ toggle: false, open: true })
    expect(laneShape(LANE_FEW + 1, null)).toEqual({ toggle: true, open: false })
    expect(laneShape(LANE_FEW + 1, 'open')).toEqual({ toggle: true, open: true })
    expect(laneShape(2, 'open')).toEqual({ toggle: false, open: true })
    expect(laneShape(1, 'closed')).toEqual({ toggle: true, open: false })
    expect(laneShape(0, 'closed')).toEqual({ toggle: false, open: true })
  })
})

describe('the unscheduled lane on a phone (issue 775)', () => {
  it('folds six tasks behind "Unscheduled 6", opens on a tap and remembers the choice', async () => {
    phone()
    for (let i = 0; i < 6; i++) await createTask({ title: `Loose ${i}`, due: { date: '2026-10-14' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => !!r.container.querySelector('[data-lane-toggle="2026-10-14"]'), 'the fold header')
    const toggle = r.container.querySelector<HTMLButtonElement>('[data-lane-toggle="2026-10-14"]')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('Unscheduled')
    expect(toggle.querySelector('[data-lane-count]')!.textContent).toBe('6')
    expect(r.container.querySelectorAll('[data-lane-task]')).toHaveLength(0)
    // Folded, the header is still inside the lane's drop target.
    expect(toggle.closest('[data-drop-lane="2026-10-14"]')).toBeTruthy()
    // The strips and lanes sit in one capped scroll region of the sticky header.
    const region = r.container.querySelector<HTMLElement>('[data-lane-region]')!
    expect(region.style.maxHeight).toContain('min(')
    expect(region.className).toContain('overflow-y-auto')

    await click(toggle)
    await waitFor(() => r.container.querySelectorAll('[data-lane-task]').length === 6, 'the rows shown')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(localStorage.getItem(LANE_FOLD_KEY)).toBe('open')
    await r.unmount()

    // Reopened on this device: still open.
    const again = await render(<CalendarView mode="day" />)
    await waitFor(() => again.container.querySelectorAll('[data-lane-task]').length === 6, 'open after a reload')
    await click(again.container.querySelector<HTMLButtonElement>('[data-lane-toggle]')!)
    await waitFor(() => again.container.querySelectorAll('[data-lane-task]').length === 0, 'folded again')
    expect(localStorage.getItem(LANE_FOLD_KEY)).toBe('closed')
    await again.unmount()
  })

  it('shows a short lane as rows with no header', async () => {
    phone()
    for (let i = 0; i < LANE_FEW; i++) await createTask({ title: `Loose ${i}`, due: { date: '2026-10-14' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelectorAll('[data-lane-task]').length === LANE_FEW)
    expect(r.container.querySelector('[data-lane-toggle]')).toBeNull()
    await r.unmount()
  })

  it('keeps the lane unfolded with a fine pointer on a wide window', async () => {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    for (let i = 0; i < 6; i++) await createTask({ title: `Loose ${i}`, due: { date: '2026-10-14' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => r.container.querySelectorAll('[data-lane-task]').length === 6)
    expect(r.container.querySelector('[data-lane-toggle]')).toBeNull()
    expect(r.container.querySelector('[data-lane-region]')).toBeNull()
    await r.unmount()
  })

  it('draws the now line inside the hour grid, its own layer below the sticky header', async () => {
    phone()
    await createTask({ title: 'Loose', due: { date: '2026-10-14' } })
    const r = await render(<CalendarView mode="day" />)
    await waitFor(() => !!r.container.querySelector('[data-now-line]'))
    const grid = r.container.querySelector('[data-calendar-grid]')!
    expect(grid.contains(r.container.querySelector('[data-now-line]'))).toBe(true)
    expect(grid.className).toContain('isolate')
    expect(grid.contains(r.container.querySelector('[data-drop-lane]'))).toBe(false)
    await r.unmount()
  })
})
