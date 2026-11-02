// @vitest-environment happy-dom
// Where a task with a time sector is listed and how its row reads (OpenSpec change
// time-sectors, task 3.1): not in Anytime, in Today only through its deadline, placed
// by its date when it has one, and the sector chip in the date slot, faint when
// carried over, turning to "From week 44" when the week ends, without a write.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { resetDeviceId } from '../lib/ops'
import { sectorLabel } from '../lib/sectorNames'
import type { Task } from '../lib/types'
import { inAnytime, inToday } from '../lib/views'
import { render, spokenText, visibleText } from '../ui/test-utils'
import { TaskRow } from './TaskRow'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => { vi.useRealTimers() })

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Draft the budget', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

describe('placement of a sectored task', () => {
  const today = '2026-10-28'
  it('is not an Anytime task', () => {
    expect(inAnytime(task({ sector: '2026-W44' }), today)).toBe(false)
    expect(inAnytime(task({}), today)).toBe(true)
  })

  it('is in Today only through its deadline', () => {
    expect(inToday(task({ sector: '2026-W44' }), today)).toBe(false)
    expect(inToday(task({ sector: '2026-W44', deadline: today }), today)).toBe(true)
  })

  it('is placed by its date when it has one', () => {
    expect(inToday(task({ sector: '2026-11', due: { date: today } }), today)).toBe(true)
  })
})

describe('the sector chip', () => {
  const row = (over: Partial<Task>) => render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)

  it('shows This week in the date slot of an undated task, and nothing for a dated one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    let r = await row({ sector: '2026-W44' })
    const chip = r.container.querySelector('[data-sector]')!
    expect(visibleText(chip)).toBe('This week')
    expect(spokenText(chip)).toContain('Time sector')
    await r.unmount()
    r = await row({ sector: '2026-W44', due: { date: '2026-10-30' } })
    expect(r.container.querySelector('[data-sector]')).toBeNull()
    await r.unmount()
  })

  it('reads From week 44 in the faint tone once the week has ended, with no op written', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 23, 0))
    expect(sectorLabel('2026-W44', '2026-11-01')?.text).toBe('This week')
    vi.setSystemTime(new Date(2026, 10, 2, 9, 0))
    const r = await row({ sector: '2026-W44' })
    const chip = r.container.querySelector('[data-sector]')!
    expect(visibleText(chip)).toBe('From week 44')
    expect(chip.className).toContain('text-faint')
    expect(chip.className).not.toContain('danger')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})
