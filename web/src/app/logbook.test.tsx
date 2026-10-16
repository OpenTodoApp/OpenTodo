// @vitest-environment happy-dom
// Completed as a logbook (OpenSpec change completed-date-filters, tasks 2.1 and
// 2.2): grouped by local completion day, a page of 100 at a time, Show more.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resolveDateTime } from '../lib/dates'
import { LOGBOOK_PAGE, logbookGroups, logbookHeading } from '../lib/logbook'
import { mutateMany, resetDeviceId, setTaskCompleted, type Change } from '../lib/ops'
import type { Task } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { resetCollapsedGroups } from './collapsedGroups'
import { TaskListView } from './TaskListView'

/** Local-time Unix ms. */
const at = (iso: string, hour = 12, minute = 0) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).getTime()
}
const DM = resolveDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })

function task(id: string, completed_at: number | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0,
    completed_at, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

describe('logbookGroups and logbookHeading', () => {
  const today = '2026-10-16'
  it('groups by local completion day, newest first, skipping open and deleted tasks', () => {
    const tasks = [
      task('open', null),
      task('mon', at('2026-10-12', 9)),
      task('late-yesterday', at('2026-10-15', 23, 59)),
      task('early-today', at(today, 0, 1)),
      task('today', at(today, 10)),
      task('gone', at(today, 11), { deleted_at: at(today, 12) }),
    ]
    const { groups, total } = logbookGroups(tasks, LOGBOOK_PAGE)
    expect(total).toBe(4)
    expect(groups.map((g) => [g.date, g.tasks.map((t) => t.id)])).toEqual([
      ['2026-10-16', ['today', 'early-today']],
      ['2026-10-15', ['late-yesterday']],
      ['2026-10-12', ['mon']],
    ])
  })

  it('renders only the first `limit` completions but counts them all', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, at('2026-10-01', 8 + i)))
    const { groups, total } = logbookGroups(tasks, 2)
    expect(total).toBe(5)
    expect(groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['t4', 't3'])
  })

  it('heads days Today, Yesterday, weekday and date, with the year outside this year', () => {
    expect(logbookHeading(today, today, DM)).toBe('Today')
    expect(logbookHeading('2026-10-15', today, DM)).toBe('Yesterday')
    expect(logbookHeading('2026-10-12', today, DM)).toMatch(/12 Oct$/)
    expect(logbookHeading('2025-12-31', today, DM)).toMatch(/31 Dec 2025$/)
    expect(logbookHeading('2027-01-01', '2027-01-02', DM)).toBe('Yesterday')
  })
})

describe('Completed view', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0))
    await db.delete()
    await db.open()
    resetDeviceId()
    localStorage.clear()
    resetCollapsedGroups()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetCollapsedGroups()
    document.body.innerHTML = ''
  })

  async function waitFor(ok: () => boolean, ms = 10_000) {
    for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
    expect(ok()).toBe(true)
  }
  const headings = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-group-header] h2')].map((h) => h.textContent)
  const rows = (root: ParentNode) => root.querySelectorAll('[data-task-id]').length

  async function seed(times: number[]): Promise<void> {
    const changes: Change[] = times.map((ms, i) => ({
      entity: 'task', entityId: `t-${String(i).padStart(3, '0')}`,
      patch: { title: `Done ${i}`, priority: 4, labels: [], position: i, created_at: ms - 1000, completed_at: ms, deleted_at: null },
    }))
    await mutateMany(changes)
  }

  it('groups completions by day with counts', async () => {
    await seed([at('2026-10-16', 9), at('2026-10-16', 10), at('2026-10-15', 18), at('2026-10-12', 8)])
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => r.container.textContent!.includes('Done 3'))
    const hs = headings(r.container)
    expect(hs.slice(0, 2)).toEqual(['Today', 'Yesterday'])
    expect(hs).toHaveLength(3)
    expect([...r.container.querySelectorAll('[data-group-note]')].map((n) => n.textContent)).toEqual(['2 done', '1 done', '1 done'])
    expect(r.container.querySelector('[data-logbook-more]')).toBeNull()
    await r.unmount()
  })

  it('pages through 250 completions with Show more and follows a reopening', async () => {
    const base = at('2026-10-16', 11)
    await seed(Array.from({ length: 250 }, (_, i) => base - i * 3_600_000))
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => rows(r.container) === 100)
    const more = () => r.container.querySelector<HTMLButtonElement>('[data-logbook-more]')
    expect(more()!.textContent).toContain('150 older')
    await click(more()!)
    await waitFor(() => rows(r.container) === 200)
    expect(more()!.textContent).toContain('50 older')
    await click(more()!)
    await waitFor(() => rows(r.container) === 250)
    expect(more()).toBeNull()

    await setTaskCompleted('t-000', false)
    await waitFor(() => rows(r.container) === 249)
    expect(r.container.textContent).not.toContain('Done 0 ')
    await r.unmount()
  }, 30_000)
})
