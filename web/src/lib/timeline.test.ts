import { describe, expect, it } from 'vitest'
import { axis, edges, shiftDates, spanOf } from './timeline'

const today = '2026-10-15'

describe('timeline bars (month-and-timeline-views D5)', () => {
  it('all three dates: from the start to the deadline with the due inside', () => {
    expect(spanOf({ start: '2026-11-03', due: { date: '2026-11-10' }, deadline: '2026-11-14' }, today)).toEqual({
      from: '2026-11-03', to: '2026-11-14', dueAt: '2026-11-10', deadlineAt: '2026-11-14', late: false, lateBy: 0,
    })
  })

  it('due only covers that day; nothing or someday is unscheduled; a past deadline is late', () => {
    expect(spanOf({ due: { date: '2026-11-10', time: '09:00' } }, today)).toMatchObject({ from: '2026-11-10', to: '2026-11-10' })
    expect(spanOf({ due: null }, today)).toBeNull()
    expect(spanOf({ start: 'someday', due: { date: '2026-11-10' }, deadline: '2026-11-14' }, today)).toBeNull()
    expect(spanOf({ due: null, deadline: '2026-10-01' }, today)?.late).toBe(true)
  })

  it('late is overdue (precision-boards-timeline D7): a passed deadline counts first, then a passed due day; a past start alone is not late', () => {
    expect(spanOf({ due: { date: '2026-10-13' } }, today)).toMatchObject({ late: true, lateBy: 2 })
    expect(spanOf({ due: { date: '2026-10-13' }, deadline: '2026-10-10' }, today)).toMatchObject({ late: true, lateBy: 5 })
    expect(spanOf({ due: { date: '2026-10-13' }, deadline: '2026-10-20' }, today)).toMatchObject({ late: true, lateBy: 2 })
    expect(spanOf({ start: '2026-10-10', due: null }, today)).toMatchObject({ late: false, lateBy: 0 })
    expect(spanOf({ due: { date: today } }, today)).toMatchObject({ late: false, lateBy: 0 })
  })

  it('a zoned due counts on the viewer day', () => {
    expect(spanOf({ due: { date: '2026-11-11', time: '07:00', tz: 'Asia/Tokyo' } }, today, 'Europe/Berlin')?.from).toBe('2026-11-10')
  })
})

describe('shiftDates (month-and-timeline-views D6)', () => {
  it('moves start and due by two days and keeps the due time; touches only present fields', () => {
    expect(shiftDates({ start: '2026-11-03', due: { date: '2026-11-10', time: '09:00' } }, 2)).toEqual({ start: '2026-11-05', due: { date: '2026-11-12', time: '09:00' } })
    expect(shiftDates({ due: null, deadline: '2026-11-14' }, -1)).toEqual({ deadline: '2026-11-13' })
    expect(shiftDates({ start: 'someday', due: null }, 3)).toEqual({})
  })

  it('keeps the zone of a zoned due', () => {
    const p = shiftDates({ due: { date: '2026-11-10', time: '09:00', tz: 'America/New_York' } }, 1, 'America/New_York')
    expect(p.due).toEqual({ date: '2026-11-11', time: '09:00', tz: 'America/New_York' })
  })
})

describe('axis and edges', () => {
  it('days, or weeks starting on the first day of the week', () => {
    const days = axis('2026-11-10', 'day')
    expect(days.columns[0]).toBe('2026-10-13')
    expect(days.columns).toHaveLength(28 + 84 + 1)
    const weeks = axis('2026-11-10', 'week', 0)
    expect(new Date(weeks.columns[0] + 'T00:00').getDay()).toBe(0)
    expect(weeks.columns[1]).toBe('2026-10-18')
  })

  it('draws arrows only between open rows', () => {
    const rows = [
      { id: 'confirm', blocked_by: [], completed_at: null, deleted_at: null },
      { id: 'book', blocked_by: ['confirm', 'elsewhere', 'done'], completed_at: null, deleted_at: null },
      { id: 'done', blocked_by: [], completed_at: 1, deleted_at: null },
    ]
    expect(edges(rows)).toEqual([{ from: 'confirm', to: 'book' }])
  })
})
