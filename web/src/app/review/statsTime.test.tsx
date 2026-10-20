// @vitest-environment happy-dom
// Tracked time in Statistics (OpenSpec change time-tracking, task 6.2): the
// figure, the two charts with durations, hidden without entries, and the device's
// CSV export of the period without a request.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { logTime } from '../../lib/timeEntries'
import { BOM } from '../../lib/time'
import { click, flush, render } from '../../ui/test-utils'
import { StatsView } from './StatsView'

const NOW = new Date(2026, 9, 14, 12, 0) // Wednesday 14 October 2026
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()
let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  localStorage.clear()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  fetchSpy = vi.fn(async () => new Response('{}', { status: 404 }))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const rowsOf = (fig: Element) => [...fig.querySelectorAll('table tbody tr')].map((tr) => [tr.querySelector('th')!.textContent, tr.querySelector('td')!.textContent])

describe('Statistics: time tracked', () => {
  it('Tracked per day and per project: "Client A 3h" and "Inbox 40m", durations in hours and minutes', async () => {
    const client = await createProject({ name: 'Client A' })
    const offer = await createTask({ title: 'Offer', project_id: client })
    const inbox = await createTask({ title: 'Call back' })
    await logTime(offer, at(12, 9), at(12, 12))
    await logTime(inbox, at(13, 9), at(13, 9, 40))
    const r = await render(<StatsView />)
    await waitFor(() => !!r.container.querySelector('[data-testid="stats-tracked"]'))
    expect(r.container.querySelector('[data-number="tracked"] dd')!.textContent).toBe('3h 40m')
    const perProject = r.container.querySelector('[data-chart="Tracked per project"]')!
    expect(rowsOf(perProject)).toEqual([['Client A', '3h'], ['Inbox', '40m']])
    const perDay = r.container.querySelector('[data-chart="Tracked per day"]')!
    expect(rowsOf(perDay).map((x) => x[1])).toEqual(['3h', '40m', '0m'])
    expect(perDay.querySelector('svg')!.getAttribute('aria-label')).toContain('3h 40m')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Nothing tracked: the figure reads 0m and the tracked charts are not shown', async () => {
    await createTask({ title: 'Idle' })
    const r = await render(<StatsView />)
    await waitFor(() => !!r.container.querySelector('[data-number="tracked"]'))
    expect(r.container.querySelector('[data-number="tracked"] dd')!.textContent).toBe('0m')
    expect(r.container.querySelector('[data-testid="stats-tracked"]')).toBeNull()
  })

  it('Export the last 4 weeks: a time-entries-<start>-<end>.csv with one row per entry, and no request', async () => {
    localStorage.setItem('ot.stats.period', '4-weeks')
    const offer = await createTask({ title: 'Offer' })
    await logTime(offer, at(1, 9), at(1, 10))
    await logTime(offer, at(13, 9), at(13, 9, 30), 'review, part 2')
    const blobs: Blob[] = []
    const names: string[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:x' }, revokeObjectURL: () => {} }))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
    const r = await render(<StatsView />)
    await waitFor(() => !!r.container.querySelector('[data-testid="stats-tracked"]'))
    await click(r.container.querySelector('[aria-label="More actions"]')!)
    await click(document.querySelector('[data-export-time]')!)
    await waitFor(() => names.length === 1)
    expect(names[0]).toBe('time-entries-2026-09-21-2026-10-14.csv')
    const text = await blobs[0].text()
    const lines = text.replace(BOM, '').trim().split('\r\n')
    expect(lines[0]).toBe('date,start,end,minutes,task,project,labels,note')
    expect(lines.slice(1)).toEqual(['2026-10-01,09:00,10:00,60,Offer,,,', '2026-10-13,09:00,09:30,30,Offer,,,"review, part 2"'])
    expect(fetchSpy).not.toHaveBeenCalled()
    clickSpy.mockRestore()
  })
})
